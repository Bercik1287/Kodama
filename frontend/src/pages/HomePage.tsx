import { useEffect } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useServerStore } from '../stores/serverStore';
import { useChannelStore } from '../stores/channelStore';
import { ServerSidebar } from '../components/server/ServerSidebar';
import { ServerDetail } from '../components/server/ServerDetail';
import { MessageView } from '../components/channel/MessageView';
import { VoiceView } from '../components/channel/VoiceView';

function HomePage() {
  const { user, logout, fetchMe } = useAuthStore();
  const { activeServer, fetchServers } = useServerStore();
  const { activeChannel } = useChannelStore();

  useEffect(() => {
    if (!user) {
      fetchMe();
    }
  }, [user, fetchMe]);

  useEffect(() => {
    fetchServers();
  }, [fetchServers]);

  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      backgroundColor: 'var(--bg-primary)',
      color: 'var(--text-primary)',
    }}>
      {/* Sidebar - lista serwerów */}
      <ServerSidebar />

      {/* Panel serwera - kanały i członkowie */}
      {activeServer ? (
        <ServerDetail />
      ) : (
        <div style={{
          width: '240px',
          backgroundColor: 'var(--bg-secondary)',
          borderRight: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
        }}>
          <div style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--border)',
            fontWeight: 600,
            fontSize: '0.9375rem',
          }}>
            Kodama
          </div>
          <div style={{ flex: 1, padding: '8px' }}>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8125rem', padding: '8px' }}>
              Wybierz serwer z listy lub utwórz nowy, klikając przycisk +
            </p>
          </div>
          {/* User panel */}
          <div style={{
            padding: '8px 12px',
            borderTop: '1px solid var(--border)',
            backgroundColor: 'var(--bg-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                backgroundColor: 'var(--accent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.75rem',
                fontWeight: 600,
              }}>
                {user?.username?.charAt(0).toUpperCase() || '?'}
              </div>
              <div>
                <div style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
                  {user?.username || 'Ładowanie...'}
                </div>
                <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
                  Online
                </div>
              </div>
            </div>
            <button
              onClick={logout}
              style={{
                padding: '4px 8px',
                fontSize: '0.75rem',
                background: 'transparent',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
              }}
            >
              Wyloguj
            </button>
          </div>
        </div>
      )}

      {/* Main content */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
      }}>
        {activeServer && activeChannel ? (
          activeChannel.type === 'text' ? (
            <MessageView />
          ) : (
            <VoiceView />
          )
        ) : (
          <div style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            gap: '1rem',
          }}>
            {activeServer ? (
              <>
                <span style={{ fontSize: '3rem', color: 'var(--accent-light)' }}>#</span>
                <h2 style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>
                  {activeServer.server.name}
                </h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                  Wybierz kanał, aby rozpocząć rozmowę.
                </p>
              </>
            ) : (
              <>
                <span style={{ fontSize: '3rem', color: 'var(--accent-light)' }}>K</span>
                <h2 style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>
                  Witaj w Kodama{user ? `, ${user.username}` : ''}!
                </h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                  Wybierz serwer lub utwórz nowy, aby rozpocząć rozmowę.
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default HomePage;
