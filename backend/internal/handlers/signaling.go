package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"sync"

	"kodama-backend/internal/auth"
	"kodama-backend/internal/models"

	"github.com/gorilla/mux"
	"github.com/gorilla/websocket"
)

// ──────────────────────────────────────────────
// WebSocket signaling server for WebRTC voice
// ──────────────────────────────────────────────

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // CORS handled at HTTP level
	},
}

// SignalMessage — wiadomość sygnalizacyjna WebRTC
type SignalMessage struct {
	Type      string          `json:"type"`       // "offer", "answer", "ice-candidate", "join", "leave", "peer-joined", "peer-left", "mute-state"
	From      int             `json:"from"`       // user ID nadawcy
	To        int             `json:"to"`         // user ID odbiorcy (0 = broadcast)
	FromName  string          `json:"from_name"`  // username nadawcy
	Payload   json.RawMessage `json:"payload"`    // SDP offer/answer lub ICE candidate
	ChannelID int             `json:"channel_id"` // ID kanału głosowego
	Muted     bool            `json:"muted"`      // stan mikrofonu
}

// VoiceRoom — pokój głosowy (kanał)
type VoiceRoom struct {
	mu      sync.RWMutex
	clients map[int]*VoiceClient // userID -> client
}

// VoiceClient — klient podłączony do pokoju głosowego
type VoiceClient struct {
	UserID   int
	Username string
	Conn     *websocket.Conn
	Muted    bool
	mu       sync.Mutex
}

// SignalingHub — zarządza wszystkimi pokojami głosowymi
type SignalingHub struct {
	mu    sync.RWMutex
	rooms map[int]*VoiceRoom // channelID -> room
}

func NewSignalingHub() *SignalingHub {
	return &SignalingHub{
		rooms: make(map[int]*VoiceRoom),
	}
}

// getOrCreateRoom — pobiera lub tworzy pokój głosowy
func (h *SignalingHub) getOrCreateRoom(channelID int) *VoiceRoom {
	h.mu.Lock()
	defer h.mu.Unlock()

	room, ok := h.rooms[channelID]
	if !ok {
		room = &VoiceRoom{
			clients: make(map[int]*VoiceClient),
		}
		h.rooms[channelID] = room
	}
	return room
}

// removeFromRoom — usuwa klienta z pokoju
func (h *SignalingHub) removeFromRoom(channelID, userID int) {
	h.mu.Lock()
	defer h.mu.Unlock()

	room, ok := h.rooms[channelID]
	if !ok {
		return
	}
	room.mu.Lock()
	delete(room.clients, userID)
	empty := len(room.clients) == 0
	room.mu.Unlock()

	if empty {
		delete(h.rooms, channelID)
	}
}

// GetRoomParticipants — zwraca listę uczestników pokoju (dla REST API)
func (h *SignalingHub) GetRoomParticipants(channelID int) []map[string]interface{} {
	h.mu.RLock()
	room, ok := h.rooms[channelID]
	h.mu.RUnlock()

	participants := []map[string]interface{}{}
	if !ok {
		return participants
	}

	room.mu.RLock()
	defer room.mu.RUnlock()

	for _, c := range room.clients {
		participants = append(participants, map[string]interface{}{
			"user_id":  c.UserID,
			"username": c.Username,
			"muted":    c.Muted,
		})
	}
	return participants
}

// IsUserInChannel — sprawdza czy użytkownik jest w danym kanale
func (h *SignalingHub) IsUserInChannel(userID int) (int, bool) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	for channelID, room := range h.rooms {
		room.mu.RLock()
		_, exists := room.clients[userID]
		room.mu.RUnlock()
		if exists {
			return channelID, true
		}
	}
	return 0, false
}

// ──────────────────────────────────────────────
// WebSocket Handler
// ──────────────────────────────────────────────

type SignalingHandler struct {
	hub   *SignalingHub
	voice *VoiceState // stary VoiceState — zsynchronizujemy go
}

