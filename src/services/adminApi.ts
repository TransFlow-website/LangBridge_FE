import apiClient from './api';
import { User } from '../types/user';

export interface UpdateUserRoleRequest {
  roleLevel: number;
}

export interface UpdateUserRoleResponse {
  success: boolean;
  message: string;
  user: {
    id: number;
    email: string;
    name: string;
    roleLevel: number;
  };
}

export interface UserListItem {
  id: number;
  email: string;
  name: string;
  roleLevel: number;
  role: string;
  profileImage?: string;
  createdAt?: string;
}

export const adminApi = {
  /**
   * 사용자 역할 레벨 변경 (사용자 ID로)
   */
  updateUserRoleLevel: async (
    userId: number,
    roleLevel: number
  ): Promise<UpdateUserRoleResponse> => {
    const response = await apiClient.put<UpdateUserRoleResponse>(
      `/admin/users/${userId}/role`,
      { roleLevel }
    );
    return response.data;
  },

  /**
   * 사용자 역할 레벨 변경 (이메일로)
   */
  updateUserRoleLevelByEmail: async (
    email: string,
    roleLevel: number
  ): Promise<UpdateUserRoleResponse> => {
    const response = await apiClient.put<UpdateUserRoleResponse>(
      `/admin/users/email/${email}/role`,
      { roleLevel }
    );
    return response.data;
  },

  /**
   * 사용자 목록 조회
   */
  getAllUsers: async (): Promise<UserListItem[]> => {
    const response = await apiClient.get<UserListItem[]>('/admin/users');
    return response.data.map(user => ({
      id: user.id,
      email: user.email,
      name: user.name,
      roleLevel: user.roleLevel,
      role: user.roleLevel === 1 ? 'LEVEL_1' : user.roleLevel === 2 ? 'LEVEL_2' : 'LEVEL_3',
      profileImage: user.profileImage,
      createdAt: user.createdAt,
    }));
  },
};

