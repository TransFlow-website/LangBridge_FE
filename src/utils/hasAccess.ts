import { UserRole, UserRoleType } from '../types/user';
import { MenuItem, SubMenuItem } from '../constants/sidebarMenu';

/**
 * 사용자 역할을 UserRole enum으로 변환
 */
export const roleLevelToRole = (roleLevel: number): UserRole => {
  switch (roleLevel) {
    case 1:
      return UserRole.SUPER_ADMIN;
    case 2:
      return UserRole.ADMIN;
    case 3:
      return UserRole.VOLUNTEER;
    default:
      return UserRole.VOLUNTEER;
  }
};

/**
 * 사용자가 특정 역할을 가지고 있는지 확인
 */
export const hasRole = (userRole: UserRoleType, requiredRoles: UserRole[]): boolean => {
  return requiredRoles.includes(userRole as UserRole);
};

/**
 * 메뉴 아이템에 대한 접근 권한 확인
 */
export const hasMenuAccess = (userRole: UserRoleType, menuItem: MenuItem): boolean => {
  return hasRole(userRole, menuItem.roles);
};

/**
 * 서브 메뉴 아이템에 대한 접근 권한 확인
 */
export const hasSubMenuAccess = (userRole: UserRoleType, subMenuItem: SubMenuItem): boolean => {
  if (!subMenuItem.roles || subMenuItem.roles.length === 0) {
    return true; // roles가 없으면 모든 사용자 접근 가능
  }
  return hasRole(userRole, subMenuItem.roles);
};

/**
 * 역할 기반으로 메뉴 필터링
 */
export const filterMenuByRole = (menuItems: MenuItem[], userRole: UserRoleType): MenuItem[] => {
  return menuItems
    .filter((item) => hasMenuAccess(userRole, item))
    .map((item) => {
      if (item.children) {
        const filteredChildren = item.children.filter((child) =>
          hasSubMenuAccess(userRole, child)
        );
        return { ...item, children: filteredChildren.length > 0 ? filteredChildren : undefined };
      }
      return item;
    })
    .filter((item) => {
      // children이 있는 경우, 필터링 후 children이 없으면 제거
      if (item.children && item.children.length === 0) {
        return false;
      }
      return true;
    });
};

