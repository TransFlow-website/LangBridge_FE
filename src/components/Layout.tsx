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
      className="flex h-screen"
      style={{
        backgroundColor: colors.primaryBackground,
      }}
    >
      <Sidebar />
      <main
        className="flex-1 overflow-y-auto transition-all"
        style={{
          marginLeft: isDesktop ? (isCollapsed ? sizes.sidebarWidth.collapsed : sizes.sidebarWidth.desktop) : '0',
          transitionDuration: transitions.duration,
          transitionTimingFunction: transitions.easing,
        }}
      >
        {children}
      </main>
    </div>
  );
};

