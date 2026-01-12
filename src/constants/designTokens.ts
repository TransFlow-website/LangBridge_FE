/**
 * 디자인 토큰 - 절대 고정 값
 * 이 파일의 값은 임의로 변경하지 않음
 */

export const colors = {
  // Base Color Palette (그레이스케일 시스템)
  primaryBackground: '#DCDCDC', // 앱 전체 배경 (gainsboro)
  sidebarBackground: '#D3D3D3', // 사이드바 배경 (lightgray)
  surface: '#FFFFFF', // Card 배경 (흰색)
  border: '#C0C0C0', // Border / Divider / Inactive UI (silver)
  secondaryText: '#808080', // Secondary Text / Muted Icon (gray)
  primaryText: '#696969', // Primary Text (dimgray)
  accent: '#A9A9A9', // Active / Focus only (darkgray)
} as const;

export const typography = {
  fontFamily: 'system-ui, Pretendard, sans-serif',
  fontSize: {
    sidebarSectionTitle: '13px',
    sidebarMenu: '13px',
    sidebarSubMenu: '12px',
    body: '14px',
  },
  fontWeight: {
    sectionTitle: 600, // font-semibold
    menu: 500, // font-medium
    subMenu: 400, // font-normal
  },
  lineHeight: 1.4,
} as const;

export const spacing = {
  sidebarPadding: '16px',
  menuItemPadding: '10px 12px',
  subMenuIndent: '16px',
} as const;

export const sizes = {
  sidebarWidth: {
    desktop: '260px',
    collapsed: '72px',
  },
  iconSize: '16px',
  iconStrokeWidth: 1.75,
  borderRadius: '8px',
  activeIndicatorWidth: '3px',
} as const;

export const transitions = {
  duration: '150ms',
  easing: 'ease-in-out',
} as const;

// Menu Item States
export const menuStates = {
  default: {
    text: colors.primaryText,
    background: 'transparent',
  },
  hover: {
    background: 'rgba(192, 192, 192, 0.4)', // silver의 40% 투명도
  },
  active: {
    background: 'rgba(169, 169, 169, 0.3)', // darkgray의 30% 투명도 (살짝 더 진하게)
    text: '#505050', // 더 진한 회색 (dimgray보다 진함)
    indicator: colors.accent,
  },
  subMenuActive: {
    background: 'rgba(169, 169, 169, 0.25)', // darkgray의 25% 투명도
    text: '#505050', // 더 진한 회색
  },
  disabled: {
    text: colors.secondaryText,
    cursor: 'not-allowed',
  },
} as const;

