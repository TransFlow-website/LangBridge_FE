import { UserRole } from '../types/user';

export interface MenuItem {
  key: string;
  label: string;
  path?: string;
  roles: UserRole[];
  children?: SubMenuItem[];
  icon?: string;
}

export interface SubMenuItem {
  label: string;
  path: string;
  roles?: UserRole[];
}

export const sidebarMenu: MenuItem[] = [
  {
    key: 'dashboard',
    label: '대시보드',
    path: '/dashboard',
    roles: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.VOLUNTEER],
    icon: 'LayoutDashboard',
  },
  {
    key: 'translation_work',
    label: '번역 작업',
    roles: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.VOLUNTEER],
    icon: 'FileText',
    children: [
      { label: '번역 대기 문서', path: '/translations/pending' },
      { label: '내가 작업 중인 문서', path: '/translations/working' },
      { label: '찜한 문서', path: '/translations/favorites' },
    ],
  },
  {
    key: 'document_management',
    label: '문서 관리',
    roles: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
    icon: 'FolderOpen',
    children: [
      { label: '전체 문서', path: '/documents' },
    ],
  },
  {
    key: 'user_management',
    label: '사용자 관리',
    path: '/users',
    roles: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
    icon: 'Users',
  },
  {
    key: 'new_translation',
    label: '새 번역 등록',
    path: '/translations/new',
    roles: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
    icon: 'PlusCircle',
  },
  {
    key: 'review_approval',
    label: '검토 · 승인',
    path: '/reviews',
    roles: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
    icon: 'CheckCircle',
  },
  {
    key: 'glossary',
    label: '용어집',
    roles: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.VOLUNTEER],
    icon: 'BookOpen',
    children: [
      { label: '용어집 보기', path: '/glossary' },
      { label: '용어집 관리', path: '/glossary/manage', roles: [UserRole.SUPER_ADMIN, UserRole.ADMIN] },
    ],
  },
  {
    key: 'activity',
    label: '내 활동',
    path: '/activity',
    roles: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.VOLUNTEER],
    icon: 'Activity',
  },
  {
    key: 'settings',
    label: '설정',
    path: '/settings',
    roles: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.VOLUNTEER],
    icon: 'Settings',
  },
];


