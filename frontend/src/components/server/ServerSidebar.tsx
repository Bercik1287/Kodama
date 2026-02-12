import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useServerStore } from '../../stores/serverStore';
import { CreateServerModal, JoinServerModal } from './ServerModals';
import type { ServerResponse } from '../../types';
import './ServerSidebar.css';

export function ServerSidebar() {
  const { servers, activeServer, setActiveServer } = useServerStore();
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const addBtnRef = useRef<HTMLButtonElement>(null);

  const handleServerClick = (server: ServerResponse) => {
    setActiveServer(server);
  };

  const handleToggleMenu = () => {
    if (!showMenu && addBtnRef.current) {
      const rect = addBtnRef.current.getBoundingClientRect();
      setMenuPos({ top: rect.top, left: rect.right + 8 });
    }
    setShowMenu(!showMenu);
  };

  return (
    <>
      <div className="server-sidebar">
        {/* Home / logo */}
        <button
          className={`server-icon server-icon-home ${!activeServer ? 'active' : ''}`}
          onClick={() => setActiveServer(null)}
          title="Strona główna"
        >
          K
        </button>

        <div className="server-sidebar-divider" />

        {/* Lista serwerów */}
        {servers.map((s) => (
          <button
            key={s.server.id}
            className={`server-icon ${activeServer?.server.id === s.server.id ? 'active' : ''}`}
            onClick={() => handleServerClick(s)}
            title={s.server.name}
          >
            {s.server.name.charAt(0).toUpperCase()}
          </button>
        ))}

        {/* Dodaj serwer */}
        <div className="server-add-wrapper">
          <button
            ref={addBtnRef}
            className="server-icon server-icon-add"
            onClick={handleToggleMenu}
            title="Dodaj serwer"
          >
            +
          </button>
        </div>
      </div>

      {showMenu && createPortal(
        <>
          <div className="server-add-menu-backdrop" onClick={() => setShowMenu(false)} />
          <div className="server-add-menu" style={{ top: menuPos.top, left: menuPos.left }}>
            <button
              className="server-add-menu-item"
              onClick={() => {
                setShowMenu(false);
                setShowCreate(true);
              }}
            >
              <span className="menu-icon">+</span>
              Utwórz serwer
            </button>
            <button
              className="server-add-menu-item"
              onClick={() => {
                setShowMenu(false);
                setShowJoin(true);
              }}
            >
              <span className="menu-icon">&gt;</span>
              Dołącz do serwera
            </button>
          </div>
        </>,
        document.body
      )}

      {showCreate && <CreateServerModal onClose={() => setShowCreate(false)} />}
      {showJoin && <JoinServerModal onClose={() => setShowJoin(false)} />}
    </>
  );
}
