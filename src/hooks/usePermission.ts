import { useMemo } from 'react';
import { UserRole, UserRoleType } from '../types/user';
import { MenuItem } from '../constants/sidebarMenu';
import { hasRole, hasMenuAccess, hasSubMenuAccess, filterMenuByRole } from '../utils/hasAccess';

export const usePermission = (userRole: UserRoleType | null) => {
  const checkRole = useMemo(
    () => (requiredRoles: UserRole[]) => {
      if (!userRole) return false;
      return hasRole(userRole, requiredRoles);
    },
    [userRole]
  );

  const checkMenuAccess = useMemo(
    () => (menuItem: MenuItem) => {
      if (!userRole) return false;
      return hasMenuAccess(userRole, menuItem);
    },
    [userRole]
  );

  const checkSubMenuAccess = useMemo(
    () => (subMenuItem: { roles?: UserRole[] }) => {
      if (!userRole) return false;
      if (!subMenuItem.roles || subMenuItem.roles.length === 0) return true;
      return hasRole(userRole, subMenuItem.roles);
    },
    [userRole]
  );

  const getFilteredMenu = useMemo(
    () => (menuItems: MenuItem[]) => {
      if (!userRole) return [];
      return filterMenuByRole(menuItems, userRole);
    },
    [userRole]
  );

  return {
    checkRole,
    checkMenuAccess,
    checkSubMenuAccess,
    getFilteredMenu,
  };
};

