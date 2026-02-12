package handlers

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"log"
	"net/http"
	"strconv"
	"strings"

	"kodama-backend/internal/auth"
	"kodama-backend/internal/models"

	"github.com/gorilla/mux"
)

type ServerHandler struct {
	db *sql.DB
}

func NewServerHandler(db *sql.DB) *ServerHandler {
	return &ServerHandler{db: db}
}

// generateInviteCode generuje losowy kod zaproszenia
func generateInviteCode() (string, error) {
	bytes := make([]byte, 5)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return hex.EncodeToString(bytes), nil
}

// getClaims wyciąga claims z kontekstu requesta
func getClaims(r *http.Request) (*auth.Claims, bool) {
	claims, ok := r.Context().Value("claims").(*auth.Claims)
	return claims, ok
}

// CreateServer – tworzenie nowego serwera, twórca zostaje właścicielem
func (h *ServerHandler) CreateServer(w http.ResponseWriter, r *http.Request) {
	claims, ok := getClaims(r)
	if !ok {
		sendError(w, http.StatusUnauthorized, "Brak autoryzacji")
		return
	}

	var req models.CreateServerRequest
	if err := decodeJSON(r, &req); err != nil {
		sendError(w, http.StatusBadRequest, "Nieprawidłowe dane wejściowe")
		return
	}

	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		sendError(w, http.StatusBadRequest, "Nazwa serwera jest wymagana")
		return
	}
	if len(req.Name) < 2 || len(req.Name) > 100 {
		sendError(w, http.StatusBadRequest, "Nazwa serwera musi mieć od 2 do 100 znaków")
		return
	}

	inviteCode, err := generateInviteCode()
	if err != nil {
		log.Printf("Błąd generowania kodu zaproszenia: %v", err)
		sendError(w, http.StatusInternalServerError, "Błąd serwera")
		return
	}

	tx, err := h.db.Begin()
	if err != nil {
		log.Printf("Błąd transakcji: %v", err)
		sendError(w, http.StatusInternalServerError, "Błąd serwera")
		return
	}
	defer tx.Rollback()

	// Utwórz serwer
	var server models.Server
	err = tx.QueryRow(
		`INSERT INTO servers (name, owner_id, invite_code)
		 VALUES ($1, $2, $3)
		 RETURNING id, name, owner_id, invite_code, created_at, updated_at`,
		req.Name, claims.UserID, inviteCode,
	).Scan(&server.ID, &server.Name, &server.OwnerID, &server.InviteCode, &server.CreatedAt, &server.UpdatedAt)

	if err != nil {
		log.Printf("Błąd tworzenia serwera: %v", err)
		sendError(w, http.StatusInternalServerError, "Nie można utworzyć serwera")
		return
	}

	// Dodaj twórcę jako członka z rolą "owner"
	_, err = tx.Exec(
		`INSERT INTO server_members (server_id, user_id, role)
		 VALUES ($1, $2, 'owner')`,
		server.ID, claims.UserID,
	)
	if err != nil {
		log.Printf("Błąd dodawania właściciela do serwera: %v", err)
		sendError(w, http.StatusInternalServerError, "Błąd serwera")
		return
	}

	if err := tx.Commit(); err != nil {
		log.Printf("Błąd commita transakcji: %v", err)
		sendError(w, http.StatusInternalServerError, "Błąd serwera")
		return
	}

	sendJSON(w, http.StatusCreated, models.ServerResponse{
		Server:      server,
		Role:        "owner",
		MemberCount: 1,
	})
}

