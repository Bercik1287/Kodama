import { useState } from 'react';
import { useChannelStore } from '../../stores/channelStore';
import { useServerStore } from '../../stores/serverStore';
import './VoiceView.css';

export function VoiceView() {
  const {
    activeChannel,
    voiceParticipants,
    currentVoiceChannelId,
    isMuted,
    joinVoice,
    leaveVoice,
    toggleMute,
  } = useChannelStore();
  const { activeServer } = useServerStore();
  const [isJoining, setIsJoining] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);

  if (!activeChannel || activeChannel.type !== 'voice' || !activeServer) return null;

  const serverId = activeServer.server.id;
  const channelId = activeChannel.id;
  const isConnected = currentVoiceChannelId === channelId;

  const handleJoin = async () => {
    setIsJoining(true);
    setVoiceError(null);
    try {
      await joinVoice(serverId, channelId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Nie udało się dołączyć';
      if (msg.includes('mikrofon') || msg.includes('getUserMedia') || msg.includes('Permission')) {
        setVoiceError('Nie udało się uzyskać dostępu do mikrofonu. Sprawdź uprawnienia przeglądarki.');
      } else {
        setVoiceError(msg);
      }
    } finally {
      setIsJoining(false);
    }
  };

  const handleLeave = async () => {
    await leaveVoice();
    setVoiceError(null);
  };

  return (
    <div className="voice-view">
      {/* Header */}
      <div className="voice-header">
        <span className="voice-header-icon">🎙</span>
        <span className="voice-header-name">{activeChannel.name}</span>
        {isConnected && <span className="voice-header-live">LIVE</span>}
      </div>

      {/* Content */}
      <div className="voice-content">
        {!isConnected ? (
          <div className="voice-join-section">
            <div className="voice-join-icon">🎧</div>
            <h3>Kanał głosowy</h3>
            <p>Kliknij przycisk, aby dołączyć do rozmowy głosowej. Potrzebujesz mikrofonu.</p>
            {voiceError && <div className="voice-error">{voiceError}</div>}
            <button
              className="voice-join-btn"
              onClick={handleJoin}
              disabled={isJoining}
            >
              {isJoining ? 'Łączenie...' : 'Dołącz do kanału'}
            </button>
          </div>
        ) : (
          <div className="voice-connected-section">
            <div className="voice-status">
              <span className="voice-status-dot" />
              Połączono — głos przesyłany przez WebRTC
            </div>

            {/* Participants */}
            <div className="voice-participants-grid">
              {voiceParticipants.map((p) => (
                <div key={p.user_id} className={`voice-participant-card ${p.muted ? 'muted' : 'speaking'}`}>
                  <div className="voice-participant-avatar">
                    {p.username.charAt(0).toUpperCase()}
                  </div>
                  <span className="voice-participant-username">{p.username}</span>
                  {p.muted ? (
                    <span className="voice-participant-muted">🔇</span>
                  ) : (
                    <span className="voice-participant-active">🎙</span>
                  )}
                </div>
              ))}
            </div>

            {/* Controls */}
            <div className="voice-controls">
              <button
                className={`voice-control-btn ${isMuted ? 'muted' : ''}`}
                onClick={toggleMute}
                title={isMuted ? 'Odcisz mikrofon' : 'Wycisz mikrofon'}
              >
                {isMuted ? '🔇 Wyciszony' : '🎙 Mikrofon'}
              </button>
              <button className="voice-control-btn disconnect" onClick={handleLeave}>
                📞 Rozłącz
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
