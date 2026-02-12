package handlers

import (
	"database/sql"
	"log"
	"net/http"
	"strconv"
	"strings"
	"sync"

	"kodama-backend/internal/models"

	"github.com/gorilla/mux"
)

type ChannelHandler struct {
	db    *sql.DB
	voice *VoiceState
}

// VoiceState — stan kanałów głosowych w pamięci (single source of truth)
type VoiceState struct {
	mu sync.RWMutex
	// channelID -> userID -> participant
	channels map[int]map[int]*models.VoiceParticipant
	// userID -> channelID (użytkownik może być na jednym kanale naraz)
	userChannel map[int]int
}

func NewVoiceState() *VoiceState {
	return &VoiceState{
		channels:    make(map[int]map[int]*models.VoiceParticipant),
		userChannel: make(map[int]int),
	}
}

func NewChannelHandler(db *sql.DB, voice *VoiceState) *ChannelHandler {
	return &ChannelHandler{db: db, voice: voice}
}

// requireServerMembership sprawdza czy użytkownik jest członkiem serwera
func (h *ChannelHandler) requireServerMembership(userID, serverID int) bool {
	var exists bool
	h.db.QueryRow(
		`SELECT EXISTS(SELECT 1 FROM server_members WHERE server_id = $1 AND user_id = $2)`,
		serverID, userID,
	).Scan(&exists)
	return exists
}

// requireServerOwnership sprawdza czy użytkownik jest właścicielem serwera
func (h *ChannelHandler) requireServerOwnership(userID, serverID int) bool {
	var ownerID int
	err := h.db.QueryRow(`SELECT owner_id FROM servers WHERE id = $1`, serverID).Scan(&ownerID)
	if err != nil {
		return false
	}
	return ownerID == userID
}

// ──────────────────────────────────────────────
// Kanały — CRUD
// ──────────────────────────────────────────────

// CreateChannel — tworzenie kanału tekstowego lub głosowego
func (h *ChannelHandler) CreateChannel(w http.ResponseWriter, r *http.Request) {
	claims, ok := getClaims(r)
	if !ok {
		sendError(w, http.StatusUnauthorized, "Brak autoryzacji")
		return
	}

	vars := mux.Vars(r)
	serverID, err := strconv.Atoi(vars["serverId"])
	if err != nil {
		sendError(w, http.StatusBadRequest, "Nieprawidłowe ID serwera")
		return
	}

	if !h.requireServerMembership(claims.UserID, serverID) {
		sendError(w, http.StatusForbidden, "Nie jesteś członkiem tego serwera")
		return
	}

	var req models.CreateChannelRequest
	if err := decodeJSON(r, &req); err != nil {
		sendError(w, http.StatusBadRequest, "Nieprawidłowe dane wejściowe")
		return
	}

	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		sendError(w, http.StatusBadRequest, "Nazwa kanału jest wymagana")
		return
	}
	if len(req.Name) < 1 || len(req.Name) > 100 {
		sendError(w, http.StatusBadRequest, "Nazwa kanału musi mieć od 1 do 100 znaków")
		return
	}

	req.Type = strings.TrimSpace(strings.ToLower(req.Type))
	if req.Type != "text" && req.Type != "voice" {
		sendError(w, http.StatusBadRequest, "Typ kanału musi być 'text' lub 'voice'")
		return
	}

	var channel models.Channel
	err = h.db.QueryRow(
		`INSERT INTO channels (server_id, name, type)
		 VALUES ($1, $2, $3)
		 RETURNING id, server_id, name, type, created_at, updated_at`,
		serverID, req.Name, req.Type,
	).Scan(&channel.ID, &channel.ServerID, &channel.Name, &channel.Type, &channel.CreatedAt, &channel.UpdatedAt)

	if err != nil {
		log.Printf("Błąd tworzenia kanału: %v", err)
		sendError(w, http.StatusInternalServerError, "Nie można utworzyć kanału")
		return
	}

	sendJSON(w, http.StatusCreated, channel)
}

