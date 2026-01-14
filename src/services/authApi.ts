import apiClient from './api';
import { User } from '../types/user';
import { roleLevelToRole } from '../utils/hasAccess';

export const authApi = {
  /**
   * 현재 로그인한 사용자 정보 가져오기
   */
  getCurrentUser: async (): Promise<User> => {
    const token = localStorage.getItem('token');
    if (!token) {
      throw new Error('No token found');
    }

    const response = await apiClient.get('/auth/me', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const userData = response.data;
    return {
      id: userData.id,
      email: userData.email,
      name: userData.name,
      roleLevel: userData.roleLevel,
      role: roleLevelToRole(userData.roleLevel),
      profileImage: userData.profileImage || undefined,
    };
  },

  /**
   * 로그인 (OAuth2 콜백에서 토큰 저장)
   */
  setToken: (token: string) => {
    localStorage.setItem('token', token);
  },

  /**
   * 로그아웃
   */
  logout: async (): Promise<void> => {
    const token = localStorage.getItem('token');
    if (token) {
      try {
        await apiClient.post(
          '/auth/logout',
          {},
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );
      } catch (error) {
        console.error('Logout error:', error);
      }
    }
    localStorage.removeItem('token');
  },

  /**
   * 토큰 가져오기
   */
  getToken: (): string | null => {
    return localStorage.getItem('token');
  },
};

