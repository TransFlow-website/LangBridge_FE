export enum UserRole {
  SUPER_ADMIN = 'LEVEL_1',
  ADMIN = 'LEVEL_2',
  VOLUNTEER = 'LEVEL_3',
}

export type UserRoleType = UserRole | string;

export interface User {
  id: number;
  email: string;
  name: string;
  roleLevel: number;
  role: UserRole;
  profileImage?: string;
}