// ListChannels — lista kanałów serwera
func (h *ChannelHandler) ListChannels(w http.ResponseWriter, r *http.Request) {
	claims, ok := getClaims(r)
	if !ok {
		sendError(w, http.StatusUnauthorized, "Brak autoryzacji")
		return
	}

	vars := mux.Vars(r)
	serverID, err := strconv.Atoi(vars["serverId"])
	if err != nil {
		sendError(w, http.StatusBadRequest, "Nieprawidłowe ID serwera")
		return
	}

	if !h.requireServerMembership(claims.UserID, serverID) {
		sendError(w, http.StatusForbidden, "Nie jesteś członkiem tego serwera")
		return
	}

	rows, err := h.db.Query(
		`SELECT id, server_id, name, type, created_at, updated_at
		 FROM channels WHERE server_id = $1
		 ORDER BY type ASC, created_at ASC`,
		serverID,
	)
	if err != nil {
		log.Printf("Błąd pobierania kanałów: %v", err)
		sendError(w, http.StatusInternalServerError, "Błąd serwera")
		return
	}
	defer rows.Close()

	channels := []models.Channel{}
	for rows.Next() {
		var ch models.Channel
		if err := rows.Scan(&ch.ID, &ch.ServerID, &ch.Name, &ch.Type, &ch.CreatedAt, &ch.UpdatedAt); err != nil {
			log.Printf("Błąd skanowania kanału: %v", err)
			continue
		}
		channels = append(channels, ch)
	}

	sendJSON(w, http.StatusOK, channels)
}

// DeleteChannel — usunięcie kanału (tylko właściciel serwera)
func (h *ChannelHandler) DeleteChannel(w http.ResponseWriter, r *http.Request) {
	claims, ok := getClaims(r)
	if !ok {
		sendError(w, http.StatusUnauthorized, "Brak autoryzacji")
		return
	}

	vars := mux.Vars(r)
	serverID, err := strconv.Atoi(vars["serverId"])
	if err != nil {
		sendError(w, http.StatusBadRequest, "Nieprawidłowe ID serwera")
		return
	}
	channelID, err := strconv.Atoi(vars["channelId"])
	if err != nil {
		sendError(w, http.StatusBadRequest, "Nieprawidłowe ID kanału")
		return
	}

	if !h.requireServerOwnership(claims.UserID, serverID) {
		sendError(w, http.StatusForbidden, "Tylko właściciel serwera może usuwać kanały")
		return
	}

	// Sprawdź czy kanał należy do serwera
	var exists bool
	h.db.QueryRow(
		`SELECT EXISTS(SELECT 1 FROM channels WHERE id = $1 AND server_id = $2)`,
		channelID, serverID,
	).Scan(&exists)
	if !exists {
		sendError(w, http.StatusNotFound, "Kanał nie znaleziony")
		return
	}

	// Usuń uczestników voice jeśli to kanał głosowy
	h.voice.mu.Lock()
	if participants, ok := h.voice.channels[channelID]; ok {
		for uid := range participants {
			delete(h.voice.userChannel, uid)
		}
		delete(h.voice.channels, channelID)
	}
	h.voice.mu.Unlock()

	_, err = h.db.Exec(`DELETE FROM channels WHERE id = $1`, channelID)
	if err != nil {
		log.Printf("Błąd usuwania kanału: %v", err)
		sendError(w, http.StatusInternalServerError, "Nie można usunąć kanału")
		return
	}

	sendJSON(w, http.StatusOK, map[string]string{"message": "Kanał został usunięty"})
}

// ──────────────────────────────────────────────
// Wiadomości tekstowe
// ──────────────────────────────────────────────

