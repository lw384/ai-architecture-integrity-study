import { useMemo } from 'react';

// material-ui
import useMediaQuery from '@mui/material/useMediaQuery';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';

// project imports
import HeaderContent from './HeaderContent';
import IconButton from 'components/IconButton';

import useLayoutSettings from 'hooks/useLayoutSettings';

// assets
import MenuFoldOutlined from '@ant-design/icons/MenuFoldOutlined';
import MenuUnfoldOutlined from '@ant-design/icons/MenuUnfoldOutlined';

// ==============================|| LAYOUT - NAVBAR ||============================== //

export default function Navbar() {
  const downLG = useMediaQuery((theme) => theme.breakpoints.down('lg'));
  const { state, toggleMobileSidebar, toggleSidebarCollapsed } = useLayoutSettings();
  const drawerOpen = downLG ? state.isMobileSidebarOpen : !state.isSidebarCollapsed;

  const headerContent = useMemo(() => <HeaderContent />, []);

  const handleSidebarToggle = () => {
    if (downLG) {
      toggleMobileSidebar();
      return;
    }

    toggleSidebarCollapsed();
  };

  const mainHeader = (
    <Toolbar>
      <IconButton
        aria-label="open drawer"
        onClick={handleSidebarToggle}
        edge="start"
        color="secondary"
        variant="light"
        className={`ml-0 lg:-ml-4 text-text ${drawerOpen ? 'bg-transparent' : 'bg-grey-100'}`}
      >
        {!drawerOpen ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
      </IconButton>
      {headerContent}
    </Toolbar>
  );

  // Desktop AppBar width/margin track the mini-drawer's collapsed (60px) / expanded (260px)
  // width from src/config.js (DRAWER_WIDTH / MINI_DRAWER_WIDTH). Only two states exist, so we
  // pick between two literal Tailwind class strings instead of computing one at runtime.
  const desktopWidthClass = drawerOpen ? 'lg:ml-[260px] lg:w-[calc(100%-260px)]' : 'lg:w-[calc(100%-60px)]';

  return (
    <AppBar
      position="fixed"
      color="inherit"
      elevation={0}
      className={`w-full z-[1200] border-b border-divider transition-[width,margin] duration-[225ms] ease-[cubic-bezier(0.4,0,0.6,1)] ${desktopWidthClass}`}
    >
      {mainHeader}
    </AppBar>
  );
}
