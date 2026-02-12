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

  if (!activeChannel || activeChannel.type !== 'voice' || !activeServer) return null;

  const serverId = activeServer.server.id;
  const channelId = activeChannel.id;
  const isConnected = currentVoiceChannelId === channelId;

  const handleJoin = async () => {
    try {
      await joinVoice(serverId, channelId);
    } catch {
      // error in store
    }
  };

  const handleLeave = async () => {
    await leaveVoice();
  };

  return (
    <div className="voice-view">
      {/* Header */}
      <div className="voice-header">
        <span className="voice-header-icon">)))</span>
        <span className="voice-header-name">{activeChannel.name}</span>
      </div>

      {/* Content */}
      <div className="voice-content">
        {!isConnected ? (
          <div className="voice-join-section">
            <div className="voice-join-icon">)))</div>
            <h3>Kanał głosowy</h3>
            <p>Kliknij przycisk, aby dołączyć do rozmowy głosowej.</p>
            <button className="voice-join-btn" onClick={handleJoin}>
              Dołącz do kanału
            </button>
          </div>
        ) : (
          <div className="voice-connected-section">
            <div className="voice-status">
              <span className="voice-status-dot" />
              Połączono z kanałem głosowym
            </div>

            {/* Participants */}
            <div className="voice-participants-grid">
              {voiceParticipants.map((p) => (
                <div key={p.user_id} className={`voice-participant-card ${p.muted ? 'muted' : ''}`}>
                  <div className="voice-participant-avatar">
                    {p.username.charAt(0).toUpperCase()}
                  </div>
                  <span className="voice-participant-username">{p.username}</span>
                  {p.muted && <span className="voice-participant-muted">MIC OFF</span>}
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
                {isMuted ? 'MIC OFF' : 'MIC ON'}
              </button>
              <button className="voice-control-btn disconnect" onClick={handleLeave}>
                Rozłącz
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