// GetMessages — historia wiadomości kanału tekstowego
func (h *ChannelHandler) GetMessages(w http.ResponseWriter, r *http.Request) {
	claims, ok := getClaims(r)
	if !ok {
		sendError(w, http.StatusUnauthorized, "Brak autoryzacji")
		return
	}

	vars := mux.Vars(r)
	serverID, err := strconv.Atoi(vars["serverId"])
	if err != nil {
		sendError(w, http.StatusBadRequest, "Nieprawidłowe ID serwera")
		return
	}
	channelID, err := strconv.Atoi(vars["channelId"])
	if err != nil {
		sendError(w, http.StatusBadRequest, "Nieprawidłowe ID kanału")
		return
	}

	if !h.requireServerMembership(claims.UserID, serverID) {
		sendError(w, http.StatusForbidden, "Nie jesteś członkiem tego serwera")
		return
	}

	// Sprawdź czy kanał jest tekstowy i należy do serwera
	var chType string
	err = h.db.QueryRow(
		`SELECT type FROM channels WHERE id = $1 AND server_id = $2`,
		channelID, serverID,
	).Scan(&chType)
	if err == sql.ErrNoRows {
		sendError(w, http.StatusNotFound, "Kanał nie znaleziony")
		return
	}
	if chType != "text" {
		sendError(w, http.StatusBadRequest, "To nie jest kanał tekstowy")
		return
	}

	// Paginacja — limit i before (cursor)
	limit := 50
	if l := r.URL.Query().Get("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 && parsed <= 100 {
			limit = parsed
		}
	}

	var rows *sql.Rows
	beforeID := r.URL.Query().Get("before")
	if beforeID != "" {
		bid, err := strconv.Atoi(beforeID)
		if err != nil {
			sendError(w, http.StatusBadRequest, "Nieprawidłowy parametr 'before'")
			return
		}
		rows, err = h.db.Query(
			`SELECT m.id, m.channel_id, m.user_id, u.username, m.content, m.created_at
			 FROM messages m
			 JOIN users u ON u.id = m.user_id
			 WHERE m.channel_id = $1 AND m.id < $2
			 ORDER BY m.created_at DESC
			 LIMIT $3`,
			channelID, bid, limit,
		)
	} else {
		rows, err = h.db.Query(
			`SELECT m.id, m.channel_id, m.user_id, u.username, m.content, m.created_at
			 FROM messages m
			 JOIN users u ON u.id = m.user_id
			 WHERE m.channel_id = $1
			 ORDER BY m.created_at DESC
			 LIMIT $2`,
			channelID, limit,
		)
	}

	if err != nil {
		log.Printf("Błąd pobierania wiadomości: %v", err)
		sendError(w, http.StatusInternalServerError, "Błąd serwera")
		return
	}
	defer rows.Close()

	messages := []models.Message{}
	for rows.Next() {
		var m models.Message
		if err := rows.Scan(&m.ID, &m.ChannelID, &m.UserID, &m.Username, &m.Content, &m.CreatedAt); err != nil {
			log.Printf("Błąd skanowania wiadomości: %v", err)
			continue
		}
		messages = append(messages, m)
	}

	// Odwróć kolejność — najstarsze pierwsze
	for i, j := 0, len(messages)-1; i < j; i, j = i+1, j-1 {
		messages[i], messages[j] = messages[j], messages[i]
	}

	sendJSON(w, http.StatusOK, messages)
}

// SendMessage — wysłanie wiadomości na kanał tekstowy
func (h *ChannelHandler) SendMessage(w http.ResponseWriter, r *http.Request) {
	claims, ok := getClaims(r)
	if !ok {
		sendError(w, http.StatusUnauthorized, "Brak autoryzacji")
		return
	}

	vars := mux.Vars(r)
	serverID, err := strconv.Atoi(vars["serverId"])
	if err != nil {
		sendError(w, http.StatusBadRequest, "Nieprawidłowe ID serwera")
		return
	}
	channelID, err := strconv.Atoi(vars["channelId"])
	if err != nil {
		sendError(w, http.StatusBadRequest, "Nieprawidłowe ID kanału")
		return
	}

	if !h.requireServerMembership(claims.UserID, serverID) {
		sendError(w, http.StatusForbidden, "Nie jesteś członkiem tego serwera")
		return
	}

	// Sprawdź czy kanał tekstowy i należy do serwera
	var chType string
	err = h.db.QueryRow(
		`SELECT type FROM channels WHERE id = $1 AND server_id = $2`,
		channelID, serverID,
	).Scan(&chType)
	if err == sql.ErrNoRows {
		sendError(w, http.StatusNotFound, "Kanał nie znaleziony")
		return
	}
	if chType != "text" {
		sendError(w, http.StatusBadRequest, "To nie jest kanał tekstowy")
		return
	}

	var req models.SendMessageRequest
	if err := decodeJSON(r, &req); err != nil {
		sendError(w, http.StatusBadRequest, "Nieprawidłowe dane wejściowe")
		return
	}

	req.Content = strings.TrimSpace(req.Content)
	if req.Content == "" {
		sendError(w, http.StatusBadRequest, "Treść wiadomości jest wymagana")
		return
	}
	if len(req.Content) > 2000 {
		sendError(w, http.StatusBadRequest, "Wiadomość nie może przekraczać 2000 znaków")
		return
	}

	var msg models.Message
	err = h.db.QueryRow(
		`INSERT INTO messages (channel_id, user_id, content)
		 VALUES ($1, $2, $3)
		 RETURNING id, channel_id, user_id, content, created_at`,
		channelID, claims.UserID, req.Content,
	).Scan(&msg.ID, &msg.ChannelID, &msg.UserID, &msg.Content, &msg.CreatedAt)

	if err != nil {
		log.Printf("Błąd wysyłania wiadomości: %v", err)
		sendError(w, http.StatusInternalServerError, "Nie można wysłać wiadomości")
		return
	}

	msg.Username = claims.Username

	sendJSON(w, http.StatusCreated, msg)
}

