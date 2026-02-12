const API_BASE = import.meta.env.VITE_API_URL || '/api';

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = localStorage.getItem('kodama-token');

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(data?.error || 'Wystąpił błąd');
  }

  return data as T;
}

export const api = {
  get: <T>(endpoint: string) => request<T>(endpoint),
  post: <T>(endpoint: string, body: unknown) =>
    request<T>(endpoint, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  put: <T>(endpoint: string, body: unknown) =>
    request<T>(endpoint, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  delete: <T>(endpoint: string) =>
    request<T>(endpoint, { method: 'DELETE' }),
};

// Server API
import type {
  ServerResponse,
  CreateServerRequest,
  JoinServerRequest,
  ServerMember,
  Channel,
  CreateChannelRequest,
  Message,
  SendMessageRequest,
  VoiceParticipant,
  VoiceState,
} from '../types';

export const serverApi = {
  list: () => api.get<ServerResponse[]>('/servers'),
  create: (data: CreateServerRequest) =>
    api.post<ServerResponse>('/servers', data),
  get: (id: number) => api.get<ServerResponse>(`/servers/${id}`),
  join: (data: JoinServerRequest) =>
    api.post<ServerResponse>('/servers/join', data),
  leave: (id: number) => api.post<{ message: string }>(`/servers/${id}/leave`, {}),
  delete: (id: number) => api.delete<{ message: string }>(`/servers/${id}`),
  getMembers: (id: number) => api.get<ServerMember[]>(`/servers/${id}/members`),
  regenerateInvite: (id: number) =>
    api.post<{ invite_code: string }>(`/servers/${id}/invite`, {}),
};

// Channel API
export const channelApi = {
  list: (serverId: number) =>
    api.get<Channel[]>(`/servers/${serverId}/channels`),
  create: (serverId: number, data: CreateChannelRequest) =>
    api.post<Channel>(`/servers/${serverId}/channels`, data),
  delete: (serverId: number, channelId: number) =>
    api.delete<{ message: string }>(`/servers/${serverId}/channels/${channelId}`),
};

// Message API
export const messageApi = {
  list: (serverId: number, channelId: number, before?: number) => {
    const query = before ? `?before=${before}` : '';
    return api.get<Message[]>(
      `/servers/${serverId}/channels/${channelId}/messages${query}`
    );
  },
  send: (serverId: number, channelId: number, data: SendMessageRequest) =>
    api.post<Message>(
      `/servers/${serverId}/channels/${channelId}/messages`,
      data
    ),
};

// Voice API
export const voiceApi = {
  join: (serverId: number, channelId: number) =>
    api.post<VoiceParticipant[]>(
      `/servers/${serverId}/channels/${channelId}/voice/join`,
      {}
    ),
  leave: () => api.post<{ message: string }>('/voice/leave', {}),
  getParticipants: (serverId: number, channelId: number) =>
    api.get<VoiceParticipant[]>(
      `/servers/${serverId}/channels/${channelId}/voice/participants`
    ),
  toggleMute: (muted: boolean) =>
    api.post<VoiceParticipant[]>('/voice/mute', { muted }),
  getState: () => api.get<VoiceState>('/voice/state'),
};
