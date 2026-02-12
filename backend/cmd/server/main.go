package main

import (
	"log"
	"net/http"
	"os"

	"kodama-backend/internal/database"
	"kodama-backend/internal/handlers"
	"kodama-backend/internal/middleware"

	"github.com/gorilla/mux"
	"github.com/rs/cors"
)

func main() {
	// Połączenie z bazą danych
	db, err := database.Connect()
	if err != nil {
		log.Fatalf("Nie można połączyć z bazą danych: %v", err)
	}
	defer db.Close()

	// Migracje
	if err := database.RunMigrations(db); err != nil {
		log.Fatalf("Błąd migracji: %v", err)
	}

	log.Println("Migracje zakończone pomyślnie")

	// Router
	r := mux.NewRouter()

	// Handlers
	authHandler := handlers.NewAuthHandler(db)
	serverHandler := handlers.NewServerHandler(db)
	voiceState := handlers.NewVoiceState()
	channelHandler := handlers.NewChannelHandler(db, voiceState)
	signalingHub := handlers.NewSignalingHub()
	signalingHandler := handlers.NewSignalingHandler(signalingHub, voiceState)

	// Publiczne endpointy
	r.HandleFunc("/api/auth/register", authHandler.Register).Methods("POST")
	r.HandleFunc("/api/auth/login", authHandler.Login).Methods("POST")

	// Healthcheck
	r.HandleFunc("/api/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"ok"}`))
	}).Methods("GET")

	// Chronione endpointy
	protected := r.PathPrefix("/api").Subrouter()
	protected.Use(middleware.AuthMiddleware)
	protected.HandleFunc("/me", authHandler.Me).Methods("GET")

	// Serwery
	protected.HandleFunc("/servers", serverHandler.CreateServer).Methods("POST")
	protected.HandleFunc("/servers", serverHandler.ListServers).Methods("GET")
	protected.HandleFunc("/servers/join", serverHandler.JoinServer).Methods("POST")
	protected.HandleFunc("/servers/{id:[0-9]+}", serverHandler.GetServer).Methods("GET")
	protected.HandleFunc("/servers/{id:[0-9]+}", serverHandler.DeleteServer).Methods("DELETE")
	protected.HandleFunc("/servers/{id:[0-9]+}/members", serverHandler.GetServerMembers).Methods("GET")
	protected.HandleFunc("/servers/{id:[0-9]+}/leave", serverHandler.LeaveServer).Methods("POST")
	protected.HandleFunc("/servers/{id:[0-9]+}/invite", serverHandler.RegenerateInvite).Methods("POST")

	// Kanały
	protected.HandleFunc("/servers/{serverId:[0-9]+}/channels", channelHandler.CreateChannel).Methods("POST")
	protected.HandleFunc("/servers/{serverId:[0-9]+}/channels", channelHandler.ListChannels).Methods("GET")
	protected.HandleFunc("/servers/{serverId:[0-9]+}/channels/{channelId:[0-9]+}", channelHandler.DeleteChannel).Methods("DELETE")

	// Wiadomości tekstowe
	protected.HandleFunc("/servers/{serverId:[0-9]+}/channels/{channelId:[0-9]+}/messages", channelHandler.GetMessages).Methods("GET")
	protected.HandleFunc("/servers/{serverId:[0-9]+}/channels/{channelId:[0-9]+}/messages", channelHandler.SendMessage).Methods("POST")

	// Kanały głosowe (REST — stan)
	protected.HandleFunc("/servers/{serverId:[0-9]+}/channels/{channelId:[0-9]+}/voice/join", channelHandler.JoinVoiceChannel).Methods("POST")
	protected.HandleFunc("/servers/{serverId:[0-9]+}/channels/{channelId:[0-9]+}/voice/participants", channelHandler.GetVoiceParticipants).Methods("GET")
	protected.HandleFunc("/voice/leave", channelHandler.LeaveVoiceChannel).Methods("POST")
	protected.HandleFunc("/voice/mute", channelHandler.ToggleMute).Methods("POST")
	protected.HandleFunc("/voice/state", channelHandler.GetMyVoiceState).Methods("GET")

	// WebSocket signaling (WebRTC voice) — auth przez query param ?token=
	r.HandleFunc("/api/ws/voice/{channelId:[0-9]+}", signalingHandler.HandleWebSocket)

	// CORS
	allowedOrigins := []string{"http://localhost:5173", "http://localhost:3000"}
	if corsOrigin := os.Getenv("CORS_ORIGIN"); corsOrigin != "" {
		allowedOrigins = append(allowedOrigins, corsOrigin)
	}

	c := cors.New(cors.Options{
		AllowedOrigins:   allowedOrigins,
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Authorization", "Content-Type"},
		AllowCredentials: true,
	})

	handler := c.Handler(r)

	// Uruchomienie serwera
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("Serwer uruchomiony na porcie %s", port)
	if err := http.ListenAndServe(":"+port, handler); err != nil {
		log.Fatalf("Błąd serwera: %v", err)
	}
}