func NewSignalingHandler(hub *SignalingHub, voice *VoiceState) *SignalingHandler {
	return &SignalingHandler{hub: hub, voice: voice}
}

// HandleWebSocket — endpoint /api/ws/voice/{channelId}
func (sh *SignalingHandler) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	// Autoryzacja przez query parameter (WebSocket nie obsługuje nagłówków)
	tokenStr := r.URL.Query().Get("token")
	if tokenStr == "" {
		http.Error(w, "Brak tokenu", http.StatusUnauthorized)
		return
	}

	claims, err := auth.ValidateToken(tokenStr)
	if err != nil {
		http.Error(w, "Nieprawidłowy token", http.StatusUnauthorized)
		return
	}

	vars := mux.Vars(r)
	channelID, err := strconv.Atoi(vars["channelId"])
	if err != nil {
		http.Error(w, "Nieprawidłowe ID kanału", http.StatusBadRequest)
		return
	}

	// Upgrade HTTP → WebSocket
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade error: %v", err)
		return
	}
	defer conn.Close()

	client := &VoiceClient{
		UserID:   claims.UserID,
		Username: claims.Username,
		Conn:     conn,
		Muted:    false,
	}

	room := sh.hub.getOrCreateRoom(channelID)

	// Usuń z poprzedniego pokoju jeśli był
	if oldChannelID, exists := sh.hub.IsUserInChannel(claims.UserID); exists && oldChannelID != channelID {
		sh.removeClientFromRoom(oldChannelID, claims.UserID)
	}

	// Pobierz listę istniejących peerów PRZED dodaniem nowego
	room.mu.RLock()
	existingPeers := []map[string]interface{}{}
	for _, c := range room.clients {
		existingPeers = append(existingPeers, map[string]interface{}{
			"user_id":  c.UserID,
			"username": c.Username,
			"muted":    c.Muted,
		})
	}
	room.mu.RUnlock()

	// Dodaj klienta do pokoju
	room.mu.Lock()
	room.clients[claims.UserID] = client
	room.mu.Unlock()

	// Synchronizuj stary VoiceState
	sh.syncVoiceState(channelID, claims.UserID, claims.Username, true)

	// Wyślij nowemu klientowi listę istniejących peerów
	peersMsg, _ := json.Marshal(SignalMessage{
		Type:      "room-peers",
		ChannelID: channelID,
		Payload:   mustMarshal(existingPeers),
	})
	client.mu.Lock()
	client.Conn.WriteMessage(websocket.TextMessage, peersMsg)
	client.mu.Unlock()

	// Powiadom istniejących uczestników o nowym peerze
	sh.broadcastToRoom(channelID, claims.UserID, SignalMessage{
		Type:      "peer-joined",
		From:      claims.UserID,
		FromName:  claims.Username,
		ChannelID: channelID,
	})

	log.Printf("User %s (%d) joined voice channel %d", claims.Username, claims.UserID, channelID)

	// Pętla odczytu wiadomości
	for {
		_, rawMsg, err := conn.ReadMessage()
		if err != nil {
			break
		}

		var msg SignalMessage
		if err := json.Unmarshal(rawMsg, &msg); err != nil {
			continue
		}

		msg.From = claims.UserID
		msg.FromName = claims.Username
		msg.ChannelID = channelID

		switch msg.Type {
		case "offer", "answer", "ice-candidate":
			// Wyślij do konkretnego peera
			sh.sendToPeer(channelID, msg.To, msg)

		case "mute-state":
			// Zaktualizuj stan mute
			room.mu.Lock()
			if c, ok := room.clients[claims.UserID]; ok {
				c.Muted = msg.Muted
			}
			room.mu.Unlock()

			// Synchronizuj stary VoiceState
			sh.syncMuteState(channelID, claims.UserID, msg.Muted)

			// Broadcast do wszystkich
			sh.broadcastToRoom(channelID, 0, msg)
		}
	}

	// Klient się rozłączył
	log.Printf("User %s (%d) left voice channel %d", claims.Username, claims.UserID, channelID)
	sh.removeClientFromRoom(channelID, claims.UserID)

	// Powiadom pozostałych
	sh.broadcastToRoom(channelID, claims.UserID, SignalMessage{
		Type:      "peer-left",
		From:      claims.UserID,
		FromName:  claims.Username,
		ChannelID: channelID,
	})
}

