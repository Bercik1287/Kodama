import { useState } from 'react';
import { useServerStore } from '../../stores/serverStore';
import './ServerModals.css';

interface CreateServerModalProps {
  onClose: () => void;
}

export function CreateServerModal({ onClose }: CreateServerModalProps) {
  const [name, setName] = useState('');
  const { createServer, isLoading, error, clearError } = useServerStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createServer(name);
      onClose();
    } catch {
      // error jest w store
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Utwórz serwer</h2>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <p className="modal-description">
          Nadaj swojemu serwerowi nazwę. Będziesz mógł zaprosić do niego innych użytkowników.
        </p>
        {error && (
          <div className="modal-error" onClick={clearError}>
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit}>
          <div className="modal-form-group">
            <label htmlFor="server-name">Nazwa serwera</label>
            <input
              id="server-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Mój serwer"
              maxLength={100}
              minLength={2}
              required
              autoFocus
            />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Anuluj
            </button>
            <button type="submit" className="btn-primary" disabled={isLoading || name.trim().length < 2}>
              {isLoading ? 'Tworzenie...' : 'Utwórz'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface JoinServerModalProps {
  onClose: () => void;
}

export function JoinServerModal({ onClose }: JoinServerModalProps) {
  const [inviteCode, setInviteCode] = useState('');
  const { joinServer, isLoading, error, clearError } = useServerStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await joinServer(inviteCode.trim());
      onClose();
    } catch {
      // error jest w store
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Dołącz do serwera</h2>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <p className="modal-description">
          Wpisz kod zaproszenia, aby dołączyć do istniejącego serwera.
        </p>
        {error && (
          <div className="modal-error" onClick={clearError}>
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit}>
          <div className="modal-form-group">
            <label htmlFor="invite-code">Kod zaproszenia</label>
            <input
              id="invite-code"
              type="text"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              placeholder="np. a1b2c3d4e5"
              required
              autoFocus
            />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Anuluj
            </button>
            <button type="submit" className="btn-primary" disabled={isLoading || inviteCode.trim().length === 0}>
              {isLoading ? 'Dołączanie...' : 'Dołącz'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface InviteModalProps {
  inviteCode: string;
  serverName: string;
  onRegenerate: () => void;
  onClose: () => void;
}

export function InviteModal({ inviteCode, serverName, onRegenerate, onClose }: InviteModalProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(inviteCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
      const el = document.createElement('textarea');
      el.value = inviteCode;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Zaproś do {serverName}</h2>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <p className="modal-description">
          Udostępnij ten kod zaproszenia innym użytkownikom, aby mogli dołączyć do serwera.
        </p>
        <div className="invite-code-container">
          <code className="invite-code">{inviteCode}</code>
          <button className="btn-copy" onClick={handleCopy}>
            {copied ? '✓ Skopiowano' : 'Kopiuj'}
          </button>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onRegenerate}>
            Nowy kod
          </button>
          <button type="button" className="btn-primary" onClick={onClose}>
            Gotowe
          </button>
        </div>
      </div>
    </div>
  );
}
