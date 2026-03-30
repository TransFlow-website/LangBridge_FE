import React, { useState, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { useSidebar } from '../contexts/SidebarContext';
import { colors, sizes, transitions } from '../constants/designTokens';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { isCollapsed } = useSidebar();
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 1024);

  useEffect(() => {
    const handleResize = () => {
      setIsDesktop(window.innerWidth >= 1024);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div
      className="flex h-screen min-w-0 w-full max-w-full"
      style={{
        backgroundColor: colors.primaryBackground,
      }}
    >
      <Sidebar />
      <main
        className="flex min-w-0 flex-1 overflow-y-auto overflow-x-auto transition-all"
        style={{
          boxSizing: 'border-box',
          minWidth: 0,
          /* flex-1만 쓰고 width:100% 제거 — 100%+padding과 겹치면 가로 넘침 발생 */
          flex: '1 1 0%',
          paddingLeft: isDesktop ? (isCollapsed ? sizes.sidebarWidth.collapsed : sizes.sidebarWidth.desktop) : '0',
          transitionDuration: transitions.duration,
          transitionTimingFunction: transitions.easing,
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: '100%',
            minWidth: 0,
            boxSizing: 'border-box',
          }}
        >
          {children}
        </div>
      </main>
    </div>
  );
};

