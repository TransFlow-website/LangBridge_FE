import React, { useState, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  FileText,
  FolderOpen,
  PlusCircle,
  CheckCircle,
  BookOpen,
  Activity,
  Settings,
  ChevronDown,
  ChevronUp,
  Menu,
  X,
  LogOut,
} from 'lucide-react';
import { sidebarMenu, MenuItem, SubMenuItem } from '../constants/sidebarMenu';
import { useUser } from '../contexts/UserContext';
import { useSidebar } from '../contexts/SidebarContext';
import { usePermission } from '../hooks/usePermission';
import { roleLevelToRole } from '../utils/hasAccess';
import {
  colors,
  typography,
  spacing,
  sizes,
  menuStates,
  transitions,
} from '../constants/designTokens';

// 아이콘 매핑
const iconMap: Record<string, React.ComponentType<{ className?: string; size?: number }>> = {
  LayoutDashboard,
  FileText,
  FolderOpen,
  PlusCircle,
  CheckCircle,
  BookOpen,
  Activity,
  Settings,
};

export const Sidebar: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useUser();
  const { isCollapsed, setIsCollapsed } = useSidebar();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [expandedMenus, setExpandedMenus] = useState<Set<string>>(new Set());
  const [hoveredMenu, setHoveredMenu] = useState<string | null>(null);
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 1024);

  useEffect(() => {
    const handleResize = () => {
      const desktop = window.innerWidth >= 1024;
      setIsDesktop(desktop);
      if (desktop) {
        setIsMobileOpen(false);
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize(); // 초기값 설정
    
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const userRole = useMemo(() => {
    if (!user) return null;
    return roleLevelToRole(user.roleLevel);
  }, [user]);

  const { getFilteredMenu } = usePermission(userRole);

  const filteredMenu = useMemo(() => {
    return getFilteredMenu(sidebarMenu);
  }, [getFilteredMenu, userRole]);

  // 현재 경로에 따라 자동으로 메뉴 확장
  useEffect(() => {
    filteredMenu.forEach((item) => {
      if (item.children) {
        const hasActiveChild = item.children.some((child) => isActive(child.path));
        if (hasActiveChild) {
          setExpandedMenus((prev) => new Set(prev).add(item.key));
        }
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const toggleCollapse = () => {
    setIsCollapsed(!isCollapsed);
  };

  const toggleMenu = (key: string) => {
    setExpandedMenus((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const isActive = (path?: string) => {
    if (!path) return false;
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  const isSubMenuActive = (subMenu: SubMenuItem) => {
    return isActive(subMenu.path);
  };

  const handleMenuClick = (item: MenuItem) => {
    if (item.children) {
      if (isCollapsed) {
        return;
      }
      toggleMenu(item.key);
    } else if (item.path) {
      navigate(item.path);
      setIsMobileOpen(false);
    }
  };

  const handleSubMenuClick = (path: string) => {
    navigate(path);
    setIsMobileOpen(false);
  };

  const renderIcon = (iconName?: string, isActive: boolean = false) => {
    if (!iconName) return null;
    const IconComponent = iconMap[iconName];
    if (!IconComponent) return null;
    return (
      <IconComponent
        size={16}
        strokeWidth={1.75}
        style={{ 
          color: isActive ? colors.accent : colors.primaryText,
        }}
      />
    );
  };

  // 메뉴 그룹 분류
  const mainMenuItems = filteredMenu.filter(
    (item) => ['dashboard', 'translation_work', 'document_management', 'new_translation', 'review_approval', 'glossary'].includes(item.key)
  );
  const bottomMenuItems = filteredMenu.filter(
    (item) => ['activity', 'settings'].includes(item.key)
  );

  const renderMenuItem = (item: MenuItem) => {
    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = expandedMenus.has(item.key);
    const isItemActive = isActive(item.path);
    // 부모 메뉴에 path가 있을 때만 자식의 active 상태를 고려
    // path가 없는 부모 메뉴(예: "문서 관리")는 자식이 active여도 부모는 active로 표시하지 않음
    const hasActiveChild = item.path ? item.children?.some((child) => isSubMenuActive(child)) : false;
    const isActiveState = isItemActive || (item.path && hasActiveChild);

    if (isCollapsed && !isMobileOpen) {
      // Collapsed 상태 - 아이콘만 표시
      return (
        <div key={item.key} className="relative group">
          <button
            onClick={() => {
              if (hasChildren) {
                setHoveredMenu(item.key);
              } else if (item.path) {
                navigate(item.path);
              }
            }}
            onMouseEnter={() => setHoveredMenu(item.key)}
            onMouseLeave={() => setHoveredMenu(null)}
            className={`
              w-full flex items-center justify-center
              rounded-lg
              transition-colors
              ${transitions.duration} ${transitions.easing}
              ${isActiveState
                ? ''
                : 'hover:bg-[rgba(192,192,192,0.4)]'
              }
            `}
            style={{
              padding: spacing.menuItemPadding,
              color: isActiveState ? menuStates.active.text : colors.primaryText,
              backgroundColor: isActiveState ? menuStates.active.background : 'transparent',
            }}
            aria-label={item.label}
          >
            {renderIcon(item.icon, isActiveState)}
          </button>

          {/* Tooltip */}
          {hoveredMenu === item.key && !hasChildren && (
            <div
              className="absolute left-full ml-2 px-3 py-2 bg-[#1F2937] text-white text-xs rounded whitespace-nowrap z-50 pointer-events-none"
              style={{
                fontSize: typography.fontSize.sidebarMenu,
                fontFamily: typography.fontFamily,
              }}
            >
              {item.label}
            </div>
          )}

          {/* Dropdown for collapsed state */}
          {hoveredMenu === item.key && hasChildren && (
            <div
              className="absolute left-full ml-2 top-0 w-48 bg-white border border-[#BCCCDC] rounded-lg z-50"
              style={{
                borderRadius: sizes.borderRadius,
              }}
            >
              {item.children?.map((child, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSubMenuClick(child.path)}
                  className={`
                    w-full text-left
                    rounded-lg
                    transition-colors
                    ${transitions.duration} ${transitions.easing}
                    ${isSubMenuActive(child)
                      ? 'bg-white'
                      : 'hover:bg-[rgba(192,192,192,0.4)]'
                    }
                  `}
                  style={{
                    padding: spacing.menuItemPadding,
                    fontSize: typography.fontSize.sidebarSubMenu,
                    fontFamily: typography.fontFamily,
                    fontWeight: typography.fontWeight.subMenu,
                    color: isSubMenuActive(child) ? menuStates.subMenuActive.text : colors.primaryText,
                    backgroundColor: isSubMenuActive(child) ? menuStates.subMenuActive.background : 'transparent',
                  }}
                >
                  {child.label}
                </button>
              ))}
            </div>
          )}
        </div>
      );
    }

    // Expanded 상태
    return (
      <div key={item.key}>
        <button
          onClick={() => handleMenuClick(item)}
          className={`
            w-full flex items-center justify-between
            rounded-lg
            transition-colors
            ${transitions.duration} ${transitions.easing}
            relative
            ${isActiveState
              ? 'bg-white'
              : 'hover:bg-[rgba(217,234,253,0.6)]'
            }
          `}
          style={{
            padding: spacing.menuItemPadding,
            fontSize: typography.fontSize.sidebarMenu,
            fontFamily: typography.fontFamily,
            fontWeight: isActiveState ? 600 : typography.fontWeight.menu, // Active일 때 더 두껍게
            lineHeight: typography.lineHeight,
            color: isActiveState ? menuStates.active.text : colors.primaryText,
            backgroundColor: isActiveState ? menuStates.active.background : 'transparent',
          }}
          aria-label={item.label}
          aria-expanded={hasChildren ? isExpanded : undefined}
        >
          <div className="flex items-center gap-3">
            {renderIcon(item.icon, isActiveState)}
            <span>{item.label}</span>
          </div>
          {hasChildren && (
            <div className="flex-shrink-0">
              {isExpanded ? (
                <ChevronUp size={16} strokeWidth={1.75} />
              ) : (
                <ChevronDown size={16} strokeWidth={1.75} />
              )}
            </div>
          )}
        </button>

        {/* Submenu */}
        {hasChildren && isExpanded && (
          <div
            className="mt-1 space-y-1 relative"
            style={{
              marginLeft: spacing.subMenuIndent,
              paddingLeft: '12px',
            }}
          >
            {/* 세로 구분선 */}
            <div
              className="absolute left-0 top-0 bottom-0"
              style={{
                width: '1px',
                backgroundColor: colors.border,
              }}
            />
            {item.children?.map((child, idx) => (
              <button
                key={idx}
                onClick={() => handleSubMenuClick(child.path)}
                className={`
                  w-full text-left
                  rounded-lg
                  transition-colors
                  ${transitions.duration} ${transitions.easing}
                  ${isSubMenuActive(child)
                    ? ''
                    : 'hover:bg-[rgba(192,192,192,0.4)]'
                  }
                `}
                style={{
                  padding: spacing.menuItemPadding,
                  fontSize: typography.fontSize.sidebarSubMenu,
                  fontFamily: typography.fontFamily,
                  fontWeight: isSubMenuActive(child) ? 500 : typography.fontWeight.subMenu, // Active일 때 더 두껍게
                  lineHeight: typography.lineHeight,
                  color: isSubMenuActive(child) ? menuStates.subMenuActive.text : colors.primaryText,
                  backgroundColor: isSubMenuActive(child) ? menuStates.subMenuActive.background : 'transparent',
                }}
              >
                {child.label}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {/* Mobile Overlay */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={() => setIsMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className="fixed top-0 left-0 h-full z-50 flex flex-col transition-all"
        style={{
          width: isCollapsed && !isMobileOpen ? sizes.sidebarWidth.collapsed : sizes.sidebarWidth.desktop,
          backgroundColor: colors.sidebarBackground,
          borderRight: `1px solid ${colors.border}`,
          transform: isDesktop ? 'translateX(0)' : (isMobileOpen ? 'translateX(0)' : 'translateX(-100%)'),
          transitionDuration: transitions.duration,
          transitionTimingFunction: transitions.easing,
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between border-b"
          style={{
            padding: spacing.sidebarPadding,
            borderColor: colors.border,
          }}
        >
          {(!isCollapsed || isMobileOpen) && (
            <div className="flex items-center gap-2 flex-1">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-white font-semibold"
                style={{
                  backgroundColor: colors.accent,
                  fontSize: '14px',
                }}
              >
                L
              </div>
              <span
                className="font-semibold"
                style={{
                  color: colors.primaryText,
                  fontSize: typography.fontSize.body,
                  fontFamily: typography.fontFamily,
                }}
              >
                LangBridge
              </span>
            </div>
          )}
          {isCollapsed && !isMobileOpen && (
            <div className="w-full flex flex-col items-center gap-2">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-white font-semibold"
                style={{
                  backgroundColor: colors.accent,
                  fontSize: '14px',
                }}
              >
                L
              </div>
              <button
                onClick={toggleCollapse}
                className="p-1 rounded-lg hover:bg-[rgba(217,234,253,0.6)] transition-colors"
                style={{
                  color: colors.primaryText,
                  backgroundColor: 'transparent',
                  transitionDuration: transitions.duration,
                }}
                aria-label="Expand sidebar"
              >
                <Menu size={14} strokeWidth={1.75} />
              </button>
            </div>
          )}
          <div className="flex items-center gap-2">
            {(!isCollapsed || isMobileOpen) && (
              <button
                onClick={toggleCollapse}
                className="p-2 rounded-lg hover:bg-[rgba(192,192,192,0.4)] transition-colors"
                style={{
                  color: colors.primaryText,
                  backgroundColor: 'transparent',
                  transitionDuration: transitions.duration,
                }}
                aria-label="Toggle sidebar"
              >
                <Menu size={16} strokeWidth={1.75} />
              </button>
            )}
            <button
              onClick={() => setIsMobileOpen(false)}
              className="lg:hidden p-2 rounded-lg hover:bg-[rgba(217,234,253,0.6)] transition-colors"
              style={{
                color: colors.primaryText,
                backgroundColor: 'transparent',
                transitionDuration: transitions.duration,
              }}
              aria-label="Close sidebar"
            >
              <X size={16} strokeWidth={1.75} />
            </button>
          </div>
        </div>

        {/* Navigation - Main Menu */}
        <nav
          className="flex-1 overflow-y-auto"
          style={{
            padding: spacing.sidebarPadding,
          }}
        >
          <div className="space-y-2">
            {mainMenuItems.map(renderMenuItem)}
          </div>
        </nav>

        {/* Navigation - Bottom Menu */}
        <div
          style={{
            padding: spacing.sidebarPadding,
            paddingTop: '24px',
          }}
        >
          <div className="space-y-2">
            {bottomMenuItems.map(renderMenuItem)}
          </div>
          
          {/* 로그아웃 버튼 */}
          {user && (
            <div style={{ marginTop: '24px', paddingTop: '24px', borderTop: `1px solid ${colors.border}` }}>
              <button
                onClick={async () => {
                  if (window.confirm('로그아웃하시겠습니까?')) {
                    await logout();
                    navigate('/', { replace: true });
                  }
                }}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: isCollapsed && !isMobileOpen ? '0' : '8px',
                  justifyContent: isCollapsed && !isMobileOpen ? 'center' : 'flex-start',
                  padding: spacing.menuItemPadding,
                  borderRadius: sizes.borderRadius,
                  backgroundColor: 'transparent',
                  border: 'none',
                  color: colors.primaryText,
                  fontSize: typography.fontSize.sidebarMenu,
                  fontWeight: typography.fontWeight.menu,
                  cursor: 'pointer',
                  transition: `background-color ${transitions.duration} ${transitions.easing}`,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = menuStates.hover.background;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
                title={isCollapsed && !isMobileOpen ? '로그아웃' : undefined}
              >
                <LogOut size={16} strokeWidth={1.75} />
                {(!isCollapsed || isMobileOpen) && <span>로그아웃</span>}
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Mobile Menu Button */}
      <button
        onClick={() => setIsMobileOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-30 p-2 bg-white rounded-lg border transition-colors"
        style={{
          borderColor: colors.border,
          color: colors.primaryText,
          transitionDuration: transitions.duration,
        }}
        aria-label="Open menu"
      >
        <Menu size={20} strokeWidth={1.75} />
      </button>
    </>
  );
};
