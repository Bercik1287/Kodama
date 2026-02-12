import { useState } from 'react';
import { useChannelStore } from '../../stores/channelStore';
import { useServerStore } from '../../stores/serverStore';
import type { Channel } from '../../types';
import './ChannelList.css';

interface CreateChannelFormProps {
  type: 'text' | 'voice';
  onClose: () => void;
}

function CreateChannelForm({ type, onClose }: CreateChannelFormProps) {
  const [name, setName] = useState('');
  const { createChannel, isLoading } = useChannelStore();
  const { activeServer } = useServerStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeServer) return;
    try {
      await createChannel(activeServer.server.id, name.trim(), type);
      onClose();
    } catch {
      // error in store
    }
  };

  return (
    <form className="create-channel-form" onSubmit={handleSubmit}>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={type === 'text' ? 'nazwa-kanału' : 'Kanał głosowy'}
        maxLength={100}
        autoFocus
        className="create-channel-input"
      />
      <div className="create-channel-actions">
        <button type="button" className="create-channel-cancel" onClick={onClose}>
          Anuluj
        </button>
        <button
          type="submit"
          className="create-channel-submit"
          disabled={isLoading || name.trim().length === 0}
        >
          Utwórz
        </button>
      </div>
    </form>
  );
}

export function ChannelList() {
  const { channels, activeChannel, setActiveChannel, deleteChannel, currentVoiceChannelId, voiceParticipants } =
    useChannelStore();
  const { activeServer } = useServerStore();
  const [showCreateText, setShowCreateText] = useState(false);
  const [showCreateVoice, setShowCreateVoice] = useState(false);

  if (!activeServer) return null;

  const serverId = activeServer.server.id;
  const isOwner = activeServer.role === 'owner';

  const textChannels = channels.filter((c) => c.type === 'text');
  const voiceChannels = channels.filter((c) => c.type === 'voice');

  const handleChannelClick = (channel: Channel) => {
    setActiveChannel(channel, serverId);
  };

  const handleDelete = async (e: React.MouseEvent, channelId: number) => {
    e.stopPropagation();
    if (confirm('Czy na pewno chcesz usunąć ten kanał?')) {
      try {
        await deleteChannel(serverId, channelId);
      } catch {
        // error in store
      }
    }
  };

  return (
    <div className="channel-list">
      {/* Kanały tekstowe */}
      <div className="channel-section">
        <div className="channel-section-header">
          <span className="channel-section-title">Kanały tekstowe</span>
          {isOwner && (
            <button
              className="channel-add-btn"
              onClick={() => setShowCreateText(!showCreateText)}
              title="Utwórz kanał tekstowy"
            >
              +
            </button>
          )}
        </div>
        {showCreateText && (
          <CreateChannelForm type="text" onClose={() => setShowCreateText(false)} />
        )}
        {textChannels.length === 0 && !showCreateText && (
          <p className="channel-empty">Brak kanałów tekstowych</p>
        )}
        {textChannels.map((ch) => (
          <button
            key={ch.id}
            className={`channel-item ${activeChannel?.id === ch.id ? 'active' : ''}`}
            onClick={() => handleChannelClick(ch)}
          >
            <span className="channel-icon">#</span>
            <span className="channel-name">{ch.name}</span>
            {isOwner && (
              <button
                className="channel-delete-btn"
                onClick={(e) => handleDelete(e, ch.id)}
                title="Usuń kanał"
              >
                &times;
              </button>
            )}
          </button>
        ))}
      </div>

      {/* Kanały głosowe */}
      <div className="channel-section">
        <div className="channel-section-header">
          <span className="channel-section-title">Kanały głosowe</span>
          {isOwner && (
            <button
              className="channel-add-btn"
              onClick={() => setShowCreateVoice(!showCreateVoice)}
              title="Utwórz kanał głosowy"
            >
              +
            </button>
          )}
        </div>
        {showCreateVoice && (
          <CreateChannelForm type="voice" onClose={() => setShowCreateVoice(false)} />
        )}
        {voiceChannels.length === 0 && !showCreateVoice && (
          <p className="channel-empty">Brak kanałów głosowych</p>
        )}
        {voiceChannels.map((ch) => (
          <div key={ch.id}>
            <button
              className={`channel-item ${activeChannel?.id === ch.id ? 'active' : ''}`}
              onClick={() => handleChannelClick(ch)}
            >
              <span className="channel-icon voice-icon">)))</span>
              <span className="channel-name">{ch.name}</span>
              {isOwner && (
                <button
                  className="channel-delete-btn"
                  onClick={(e) => handleDelete(e, ch.id)}
                  title="Usuń kanał"
                >
                  &times;
                </button>
              )}
            </button>
            {/* Pokaż uczestników jeśli to aktualny kanał głosowy */}
            {currentVoiceChannelId === ch.id && voiceParticipants.length > 0 && (
              <div className="voice-participants-inline">
                {voiceParticipants.map((p) => (
                  <div key={p.user_id} className="voice-participant-inline">
                    <span className="voice-participant-dot" />
                    <span className="voice-participant-name">{p.username}</span>
                    {p.muted && <span className="voice-muted-badge">MIC OFF</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
