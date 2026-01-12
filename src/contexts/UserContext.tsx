import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, UserRole } from '../types/user';
import { authApi } from '../services/authApi';
import { roleLevelToRole } from '../utils/hasAccess';

interface UserContextType {
  user: User | null;
  loading: boolean;
  error: string | null;
  setUser: (user: User | null) => void;
  refreshUser: () => Promise<void>;
  logout: () => Promise<void>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export const useUser = () => {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useUser must be used within UserProvider');
  }
  return context;
};

interface UserProviderProps {
  children: ReactNode;
}

export const UserProvider: React.FC<UserProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshUser = async () => {
    const token = authApi.getToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const userData = await authApi.getCurrentUser();
      setUser(userData);
    } catch (err) {
      console.error('Failed to fetch user:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch user');
      setUser(null);
      // 토큰이 유효하지 않으면 제거
      localStorage.removeItem('token');
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      await authApi.logout();
      setUser(null);
      setError(null);
    } catch (err) {
      console.error('Logout error:', err);
      setUser(null);
      setError(null);
    }
  };

  useEffect(() => {
    // URL에서 토큰이 있는지 확인 (OAuth2 콜백)
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    if (token) {
      authApi.setToken(token);
      // URL에서 토큰 제거
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    const existingToken = authApi.getToken();
    if (!existingToken) {
      // 개발 환경: 더미 사용자 데이터 설정 (실제 프로덕션에서는 제거)
      if (import.meta.env.DEV) {
        const dummyUser: User = {
          id: 1,
          email: 'admin@example.com',
          name: '관리자',
          roleLevel: 1, // SUPER_ADMIN
          role: roleLevelToRole(1),
        };
        setUser(dummyUser);
        setLoading(false);
        return;
      }
    }

    refreshUser();
  }, []);

  return (
    <UserContext.Provider value={{ user, loading, error, setUser, refreshUser, logout }}>
      {children}
    </UserContext.Provider>
  );
};

