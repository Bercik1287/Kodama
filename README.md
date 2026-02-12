# Kodama

Aplikacja głosowo-tekstowa inspirowana Discordem.

## Stack technologiczny

- **Frontend:** React + TypeScript + Vite + Zustand
- **Backend:** Go + Gorilla Mux + JWT + bcrypt
- **Baza danych:** PostgreSQL
- **Infrastruktura:** Docker Compose

## Uruchomienie (deweloperskie)

### Wymagania
- Docker + Docker Compose
- Node.js 20+ (do dewelopmentu frontendu)
- Go 1.23+ (do dewelopmentu backendu)

### Szybki start z Docker Compose

```bash
docker compose up --build
```

Aplikacja będzie dostępna:
- Frontend: http://localhost:3000
- Backend API: http://localhost:8080
- PostgreSQL: localhost:5432

### Rozwój lokalny

#### Backend
```bash
cd backend
go mod tidy
go run ./cmd/server
```

#### Frontend
```bash
cd frontend
npm install
npm run dev
```

Frontend deweloperski działa na http://localhost:5173 z proxy do backendu.

## API Endpoints

| Metoda | Endpoint | Opis | Autoryzacja |
|--------|----------|------|-------------|
| POST | `/api/auth/register` | Rejestracja | ❌ |
| POST | `/api/auth/login` | Logowanie | ❌ |
| GET | `/api/me` | Dane użytkownika | ✅ JWT |
| GET | `/api/health` | Healthcheck | ❌ |

### Rejestracja
```json
POST /api/auth/register
{
  "email": "jan@example.com",
  "username": "jan",
  "password": "haslo123"
}
```

### Logowanie
```json
POST /api/auth/login
{
  "email": "jan@example.com",
  "password": "haslo123"
}
```

### Odpowiedź (rejestracja/logowanie)
```json
{
  "token": "eyJhbGciOiJI...",
  "user": {
    "id": 1,
    "email": "jan@example.com",
    "username": "jan",
    "created_at": "2026-02-12T10:00:00Z",
    "updated_at": "2026-02-12T10:00:00Z"
  }
}
```
