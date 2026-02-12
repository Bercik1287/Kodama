import { create } from 'zustand';
import { channelApi, messageApi, voiceApi } from '../api/client';
import { voiceService } from '../services/voiceService';
import type { Channel, Message, VoiceParticipant } from '../types';

interface ChannelState {
  channels: Channel[];
  activeChannel: Channel | null;
  messages: Message[];
  hasMoreMessages: boolean;
  voiceParticipants: VoiceParticipant[];
  currentVoiceChannelId: number | null;
  isMuted: boolean;
  isLoading: boolean;
  error: string | null;

  fetchChannels: (serverId: number) => Promise<void>;
  createChannel: (serverId: number, name: string, type: 'text' | 'voice') => Promise<void>;
  deleteChannel: (serverId: number, channelId: number) => Promise<void>;
  setActiveChannel: (channel: Channel | null, serverId: number) => void;

  // Wiadomości
  fetchMessages: (serverId: number, channelId: number) => Promise<void>;
  loadMoreMessages: (serverId: number, channelId: number) => Promise<void>;
  sendMessage: (serverId: number, channelId: number, content: string) => Promise<void>;
  addMessage: (message: Message) => void;

  // Voice
  joinVoice: (serverId: number, channelId: number) => Promise<void>;
  leaveVoice: () => Promise<void>;
  toggleMute: () => Promise<void>;
  fetchVoiceParticipants: (serverId: number, channelId: number) => Promise<void>;
  fetchMyVoiceState: () => Promise<void>;

  clearChannels: () => void;
  clearError: () => void;
}

export const useChannelStore = create<ChannelState>((set, get) => ({
  channels: [],
  activeChannel: null,
  messages: [],
  hasMoreMessages: true,
  voiceParticipants: [],
  currentVoiceChannelId: null,
  isMuted: false,
  isLoading: false,
  error: null,

  fetchChannels: async (serverId: number) => {
    try {
      const channels = await channelApi.list(serverId);
      set({ channels });
    } catch (err) {
      console.error('Błąd pobierania kanałów:', err);
    }
  },

  createChannel: async (serverId: number, name: string, type: 'text' | 'voice') => {
    set({ isLoading: true, error: null });
    try {
      const channel = await channelApi.create(serverId, { name, type });
      set((state) => ({
        channels: [...state.channels, channel],
        isLoading: false,
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Błąd tworzenia kanału';
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  deleteChannel: async (serverId: number, channelId: number) => {
    try {
      await channelApi.delete(serverId, channelId);
      set((state) => ({
        channels: state.channels.filter((c) => c.id !== channelId),
        activeChannel:
          state.activeChannel?.id === channelId ? null : state.activeChannel,
        messages: state.activeChannel?.id === channelId ? [] : state.messages,
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Błąd usuwania kanału';
      set({ error: message });
      throw err;
    }
  },

  setActiveChannel: (channel: Channel | null, serverId: number) => {
    set({ activeChannel: channel, messages: [], hasMoreMessages: true });
    if (channel && channel.type === 'text') {
      get().fetchMessages(serverId, channel.id);
    }
    if (channel && channel.type === 'voice') {
      get().fetchVoiceParticipants(serverId, channel.id);
    }
  },

  // Wiadomości
  fetchMessages: async (serverId: number, channelId: number) => {
    try {
      const messages = await messageApi.list(serverId, channelId);
      set({
        messages,
        hasMoreMessages: messages.length >= 50,
      });
    } catch (err) {
      console.error('Błąd pobierania wiadomości:', err);
    }
  },

  loadMoreMessages: async (serverId: number, channelId: number) => {
    const { messages } = get();
    if (messages.length === 0) return;

    const oldestId = messages[0].id;
    try {
      const older = await messageApi.list(serverId, channelId, oldestId);
      set((state) => ({
        messages: [...older, ...state.messages],
        hasMoreMessages: older.length >= 50,
      }));
    } catch (err) {
      console.error('Błąd ładowania starszych wiadomości:', err);
    }
  },

  sendMessage: async (serverId: number, channelId: number, content: string) => {
    try {
      const msg = await messageApi.send(serverId, channelId, { content });
      set((state) => ({
        messages: [...state.messages, msg],
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Błąd wysyłania wiadomości';
      set({ error: message });
      throw err;
    }
  },

  addMessage: (message: Message) => {
    set((state) => ({
      messages: [...state.messages, message],
    }));
  },

  // Voice
  joinVoice: async (serverId: number, channelId: number) => {
    try {
      // Pobierz dane użytkownika z authStore
      const { useAuthStore } = await import('./authStore');
      const authState = useAuthStore.getState();
      const user = authState.user;
      if (!user) throw new Error('Brak zalogowanego użytkownika');

      // Połącz REST API (aktualizuje stan na serwerze)
      const participants = await voiceApi.join(serverId, channelId);

      // Połącz WebRTC (prawdziwe audio)
      await voiceService.join(channelId, user.id, user.username);

      // Nasłuchuj aktualizacji peerów
      const updatePeers = () => {
        const peers = voiceService.getPeers();
        const voiceParticipants: VoiceParticipant[] = [
          // Ja
          { user_id: user.id, username: user.username, muted: voiceService.getMyMuteState() },
          // Inni peerzy
          ...peers.map((p) => ({
            user_id: p.userId,
            username: p.username,
            muted: p.muted,
          })),
        ];
        set({ voiceParticipants, isMuted: voiceService.getMyMuteState() });
      };

      voiceService.on('peers-updated', updatePeers);
      voiceService.on('disconnected', () => {
        voiceService.off('peers-updated', updatePeers);
        set({
          voiceParticipants: [],
          currentVoiceChannelId: null,
          isMuted: false,
        });
      });

      set({
        voiceParticipants: participants,
        currentVoiceChannelId: channelId,
        isMuted: false,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Błąd dołączania do kanału głosowego';
      set({ error: message });
      throw err;
    }
  },

  leaveVoice: async () => {
    try {
      // Rozłącz WebRTC
      await voiceService.leave();
      // Rozłącz REST API
      await voiceApi.leave();
      set({
        voiceParticipants: [],
        currentVoiceChannelId: null,
        isMuted: false,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Błąd opuszczania kanału głosowego';
      set({ error: message });
    }
  },

  toggleMute: async () => {
    const { isMuted } = get();
    try {
      const newMuted = !isMuted;
      // Ustaw mute w WebRTC
      voiceService.setMuted(newMuted);
      // Powiadom serwer REST
      await voiceApi.toggleMute(newMuted);
      set({ isMuted: newMuted });
    } catch (err) {
      console.error('Błąd zmiany statusu mikrofonu:', err);
    }
  },

  fetchVoiceParticipants: async (serverId: number, channelId: number) => {
    try {
      const participants = await voiceApi.getParticipants(serverId, channelId);
      set({ voiceParticipants: participants });
    } catch (err) {
      console.error('Błąd pobierania uczestników:', err);
    }
  },

  fetchMyVoiceState: async () => {
    try {
      const state = await voiceApi.getState();
      set({
        currentVoiceChannelId: state.in_channel ? (state.channel_id ?? null) : null,
        isMuted: state.muted ?? false,
      });
    } catch (err) {
      console.error('Błąd pobierania stanu voice:', err);
    }
  },

  clearChannels: () =>
    set({
      channels: [],
      activeChannel: null,
      messages: [],
      hasMoreMessages: true,
      voiceParticipants: [],
    }),

  clearError: () => set({ error: null }),
}));
