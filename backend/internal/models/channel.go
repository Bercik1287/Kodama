package models

import "time"

// Channel — kanał tekstowy lub głosowy w serwerze
type Channel struct {
	ID        int       `json:"id"`
	ServerID  int       `json:"server_id"`
	Name      string    `json:"name"`
	Type      string    `json:"type"` // "text", "voice"
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// Message — wiadomość w kanale tekstowym
type Message struct {
	ID        int       `json:"id"`
	ChannelID int       `json:"channel_id"`
	UserID    int       `json:"user_id"`
	Username  string    `json:"username"`
	Content   string    `json:"content"`
	CreatedAt time.Time `json:"created_at"`
}

// VoiceParticipant — uczestnik kanału głosowego (stan w pamięci, nie w DB)
type VoiceParticipant struct {
	UserID   int    `json:"user_id"`
	Username string `json:"username"`
	Muted    bool   `json:"muted"`
}

// Requesty

type CreateChannelRequest struct {
	Name string `json:"name"`
	Type string `json:"type"` // "text" lub "voice"
}

type SendMessageRequest struct {
	Content string `json:"content"`
}

type JoinVoiceRequest struct {
	ChannelID int `json:"channel_id"`
}

type MuteRequest struct {
	Muted bool `json:"muted"`
}