// removeClientFromRoom — usuwa klienta i synchronizuje stan
func (sh *SignalingHandler) removeClientFromRoom(channelID, userID int) {
	sh.hub.removeFromRoom(channelID, userID)
	sh.syncVoiceState(channelID, userID, "", false)
}

// broadcastToRoom — wyślij wiadomość do wszystkich w pokoju (oprócz excludeUserID)
func (sh *SignalingHandler) broadcastToRoom(channelID, excludeUserID int, msg SignalMessage) {
	sh.hub.mu.RLock()
	room, ok := sh.hub.rooms[channelID]
	sh.hub.mu.RUnlock()
	if !ok {
		return
	}

	data, _ := json.Marshal(msg)

	room.mu.RLock()
	defer room.mu.RUnlock()

	for userID, client := range room.clients {
		if userID == excludeUserID {
			continue
		}
		client.mu.Lock()
		client.Conn.WriteMessage(websocket.TextMessage, data)
		client.mu.Unlock()
	}
}

// sendToPeer — wyślij wiadomość do konkretnego peera
func (sh *SignalingHandler) sendToPeer(channelID, toUserID int, msg SignalMessage) {
	sh.hub.mu.RLock()
	room, ok := sh.hub.rooms[channelID]
	sh.hub.mu.RUnlock()
	if !ok {
		return
	}

	room.mu.RLock()
	client, ok := room.clients[toUserID]
	room.mu.RUnlock()
	if !ok {
		return
	}

	data, _ := json.Marshal(msg)
	client.mu.Lock()
	client.Conn.WriteMessage(websocket.TextMessage, data)
	client.mu.Unlock()
}

// syncVoiceState — synchronizuj stary VoiceState REST API ze stanem WebSocket
func (sh *SignalingHandler) syncVoiceState(channelID, userID int, username string, joining bool) {
	sh.voice.mu.Lock()
	defer sh.voice.mu.Unlock()

	if joining {
		// Usuń z poprzedniego kanału
		if oldChannelID, exists := sh.voice.userChannel[userID]; exists {
			if participants, ok := sh.voice.channels[oldChannelID]; ok {
				delete(participants, userID)
				if len(participants) == 0 {
					delete(sh.voice.channels, oldChannelID)
				}
			}
		}

		if sh.voice.channels[channelID] == nil {
			sh.voice.channels[channelID] = make(map[int]*models.VoiceParticipant)
		}
		sh.voice.channels[channelID][userID] = &models.VoiceParticipant{
			UserID:   userID,
			Username: username,
			Muted:    false,
		}
		sh.voice.userChannel[userID] = channelID
	} else {
		if participants, ok := sh.voice.channels[channelID]; ok {
			delete(participants, userID)
			if len(participants) == 0 {
				delete(sh.voice.channels, channelID)
			}
		}
		delete(sh.voice.userChannel, userID)
	}
}

// syncMuteState — synchronizuj stan mute
func (sh *SignalingHandler) syncMuteState(channelID, userID int, muted bool) {
	sh.voice.mu.Lock()
	defer sh.voice.mu.Unlock()

	if participants, ok := sh.voice.channels[channelID]; ok {
		if p, ok := participants[userID]; ok {
			p.Muted = muted
		}
	}
}

func mustMarshal(v interface{}) json.RawMessage {
	data, _ := json.Marshal(v)
	return data
}
