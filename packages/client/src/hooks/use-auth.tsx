import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import api, { storeTokens, clearTokens } from '@/lib/api';
import type { UserResponse, AuthResponse, RegisterInput, LoginInput } from '@personal-budget/shared';

interface AuthContextType {
  user: UserResponse | null;
  loading: boolean;
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedUser = localStorage.getItem('auth_user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
      // Verify token is still valid
      api.get('/auth/profile').then(
        (res) => {
          setUser(res.data);
          localStorage.setItem('auth_user', JSON.stringify(res.data));
        },
        () => {
          clearTokens();
          setUser(null);
        },
      ).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = useCallback(async (input: LoginInput) => {
    const { data } = await api.post<AuthResponse>('/auth/login', input);
    storeTokens(data.tokens);
    localStorage.setItem('auth_user', JSON.stringify(data.user));
    setUser(data.user);
  }, []);

  const register = useCallback(async (input: RegisterInput) => {
    const { data } = await api.post<AuthResponse>('/auth/register', input);
    storeTokens(data.tokens);
    localStorage.setItem('auth_user', JSON.stringify(data.user));
    setUser(data.user);
  }, []);

  const logout = useCallback(() => {
    clearTokens();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