// ──────────────────────────────────────────────
// Kanały głosowe
// ──────────────────────────────────────────────

// JoinVoiceChannel — dołącz do kanału głosowego
func (h *ChannelHandler) JoinVoiceChannel(w http.ResponseWriter, r *http.Request) {
	claims, ok := getClaims(r)
	if !ok {
		sendError(w, http.StatusUnauthorized, "Brak autoryzacji")
		return
	}

	vars := mux.Vars(r)
	serverID, err := strconv.Atoi(vars["serverId"])
	if err != nil {
		sendError(w, http.StatusBadRequest, "Nieprawidłowe ID serwera")
		return
	}
	channelID, err := strconv.Atoi(vars["channelId"])
	if err != nil {
		sendError(w, http.StatusBadRequest, "Nieprawidłowe ID kanału")
		return
	}

	if !h.requireServerMembership(claims.UserID, serverID) {
		sendError(w, http.StatusForbidden, "Nie jesteś członkiem tego serwera")
		return
	}

	// Sprawdź czy kanał głosowy i należy do serwera
	var chType string
	err = h.db.QueryRow(
		`SELECT type FROM channels WHERE id = $1 AND server_id = $2`,
		channelID, serverID,
	).Scan(&chType)
	if err == sql.ErrNoRows {
		sendError(w, http.StatusNotFound, "Kanał nie znaleziony")
		return
	}
	if chType != "voice" {
		sendError(w, http.StatusBadRequest, "To nie jest kanał głosowy")
		return
	}

	h.voice.mu.Lock()
	defer h.voice.mu.Unlock()

	// Jeśli użytkownik jest już na innym kanale — opuść go
	if oldChannelID, exists := h.voice.userChannel[claims.UserID]; exists {
		if participants, ok := h.voice.channels[oldChannelID]; ok {
			delete(participants, claims.UserID)
			if len(participants) == 0 {
				delete(h.voice.channels, oldChannelID)
			}
		}
	}

	// Dołącz do nowego kanału
	if h.voice.channels[channelID] == nil {
		h.voice.channels[channelID] = make(map[int]*models.VoiceParticipant)
	}

	participant := &models.VoiceParticipant{
		UserID:   claims.UserID,
		Username: claims.Username,
		Muted:    false,
	}
	h.voice.channels[channelID][claims.UserID] = participant
	h.voice.userChannel[claims.UserID] = channelID

	// Zwróć listę uczestników
	participants := h.getParticipantsList(channelID)
	sendJSON(w, http.StatusOK, participants)
}

