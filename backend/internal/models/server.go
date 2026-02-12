package models

import "time"

type Server struct {
	ID         int       `json:"id"`
	Name       string    `json:"name"`
	OwnerID    int       `json:"owner_id"`
	InviteCode string    `json:"invite_code"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}

type ServerMember struct {
	ID       int       `json:"id"`
	ServerID int       `json:"server_id"`
	UserID   int       `json:"user_id"`
	Role     string    `json:"role"` // "owner", "member"
	JoinedAt time.Time `json:"joined_at"`
}

// Serwer z dodatkową informacją o roli użytkownika
type ServerWithRole struct {
	Server
	Role        string `json:"role"`
	MemberCount int    `json:"member_count"`
}

// Requesty

type CreateServerRequest struct {
	Name string `json:"name"`
}

type JoinServerRequest struct {
	InviteCode string `json:"invite_code"`
}

// Response

type ServerResponse struct {
	Server      Server `json:"server"`
	Role        string `json:"role"`
	MemberCount int    `json:"member_count"`
}

type InviteResponse struct {
	InviteCode string `json:"invite_code"`
}
