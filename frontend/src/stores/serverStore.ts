import { create } from 'zustand';
import { serverApi } from '../api/client';
import type { ServerResponse, ServerMember } from '../types';

interface ServerState {
  servers: ServerResponse[];
  activeServer: ServerResponse | null;
  members: ServerMember[];
  isLoading: boolean;
  error: string | null;

  fetchServers: () => Promise<void>;
  createServer: (name: string) => Promise<void>;
  joinServer: (inviteCode: string) => Promise<void>;
  setActiveServer: (server: ServerResponse | null) => void;
  fetchMembers: (serverId: number) => Promise<void>;
  leaveServer: (serverId: number) => Promise<void>;
  deleteServer: (serverId: number) => Promise<void>;
  regenerateInvite: (serverId: number) => Promise<string>;
  clearError: () => void;
}

export const useServerStore = create<ServerState>((set, get) => ({
  servers: [],
  activeServer: null,
  members: [],
  isLoading: false,
  error: null,

  fetchServers: async () => {
    set({ isLoading: true, error: null });
    try {
      const servers = await serverApi.list();
      set({ servers, isLoading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Błąd pobierania serwerów';
      set({ error: message, isLoading: false });
    }
  },

  createServer: async (name: string) => {
    set({ isLoading: true, error: null });
    try {
      const server = await serverApi.create({ name });
      set((state) => ({
        servers: [server, ...state.servers],
        activeServer: server,
        isLoading: false,
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Błąd tworzenia serwera';
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  joinServer: async (inviteCode: string) => {
    set({ isLoading: true, error: null });
    try {
      const server = await serverApi.join({ invite_code: inviteCode });
      set((state) => ({
        servers: [server, ...state.servers],
        activeServer: server,
        isLoading: false,
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Błąd dołączania do serwera';
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  setActiveServer: (server: ServerResponse | null) => {
    set({ activeServer: server, members: [] });
    if (server) {
      get().fetchMembers(server.server.id);
    }
  },

  fetchMembers: async (serverId: number) => {
    try {
      const members = await serverApi.getMembers(serverId);
      set({ members });
    } catch (err) {
      console.error('Błąd pobierania członków:', err);
    }
  },

  leaveServer: async (serverId: number) => {
    set({ isLoading: true, error: null });
    try {
      await serverApi.leave(serverId);
      set((state) => ({
        servers: state.servers.filter((s) => s.server.id !== serverId),
        activeServer:
          state.activeServer?.server.id === serverId ? null : state.activeServer,
        isLoading: false,
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Błąd opuszczania serwera';
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  deleteServer: async (serverId: number) => {
    set({ isLoading: true, error: null });
    try {
      await serverApi.delete(serverId);
      set((state) => ({
        servers: state.servers.filter((s) => s.server.id !== serverId),
        activeServer:
          state.activeServer?.server.id === serverId ? null : state.activeServer,
        isLoading: false,
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Błąd usuwania serwera';
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  regenerateInvite: async (serverId: number) => {
    try {
      const resp = await serverApi.regenerateInvite(serverId);
      // Zaktualizuj invite_code w aktywnym serwerze
      set((state) => ({
        servers: state.servers.map((s) =>
          s.server.id === serverId
            ? { ...s, server: { ...s.server, invite_code: resp.invite_code } }
            : s
        ),
        activeServer:
          state.activeServer?.server.id === serverId
            ? {
                ...state.activeServer,
                server: { ...state.activeServer.server, invite_code: resp.invite_code },
              }
            : state.activeServer,
      }));
      return resp.invite_code;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Błąd generowania zaproszenia';
      set({ error: message });
      throw err;
    }
  },

  clearError: () => set({ error: null }),
}));