// ListServers – lista serwerów do których użytkownik dołączył
func (h *ServerHandler) ListServers(w http.ResponseWriter, r *http.Request) {
	claims, ok := getClaims(r)
	if !ok {
		sendError(w, http.StatusUnauthorized, "Brak autoryzacji")
		return
	}

	rows, err := h.db.Query(
		`SELECT s.id, s.name, s.owner_id, s.invite_code, s.created_at, s.updated_at,
		        sm.role,
		        (SELECT COUNT(*) FROM server_members WHERE server_id = s.id) as member_count
		 FROM servers s
		 JOIN server_members sm ON sm.server_id = s.id AND sm.user_id = $1
		 ORDER BY s.created_at DESC`,
		claims.UserID,
	)
	if err != nil {
		log.Printf("Błąd pobierania serwerów: %v", err)
		sendError(w, http.StatusInternalServerError, "Błąd serwera")
		return
	}
	defer rows.Close()

	servers := []models.ServerResponse{}
	for rows.Next() {
		var resp models.ServerResponse
		err := rows.Scan(
			&resp.Server.ID, &resp.Server.Name, &resp.Server.OwnerID,
			&resp.Server.InviteCode, &resp.Server.CreatedAt, &resp.Server.UpdatedAt,
			&resp.Role, &resp.MemberCount,
		)
		if err != nil {
			log.Printf("Błąd skanowania serwera: %v", err)
			continue
		}
		servers = append(servers, resp)
	}

	sendJSON(w, http.StatusOK, servers)
}

// JoinServer – dołączanie do serwera przez kod zaproszenia
func (h *ServerHandler) JoinServer(w http.ResponseWriter, r *http.Request) {
	claims, ok := getClaims(r)
	if !ok {
		sendError(w, http.StatusUnauthorized, "Brak autoryzacji")
		return
	}

	var req models.JoinServerRequest
	if err := decodeJSON(r, &req); err != nil {
		sendError(w, http.StatusBadRequest, "Nieprawidłowe dane wejściowe")
		return
	}

	req.InviteCode = strings.TrimSpace(req.InviteCode)
	if req.InviteCode == "" {
		sendError(w, http.StatusBadRequest, "Kod zaproszenia jest wymagany")
		return
	}

	// Znajdź serwer po kodzie zaproszenia
	var server models.Server
	err := h.db.QueryRow(
		`SELECT id, name, owner_id, invite_code, created_at, updated_at
		 FROM servers WHERE invite_code = $1`,
		req.InviteCode,
	).Scan(&server.ID, &server.Name, &server.OwnerID, &server.InviteCode, &server.CreatedAt, &server.UpdatedAt)

	if err == sql.ErrNoRows {
		sendError(w, http.StatusNotFound, "Nie znaleziono serwera z tym kodem zaproszenia")
		return
	}
	if err != nil {
		log.Printf("Błąd szukania serwera: %v", err)
		sendError(w, http.StatusInternalServerError, "Błąd serwera")
		return
	}

	// Sprawdź czy użytkownik jest już członkiem
	var alreadyMember bool
	err = h.db.QueryRow(
		`SELECT EXISTS(SELECT 1 FROM server_members WHERE server_id = $1 AND user_id = $2)`,
		server.ID, claims.UserID,
	).Scan(&alreadyMember)
	if err != nil {
		log.Printf("Błąd sprawdzania członkostwa: %v", err)
		sendError(w, http.StatusInternalServerError, "Błąd serwera")
		return
	}
	if alreadyMember {
		sendError(w, http.StatusConflict, "Jesteś już członkiem tego serwera")
		return
	}

	// Dołącz do serwera
	_, err = h.db.Exec(
		`INSERT INTO server_members (server_id, user_id, role) VALUES ($1, $2, 'member')`,
		server.ID, claims.UserID,
	)
	if err != nil {
		log.Printf("Błąd dołączania do serwera: %v", err)
		sendError(w, http.StatusInternalServerError, "Nie można dołączyć do serwera")
		return
	}

	// Pobierz liczbę członków
	var memberCount int
	h.db.QueryRow(`SELECT COUNT(*) FROM server_members WHERE server_id = $1`, server.ID).Scan(&memberCount)

	sendJSON(w, http.StatusOK, models.ServerResponse{
		Server:      server,
		Role:        "member",
		MemberCount: memberCount,
	})
}

