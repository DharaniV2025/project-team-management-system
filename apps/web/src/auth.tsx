import {
  createContext,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
} from 'react';
import { api } from './api';
import type { User } from './types';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const expire = () => {
      setUser(null);
      setLoading(false);
    };
    window.addEventListener('session:expired', expire);
    const token = sessionStorage.getItem('session-token');
    if (!token) {
      setLoading(false);
    } else {
      api.get<User>('/auth/me')
        .then((response) => setUser(response.data))
        .catch(() => setUser(null))
        .finally(() => setLoading(false));
    }
    return () => window.removeEventListener('session:expired', expire);
  }, []);

  async function establishSession(path: string, payload: object) {
    const response = await api.post<{ token: string; user: User }>(path, payload);
    sessionStorage.setItem('session-token', response.data.token);
    setUser(response.data.user);
  }

  async function signIn(email: string, password: string) {
    await establishSession('/auth/login', { email, password });
  }

  async function register(name: string, email: string, password: string) {
    await establishSession('/auth/register', { name, email, password });
  }

  async function signOut() {
    try {
      await api.post('/auth/logout');
    } finally {
      sessionStorage.removeItem('session-token');
      setUser(null);
    }
  }

  return (
    <AuthContext.Provider value={{ user, loading, signIn, register, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}