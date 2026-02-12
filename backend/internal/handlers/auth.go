package handlers

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"regexp"
	"strings"

	"kodama-backend/internal/auth"
	"kodama-backend/internal/models"

	"golang.org/x/crypto/bcrypt"
)

type AuthHandler struct {
	db *sql.DB
}

func NewAuthHandler(db *sql.DB) *AuthHandler {
	return &AuthHandler{db: db}
}

func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	var req models.RegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendError(w, http.StatusBadRequest, "Nieprawidłowe dane wejściowe")
		return
	}

	// Walidacja
	if err := validateRegisterRequest(req); err != nil {
		sendError(w, http.StatusBadRequest, err.Error())
		return
	}

	// Sprawdź czy email już istnieje
	var exists bool
	err := h.db.QueryRow("SELECT EXISTS(SELECT 1 FROM users WHERE email = $1)", req.Email).Scan(&exists)
	if err != nil {
		log.Printf("Błąd sprawdzania emaila: %v", err)
		sendError(w, http.StatusInternalServerError, "Błąd serwera")
		return
	}
	if exists {
		sendError(w, http.StatusConflict, "Użytkownik z tym adresem email już istnieje")
		return
	}

	// Hash hasła
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		log.Printf("Błąd hashowania hasła: %v", err)
		sendError(w, http.StatusInternalServerError, "Błąd serwera")
		return
	}

	// Wstawienie użytkownika
	var user models.User
	err = h.db.QueryRow(
		`INSERT INTO users (email, username, password_hash) 
		 VALUES ($1, $2, $3) 
		 RETURNING id, email, username, created_at, updated_at`,
		req.Email, req.Username, string(hashedPassword),
	).Scan(&user.ID, &user.Email, &user.Username, &user.CreatedAt, &user.UpdatedAt)

	if err != nil {
		log.Printf("Błąd tworzenia użytkownika: %v", err)
		sendError(w, http.StatusInternalServerError, "Nie można utworzyć użytkownika")
		return
	}

	// Generowanie tokena JWT
	token, err := auth.GenerateToken(user.ID, user.Email, user.Username)
	if err != nil {
		log.Printf("Błąd generowania tokena: %v", err)
		sendError(w, http.StatusInternalServerError, "Błąd serwera")
		return
	}

	sendJSON(w, http.StatusCreated, models.AuthResponse{
		Token: token,
		User:  user,
	})
}

func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req models.LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendError(w, http.StatusBadRequest, "Nieprawidłowe dane wejściowe")
		return
	}

	if req.Email == "" || req.Password == "" {
		sendError(w, http.StatusBadRequest, "Email i hasło są wymagane")
		return
	}

	// Pobranie użytkownika z bazy
	var user models.User
	err := h.db.QueryRow(
		`SELECT id, email, username, password_hash, created_at, updated_at 
		 FROM users WHERE email = $1`,
		req.Email,
	).Scan(&user.ID, &user.Email, &user.Username, &user.PasswordHash, &user.CreatedAt, &user.UpdatedAt)

	if err == sql.ErrNoRows {
		sendError(w, http.StatusUnauthorized, "Nieprawidłowy email lub hasło")
		return
	}
	if err != nil {
		log.Printf("Błąd pobierania użytkownika: %v", err)
		sendError(w, http.StatusInternalServerError, "Błąd serwera")
		return
	}

	// Weryfikacja hasła
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		sendError(w, http.StatusUnauthorized, "Nieprawidłowy email lub hasło")
		return
	}

	// Generowanie tokena JWT
	token, err := auth.GenerateToken(user.ID, user.Email, user.Username)
	if err != nil {
		log.Printf("Błąd generowania tokena: %v", err)
		sendError(w, http.StatusInternalServerError, "Błąd serwera")
		return
	}

	sendJSON(w, http.StatusOK, models.AuthResponse{
		Token: token,
		User:  user,
	})
}

func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	claims, ok := r.Context().Value("claims").(*auth.Claims)
	if !ok {
		sendError(w, http.StatusUnauthorized, "Brak autoryzacji")
		return
	}

	var user models.User
	err := h.db.QueryRow(
		`SELECT id, email, username, created_at, updated_at FROM users WHERE id = $1`,
		claims.UserID,
	).Scan(&user.ID, &user.Email, &user.Username, &user.CreatedAt, &user.UpdatedAt)

	if err != nil {
		log.Printf("Błąd pobierania użytkownika: %v", err)
		sendError(w, http.StatusInternalServerError, "Błąd serwera")
		return
	}

	sendJSON(w, http.StatusOK, user)
}

// Helpers

func validateRegisterRequest(req models.RegisterRequest) error {
	if req.Email == "" {
		return &validationError{"Email jest wymagany"}
	}
	if req.Username == "" {
		return &validationError{"Nazwa użytkownika jest wymagana"}
	}
	if req.Password == "" {
		return &validationError{"Hasło jest wymagane"}
	}
	if len(req.Password) < 8 {
		return &validationError{"Hasło musi mieć co najmniej 8 znaków"}
	}
	if len(req.Username) < 3 || len(req.Username) > 32 {
		return &validationError{"Nazwa użytkownika musi mieć od 3 do 32 znaków"}
	}

	emailRegex := regexp.MustCompile(`^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$`)
	if !emailRegex.MatchString(req.Email) {
		return &validationError{"Nieprawidłowy format adresu email"}
	}

	req.Email = strings.TrimSpace(strings.ToLower(req.Email))
	req.Username = strings.TrimSpace(req.Username)

	return nil
}

type validationError struct {
	message string
}

func (e *validationError) Error() string {
	return e.message
}

func sendJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func sendError(w http.ResponseWriter, status int, message string) {
	sendJSON(w, status, models.ErrorResponse{Error: message})
}

func decodeJSON(r *http.Request, v interface{}) error {
	return json.NewDecoder(r.Body).Decode(v)
}