// GetServer – szczegóły serwera (tylko dla członków)
func (h *ServerHandler) GetServer(w http.ResponseWriter, r *http.Request) {
	claims, ok := getClaims(r)
	if !ok {
		sendError(w, http.StatusUnauthorized, "Brak autoryzacji")
		return
	}

	vars := mux.Vars(r)
	serverID, err := strconv.Atoi(vars["id"])
	if err != nil {
		sendError(w, http.StatusBadRequest, "Nieprawidłowe ID serwera")
		return
	}

	// Sprawdź członkostwo i pobierz dane
	var resp models.ServerResponse
	err = h.db.QueryRow(
		`SELECT s.id, s.name, s.owner_id, s.invite_code, s.created_at, s.updated_at,
		        sm.role,
		        (SELECT COUNT(*) FROM server_members WHERE server_id = s.id) as member_count
		 FROM servers s
		 JOIN server_members sm ON sm.server_id = s.id AND sm.user_id = $1
		 WHERE s.id = $2`,
		claims.UserID, serverID,
	).Scan(
		&resp.Server.ID, &resp.Server.Name, &resp.Server.OwnerID,
		&resp.Server.InviteCode, &resp.Server.CreatedAt, &resp.Server.UpdatedAt,
		&resp.Role, &resp.MemberCount,
	)

	if err == sql.ErrNoRows {
		sendError(w, http.StatusNotFound, "Serwer nie znaleziony lub brak dostępu")
		return
	}
	if err != nil {
		log.Printf("Błąd pobierania serwera: %v", err)
		sendError(w, http.StatusInternalServerError, "Błąd serwera")
		return
	}

	sendJSON(w, http.StatusOK, resp)
}

// GetServerMembers – lista członków serwera
func (h *ServerHandler) GetServerMembers(w http.ResponseWriter, r *http.Request) {
	claims, ok := getClaims(r)
	if !ok {
		sendError(w, http.StatusUnauthorized, "Brak autoryzacji")
		return
	}

	vars := mux.Vars(r)
	serverID, err := strconv.Atoi(vars["id"])
	if err != nil {
		sendError(w, http.StatusBadRequest, "Nieprawidłowe ID serwera")
		return
	}

	// Sprawdź czy użytkownik jest członkiem serwera
	var isMember bool
	h.db.QueryRow(
		`SELECT EXISTS(SELECT 1 FROM server_members WHERE server_id = $1 AND user_id = $2)`,
		serverID, claims.UserID,
	).Scan(&isMember)

	if !isMember {
		sendError(w, http.StatusForbidden, "Nie jesteś członkiem tego serwera")
		return
	}

	rows, err := h.db.Query(
		`SELECT u.id, u.username, u.email, sm.role, sm.joined_at
		 FROM server_members sm
		 JOIN users u ON u.id = sm.user_id
		 WHERE sm.server_id = $1
		 ORDER BY sm.joined_at ASC`,
		serverID,
	)
	if err != nil {
		log.Printf("Błąd pobierania członków: %v", err)
		sendError(w, http.StatusInternalServerError, "Błąd serwera")
		return
	}
	defer rows.Close()

	type MemberInfo struct {
		ID       int    `json:"id"`
		Username string `json:"username"`
		Email    string `json:"email"`
		Role     string `json:"role"`
		JoinedAt string `json:"joined_at"`
	}

	members := []MemberInfo{}
	for rows.Next() {
		var m MemberInfo
		if err := rows.Scan(&m.ID, &m.Username, &m.Email, &m.Role, &m.JoinedAt); err != nil {
			log.Printf("Błąd skanowania członka: %v", err)
			continue
		}
		members = append(members, m)
	}

	sendJSON(w, http.StatusOK, members)
}

// LeaveServer – opuszczenie serwera (właściciel nie może opuścić)
func (h *ServerHandler) LeaveServer(w http.ResponseWriter, r *http.Request) {
	claims, ok := getClaims(r)
	if !ok {
		sendError(w, http.StatusUnauthorized, "Brak autoryzacji")
		return
	}

	vars := mux.Vars(r)
	serverID, err := strconv.Atoi(vars["id"])
	if err != nil {
		sendError(w, http.StatusBadRequest, "Nieprawidłowe ID serwera")
		return
	}

	// Sprawdź czy użytkownik jest właścicielem
	var ownerID int
	err = h.db.QueryRow(`SELECT owner_id FROM servers WHERE id = $1`, serverID).Scan(&ownerID)
	if err == sql.ErrNoRows {
		sendError(w, http.StatusNotFound, "Serwer nie znaleziony")
		return
	}
	if err != nil {
		log.Printf("Błąd sprawdzania właściciela: %v", err)
		sendError(w, http.StatusInternalServerError, "Błąd serwera")
		return
	}

	if ownerID == claims.UserID {
		sendError(w, http.StatusForbidden, "Właściciel nie może opuścić serwera. Usuń serwer zamiast tego.")
		return
	}

	result, err := h.db.Exec(
		`DELETE FROM server_members WHERE server_id = $1 AND user_id = $2`,
		serverID, claims.UserID,
	)
	if err != nil {
		log.Printf("Błąd opuszczania serwera: %v", err)
		sendError(w, http.StatusInternalServerError, "Błąd serwera")
		return
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		sendError(w, http.StatusNotFound, "Nie jesteś członkiem tego serwera")
		return
	}

	sendJSON(w, http.StatusOK, map[string]string{"message": "Opuszczono serwer"})
}

