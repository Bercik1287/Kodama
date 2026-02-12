import { create } from 'zustand';
import { api } from '../api/client';
import type { User, AuthResponse, LoginRequest, RegisterRequest } from '../types';

interface AuthState {
  token: string | null;
  user: User | null;
  isLoading: boolean;
  error: string | null;

  login: (data: LoginRequest) => Promise<void>;
  register: (data: RegisterRequest) => Promise<void>;
  logout: () => void;
  fetchMe: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: localStorage.getItem('kodama-token'),
  user: null,
  isLoading: false,
  error: null,

  login: async (data: LoginRequest) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.post<AuthResponse>('/auth/login', data);
      localStorage.setItem('kodama-token', response.token);
      set({ token: response.token, user: response.user, isLoading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Błąd logowania';
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  register: async (data: RegisterRequest) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.post<AuthResponse>('/auth/register', data);
      localStorage.setItem('kodama-token', response.token);
      set({ token: response.token, user: response.user, isLoading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Błąd rejestracji';
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  logout: () => {
    localStorage.removeItem('kodama-token');
    set({ token: null, user: null });
  },

  fetchMe: async () => {
    try {
      const user = await api.get<User>('/me');
      set({ user });
    } catch {
      localStorage.removeItem('kodama-token');
      set({ token: null, user: null });
    }
  },

  clearError: () => set({ error: null }),
}));
