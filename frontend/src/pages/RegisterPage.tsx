import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import '../styles/auth.css';

function RegisterPage() {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const { register, isLoading, error, clearError } = useAuthStore();
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    if (password !== confirmPassword) {
      setLocalError('Hasła nie są identyczne');
      return;
    }

    if (password.length < 8) {
      setLocalError('Hasło musi mieć co najmniej 8 znaków');
      return;
    }

    if (username.length < 3 || username.length > 32) {
      setLocalError('Nazwa użytkownika musi mieć od 3 do 32 znaków');
      return;
    }

    try {
      await register({ email, username, password });
    } catch {
      // Error is handled by the store
    }
  };

  const displayError = localError || error;

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-logo">
          <span className="logo-icon">K</span>
          <h1>Kodama</h1>
        </div>
        <div className="auth-title">
          <h2>Utwórz konto</h2>
          <p>Dołącz do Kodama już teraz</p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          {displayError && <div className="auth-error">{displayError}</div>}

          <div className="form-group">
            <label htmlFor="email">Adres e-mail</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                clearError();
                setLocalError(null);
              }}
              placeholder="jan@example.com"
              required
              autoComplete="email"
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="username">Nazwa użytkownika</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                clearError();
                setLocalError(null);
              }}
              placeholder="jan_kowalski"
              required
              autoComplete="username"
              minLength={3}
              maxLength={32}
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Hasło</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                clearError();
                setLocalError(null);
              }}
              placeholder="Minimum 8 znaków"
              required
              autoComplete="new-password"
              minLength={8}
            />
          </div>

          <div className="form-group">
            <label htmlFor="confirmPassword">Potwierdź hasło</label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                setLocalError(null);
              }}
              placeholder="Powtórz hasło"
              required
              autoComplete="new-password"
            />
          </div>

          <button
            type="submit"
            className="auth-button"
            disabled={isLoading}
          >
            {isLoading ? 'Tworzenie konta...' : 'Zarejestruj się'}
          </button>
        </form>

        <div className="auth-footer">
          Masz już konto? <Link to="/login">Zaloguj się</Link>
        </div>
      </div>
    </div>
  );
}

export default RegisterPage;
