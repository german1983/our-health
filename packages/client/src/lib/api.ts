import axios from 'axios';
import type { AuthTokens } from '@personal-budget/shared';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Request interceptor: attach access token
api.interceptors.request.use((config) => {
  const tokens = getStoredTokens();
  if (tokens?.accessToken) {
    config.headers.Authorization = `Bearer ${tokens.accessToken}`;
  }
  return config;
});

// Response interceptor: handle 401 + refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      const tokens = getStoredTokens();
      if (tokens?.refreshToken) {
        try {
          const { data } = await axios.post<AuthTokens>(`${API_URL}/auth/refresh`, {
            refreshToken: tokens.refreshToken,
          });
          storeTokens(data);
          originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
          return api(originalRequest);
        } catch {
          clearTokens();
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  },
);

export function getStoredTokens(): AuthTokens | null {
  const raw = localStorage.getItem('auth_tokens');
  return raw ? JSON.parse(raw) : null;
}

export function storeTokens(tokens: AuthTokens): void {
  localStorage.setItem('auth_tokens', JSON.stringify(tokens));
}

export function clearTokens(): void {
  localStorage.removeItem('auth_tokens');
  localStorage.removeItem('auth_user');
}

export default api;
