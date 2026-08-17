import { useMemo } from 'react';

// material-ui
import useMediaQuery from '@mui/material/useMediaQuery';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';

// project imports
import HeaderContent from './HeaderContent';
import IconButton from 'components/IconButton';

import useLayoutSettings from 'hooks/useLayoutSettings';
import { DRAWER_WIDTH, MINI_DRAWER_WIDTH } from 'config';

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
        sx={{
          ml: { xs: 0, lg: -2 },
          color: 'text.primary',
          bgcolor: drawerOpen ? 'transparent' : 'grey.100',
        }}
      >
        {!drawerOpen ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
      </IconButton>
      {headerContent}
    </Toolbar>
  );

  const desktopDrawerWidth = drawerOpen ? DRAWER_WIDTH : MINI_DRAWER_WIDTH;

  return (
    <AppBar
      position="fixed"
      color="inherit"
      elevation={0}
      sx={{
        width: { xs: '100%', lg: `calc(100% - ${desktopDrawerWidth}px)` },
        ml: { xs: 0, lg: drawerOpen ? `${DRAWER_WIDTH}px` : 0 },
        zIndex: 1200,
        borderBottom: 1,
        borderColor: 'divider',
        transition: (theme) =>
          theme.transitions.create(['width', 'margin'], {
            duration: 225,
            easing: 'cubic-bezier(0.4,0,0.6,1)',
          }),
      }}
    >
      {mainHeader}
    </AppBar>
  );
}