// DeleteServer – usunięcie serwera (tylko właściciel)
func (h *ServerHandler) DeleteServer(w http.ResponseWriter, r *http.Request) {
	claims, ok := getClaims(r)
	if !ok {
		sendError(w, http.StatusUnauthorized, "Brak autoryzacji")
		return
	}

	vars := mux.Vars(r)
	serverID, err := strconv.Atoi(vars["id"])
	if err != nil {
		sendError(w, http.StatusBadRequest, "Nieprawidłowe ID serwera")
		return
	}

	// Sprawdź czy użytkownik jest właścicielem
	var ownerID int
	err = h.db.QueryRow(`SELECT owner_id FROM servers WHERE id = $1`, serverID).Scan(&ownerID)
	if err == sql.ErrNoRows {
		sendError(w, http.StatusNotFound, "Serwer nie znaleziony")
		return
	}
	if err != nil {
		log.Printf("Błąd sprawdzania właściciela: %v", err)
		sendError(w, http.StatusInternalServerError, "Błąd serwera")
		return
	}

	if ownerID != claims.UserID {
		sendError(w, http.StatusForbidden, "Tylko właściciel może usunąć serwer")
		return
	}

	_, err = h.db.Exec(`DELETE FROM servers WHERE id = $1`, serverID)
	if err != nil {
		log.Printf("Błąd usuwania serwera: %v", err)
		sendError(w, http.StatusInternalServerError, "Nie można usunąć serwera")
		return
	}

	sendJSON(w, http.StatusOK, map[string]string{"message": "Serwer został usunięty"})
}

// RegenerateInvite – generowanie nowego kodu zaproszenia (tylko właściciel)
func (h *ServerHandler) RegenerateInvite(w http.ResponseWriter, r *http.Request) {
	claims, ok := getClaims(r)
	if !ok {
		sendError(w, http.StatusUnauthorized, "Brak autoryzacji")
		return
	}

	vars := mux.Vars(r)
	serverID, err := strconv.Atoi(vars["id"])
	if err != nil {
		sendError(w, http.StatusBadRequest, "Nieprawidłowe ID serwera")
		return
	}

	// Sprawdź czy użytkownik jest właścicielem
	var ownerID int
	err = h.db.QueryRow(`SELECT owner_id FROM servers WHERE id = $1`, serverID).Scan(&ownerID)
	if err == sql.ErrNoRows {
		sendError(w, http.StatusNotFound, "Serwer nie znaleziony")
		return
	}
	if ownerID != claims.UserID {
		sendError(w, http.StatusForbidden, "Tylko właściciel może generować nowe zaproszenia")
		return
	}

	newCode, err := generateInviteCode()
	if err != nil {
		log.Printf("Błąd generowania kodu: %v", err)
		sendError(w, http.StatusInternalServerError, "Błąd serwera")
		return
	}

	_, err = h.db.Exec(
		`UPDATE servers SET invite_code = $1, updated_at = NOW() WHERE id = $2`,
		newCode, serverID,
	)
	if err != nil {
		log.Printf("Błąd aktualizacji kodu zaproszenia: %v", err)
		sendError(w, http.StatusInternalServerError, "Błąd serwera")
		return
	}

	sendJSON(w, http.StatusOK, models.InviteResponse{InviteCode: newCode})
}