// LeaveVoiceChannel — opuść kanał głosowy
func (h *ChannelHandler) LeaveVoiceChannel(w http.ResponseWriter, r *http.Request) {
	claims, ok := getClaims(r)
	if !ok {
		sendError(w, http.StatusUnauthorized, "Brak autoryzacji")
		return
	}

	h.voice.mu.Lock()
	defer h.voice.mu.Unlock()

	channelID, exists := h.voice.userChannel[claims.UserID]
	if !exists {
		sendError(w, http.StatusBadRequest, "Nie jesteś na żadnym kanale głosowym")
		return
	}

	if participants, ok := h.voice.channels[channelID]; ok {
		delete(participants, claims.UserID)
		if len(participants) == 0 {
			delete(h.voice.channels, channelID)
		}
	}
	delete(h.voice.userChannel, claims.UserID)

	sendJSON(w, http.StatusOK, map[string]string{"message": "Opuszczono kanał głosowy"})
}

// GetVoiceParticipants — lista uczestników kanału głosowego
func (h *ChannelHandler) GetVoiceParticipants(w http.ResponseWriter, r *http.Request) {
	claims, ok := getClaims(r)
	if !ok {
		sendError(w, http.StatusUnauthorized, "Brak autoryzacji")
		return
	}

	vars := mux.Vars(r)
	serverID, err := strconv.Atoi(vars["serverId"])
	if err != nil {
		sendError(w, http.StatusBadRequest, "Nieprawidłowe ID serwera")
		return
	}
	channelID, err := strconv.Atoi(vars["channelId"])
	if err != nil {
		sendError(w, http.StatusBadRequest, "Nieprawidłowe ID kanału")
		return
	}

	if !h.requireServerMembership(claims.UserID, serverID) {
		sendError(w, http.StatusForbidden, "Nie jesteś członkiem tego serwera")
		return
	}

	h.voice.mu.RLock()
	defer h.voice.mu.RUnlock()

	participants := h.getParticipantsList(channelID)
	sendJSON(w, http.StatusOK, participants)
}

// ToggleMute — wycisz/odcisz mikrofon
func (h *ChannelHandler) ToggleMute(w http.ResponseWriter, r *http.Request) {
	claims, ok := getClaims(r)
	if !ok {
		sendError(w, http.StatusUnauthorized, "Brak autoryzacji")
		return
	}

	var req models.MuteRequest
	if err := decodeJSON(r, &req); err != nil {
		sendError(w, http.StatusBadRequest, "Nieprawidłowe dane wejściowe")
		return
	}

	h.voice.mu.Lock()
	defer h.voice.mu.Unlock()

	channelID, exists := h.voice.userChannel[claims.UserID]
	if !exists {
		sendError(w, http.StatusBadRequest, "Nie jesteś na żadnym kanale głosowym")
		return
	}

	if participants, ok := h.voice.channels[channelID]; ok {
		if p, ok := participants[claims.UserID]; ok {
			p.Muted = req.Muted
		}
	}

	participants := h.getParticipantsList(channelID)
	sendJSON(w, http.StatusOK, participants)
}

// GetMyVoiceState — pobierz aktualny stan głosowy użytkownika
func (h *ChannelHandler) GetMyVoiceState(w http.ResponseWriter, r *http.Request) {
	claims, ok := getClaims(r)
	if !ok {
		sendError(w, http.StatusUnauthorized, "Brak autoryzacji")
		return
	}

	h.voice.mu.RLock()
	defer h.voice.mu.RUnlock()

	channelID, exists := h.voice.userChannel[claims.UserID]
	if !exists {
		sendJSON(w, http.StatusOK, map[string]interface{}{
			"in_channel": false,
		})
		return
	}

	var muted bool
	if participants, ok := h.voice.channels[channelID]; ok {
		if p, ok := participants[claims.UserID]; ok {
			muted = p.Muted
		}
	}

	sendJSON(w, http.StatusOK, map[string]interface{}{
		"in_channel": true,
		"channel_id": channelID,
		"muted":      muted,
	})
}

// helper
func (h *ChannelHandler) getParticipantsList(channelID int) []models.VoiceParticipant {
	participants := []models.VoiceParticipant{}
	if pMap, ok := h.voice.channels[channelID]; ok {
		for _, p := range pMap {
			participants = append(participants, *p)
		}
	}
	return participants
}

// GetVoiceState zwraca globalny VoiceState (do użytku przez inne handlery)
func (h *ChannelHandler) GetVoiceState() *VoiceState {
	return h.voice
}
