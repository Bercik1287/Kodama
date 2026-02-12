import { useState, useEffect } from 'react';
import { useServerStore } from '../../stores/serverStore';
import { useAuthStore } from '../../stores/authStore';
import { useChannelStore } from '../../stores/channelStore';
import { InviteModal } from './ServerModals';
import { ChannelList } from '../channel/ChannelList';
import './ServerDetail.css';

export function ServerDetail() {
  const { activeServer, members, leaveServer, deleteServer, regenerateInvite } =
    useServerStore();
  const { user } = useAuthStore();
  const { fetchChannels, clearChannels } = useChannelStore();
  const [showInvite, setShowInvite] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [showConfirmLeave, setShowConfirmLeave] = useState(false);

  // Pobierz kanały po zmianie serwera
  useEffect(() => {
    if (activeServer) {
      fetchChannels(activeServer.server.id);
    }
    return () => {
      clearChannels();
    };
  }, [activeServer?.server.id, fetchChannels, clearChannels]);

  if (!activeServer) return null;

  const isOwner = activeServer.role === 'owner';
  const server = activeServer.server;

  const handleShowInvite = () => {
    setInviteCode(server.invite_code);
    setShowInvite(true);
  };

  const handleRegenerate = async () => {
    try {
      const newCode = await regenerateInvite(server.id);
      setInviteCode(newCode);
    } catch {
      // error w store
    }
  };

  const handleLeave = async () => {
    try {
      await leaveServer(server.id);
      setShowConfirmLeave(false);
    } catch {
      // error w store
    }
  };

  const handleDelete = async () => {
    try {
      await deleteServer(server.id);
      setShowConfirmDelete(false);
    } catch {
      // error w store
    }
  };

  return (
    <>
      <div className="server-detail">
        {/* Header */}
        <div className="server-detail-header">
          <h3 className="server-detail-name">{server.name}</h3>
          <div className="server-detail-actions">
            <button className="server-action-btn" onClick={handleShowInvite} title="Zaproś">
              Zaproś
            </button>
            {isOwner ? (
              <button
                className="server-action-btn danger"
                onClick={() => setShowConfirmDelete(true)}
                title="Usuń serwer"
              >
                Usuń
              </button>
            ) : (
              <button
                className="server-action-btn"
                onClick={() => setShowConfirmLeave(true)}
                title="Opuść serwer"
              >
                Opuść
              </button>
            )}
          </div>
        </div>

        {/* Informacje o serwerze */}
        <div className="server-info">
          <span className="server-info-item">
            {activeServer.member_count} {activeServer.member_count === 1 ? 'członek' : 'członków'}
          </span>
          {isOwner && <span className="server-info-badge">Właściciel</span>}
        </div>

        {/* Kanały */}
        <ChannelList />

        {/* Lista członków */}
        <div className="server-members-section">
          <div className="server-section-title">
            Członkowie — {members.length}
          </div>
          <div className="server-members-list">
            {members.map((m) => (
              <div
                key={m.id}
                className={`server-member ${m.id === user?.id ? 'self' : ''}`}
              >
                <div className="member-avatar">
                  {m.username.charAt(0).toUpperCase()}
                </div>
                <div className="member-info">
                  <span className="member-name">{m.username}</span>
                  {m.role === 'owner' && <span className="member-role-badge">owner</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Modals */}
      {showInvite && (
        <InviteModal
          inviteCode={inviteCode}
          serverName={server.name}
          onRegenerate={handleRegenerate}
          onClose={() => setShowInvite(false)}
        />
      )}

      {showConfirmDelete && (
        <div className="modal-overlay" onClick={() => setShowConfirmDelete(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Usuń serwer</h2>
              <button className="modal-close" onClick={() => setShowConfirmDelete(false)}>&times;</button>
            </div>
            <p className="modal-description">
              Czy na pewno chcesz usunąć serwer <strong>{server.name}</strong>? 
              Ta operacja jest nieodwracalna i usunie wszystkich członków.
            </p>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowConfirmDelete(false)}>
                Anuluj
              </button>
              <button className="btn-danger" onClick={handleDelete}>
                Usuń serwer
              </button>
            </div>
          </div>
        </div>
      )}

      {showConfirmLeave && (
        <div className="modal-overlay" onClick={() => setShowConfirmLeave(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Opuść serwer</h2>
              <button className="modal-close" onClick={() => setShowConfirmLeave(false)}>&times;</button>
            </div>
            <p className="modal-description">
              Czy na pewno chcesz opuścić serwer <strong>{server.name}</strong>?
              Będziesz musiał otrzymać nowe zaproszenie, aby ponownie dołączyć.
            </p>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowConfirmLeave(false)}>
                Anuluj
              </button>
              <button className="btn-danger" onClick={handleLeave}>
                Opuść
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
