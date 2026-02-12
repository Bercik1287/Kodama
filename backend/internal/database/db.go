package database

import (
	"database/sql"
	"log"

	"kodama-backend/internal/config"

	_ "github.com/lib/pq"
)

func Connect() (*sql.DB, error) {
	cfg := config.Load()

	db, err := sql.Open("postgres", cfg.DatabaseURL)
	if err != nil {
		return nil, err
	}

	if err := db.Ping(); err != nil {
		return nil, err
	}

	log.Println("Połączono z bazą danych PostgreSQL")
	return db, nil
}

func RunMigrations(db *sql.DB) error {
	query := `
	CREATE TABLE IF NOT EXISTS users (
		id SERIAL PRIMARY KEY,
		email VARCHAR(255) UNIQUE NOT NULL,
		username VARCHAR(100) NOT NULL,
		password_hash VARCHAR(255) NOT NULL,
		created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
		updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
	);

	CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
	CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

	CREATE TABLE IF NOT EXISTS servers (
		id SERIAL PRIMARY KEY,
		name VARCHAR(100) NOT NULL,
		owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		invite_code VARCHAR(20) UNIQUE NOT NULL,
		created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
		updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
	);

	CREATE INDEX IF NOT EXISTS idx_servers_owner ON servers(owner_id);
	CREATE UNIQUE INDEX IF NOT EXISTS idx_servers_invite_code ON servers(invite_code);

	CREATE TABLE IF NOT EXISTS server_members (
		id SERIAL PRIMARY KEY,
		server_id INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
		user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		role VARCHAR(20) NOT NULL DEFAULT 'member',
		joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
		UNIQUE(server_id, user_id)
	);

	CREATE INDEX IF NOT EXISTS idx_server_members_server ON server_members(server_id);
	CREATE INDEX IF NOT EXISTS idx_server_members_user ON server_members(user_id);

	CREATE TABLE IF NOT EXISTS channels (
		id SERIAL PRIMARY KEY,
		server_id INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
		name VARCHAR(100) NOT NULL,
		type VARCHAR(10) NOT NULL DEFAULT 'text' CHECK (type IN ('text', 'voice')),
		created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
		updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
	);

	CREATE INDEX IF NOT EXISTS idx_channels_server ON channels(server_id);

	CREATE TABLE IF NOT EXISTS messages (
		id SERIAL PRIMARY KEY,
		channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
		user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		content TEXT NOT NULL,
		created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
	);

	CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel_id);
	CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(channel_id, created_at DESC);
	`

	_, err := db.Exec(query)
	return err
}
