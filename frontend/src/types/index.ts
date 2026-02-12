export interface User {
  id: number;
  email: string;
  username: string;
  created_at: string;
  updated_at: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface RegisterRequest {
  email: string;
  username: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface ApiError {
  error: string;
}

// Serwery

export interface Server {
  id: number;
  name: string;
  owner_id: number;
  invite_code: string;
  created_at: string;
  updated_at: string;
}

export interface ServerResponse {
  server: Server;
  role: string;
  member_count: number;
}

export interface CreateServerRequest {
  name: string;
}

export interface JoinServerRequest {
  invite_code: string;
}

export interface ServerMember {
  id: number;
  username: string;
  email: string;
  role: string;
  joined_at: string;
}

// Kanały

export interface Channel {
  id: number;
  server_id: number;
  name: string;
  type: 'text' | 'voice';
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: number;
  channel_id: number;
  user_id: number;
  username: string;
  content: string;
  created_at: string;
}

export interface VoiceParticipant {
  user_id: number;
  username: string;
  muted: boolean;
}

export interface VoiceState {
  in_channel: boolean;
  channel_id?: number;
  muted?: boolean;
}

export interface CreateChannelRequest {
  name: string;
  type: 'text' | 'voice';
}

export interface SendMessageRequest {
  content: string;
}
