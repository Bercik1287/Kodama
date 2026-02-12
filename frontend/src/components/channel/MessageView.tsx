import { useState, useRef, useEffect } from 'react';
import { useChannelStore } from '../../stores/channelStore';
import { useServerStore } from '../../stores/serverStore';
import { useAuthStore } from '../../stores/authStore';
import './MessageView.css';

export function MessageView() {
  const { activeChannel, messages, hasMoreMessages, sendMessage, loadMoreMessages } =
    useChannelStore();
  const { activeServer } = useServerStore();
  const { user } = useAuthStore();
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Auto-scroll gdy nowe wiadomości
  useEffect(() => {
    if (autoScroll) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, autoScroll]);

  // Reset auto-scroll kiedy zmiana kanału
  useEffect(() => {
    setAutoScroll(true);
    setInput('');
  }, [activeChannel?.id]);

  const handleScroll = () => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
    setAutoScroll(isAtBottom);
  };

  const handleLoadMore = () => {
    if (!activeServer || !activeChannel) return;
    loadMoreMessages(activeServer.server.id, activeChannel.id);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !activeServer || !activeChannel || sending) return;

    const content = input.trim();
    setInput('');
    setSending(true);

    try {
      await sendMessage(activeServer.server.id, activeChannel.id, content);
    } catch {
      setInput(content); // przywróć treść przy błędzie
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend(e);
    }
  };

  if (!activeChannel || activeChannel.type !== 'text') return null;

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const today = new Date();
    const isToday =
      d.getDate() === today.getDate() &&
      d.getMonth() === today.getMonth() &&
      d.getFullYear() === today.getFullYear();

    const time = d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
    if (isToday) return `Dziś o ${time}`;
    return `${d.toLocaleDateString('pl-PL')} ${time}`;
  };

  return (
    <div className="message-view">
      {/* Header */}
      <div className="message-header">
        <span className="message-header-icon">#</span>
        <span className="message-header-name">{activeChannel.name}</span>
      </div>

      {/* Messages */}
      <div
        className="message-list"
        ref={messagesContainerRef}
        onScroll={handleScroll}
      >
        {hasMoreMessages && messages.length > 0 && (
          <button className="load-more-btn" onClick={handleLoadMore}>
            Załaduj starsze wiadomości
          </button>
        )}

        {messages.length === 0 && (
          <div className="message-empty">
            <div className="message-empty-icon">#</div>
            <h3>Witaj na #{activeChannel.name}</h3>
            <p>To jest początek kanału. Napisz pierwszą wiadomość!</p>
          </div>
        )}

        {messages.map((msg, i) => {
          const prevMsg = i > 0 ? messages[i - 1] : null;
          const showHeader =
            !prevMsg ||
            prevMsg.user_id !== msg.user_id ||
            new Date(msg.created_at).getTime() - new Date(prevMsg.created_at).getTime() > 300000;

          return (
            <div
              key={msg.id}
              className={`message ${msg.user_id === user?.id ? 'own' : ''} ${showHeader ? 'with-header' : 'compact'}`}
            >
              {showHeader && (
                <div className="message-meta">
                  <div className="message-avatar">
                    {msg.username.charAt(0).toUpperCase()}
                  </div>
                  <span className="message-author">{msg.username}</span>
                  <span className="message-time">{formatTime(msg.created_at)}</span>
                </div>
              )}
              <div className={`message-content ${showHeader ? '' : 'message-content-compact'}`}>
                {msg.content}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form className="message-input-form" onSubmit={handleSend}>
        <input
          type="text"
          className="message-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`Napisz na #${activeChannel.name}`}
          maxLength={2000}
          disabled={sending}
        />
        <button
          type="submit"
          className="message-send-btn"
          disabled={sending || input.trim().length === 0}
        >
          Wyślij
        </button>
      </form>
    </div>
  );
}
