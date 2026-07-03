import { useMemo, useState } from 'react';
import { Outlet } from 'react-router-dom';

import MenuRoundedIcon from '@mui/icons-material/MenuRounded';
import MenuOpenRoundedIcon from '@mui/icons-material/MenuOpenRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import {
  AppBar,
  Box,
  Drawer,
  IconButton,
  Toolbar,
  Tooltip,
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { useQueryClient } from '@tanstack/react-query';

import { cn } from '../utils/cn';
import { Sidebar } from '../components/Navigation/Sidebar';
import { DRAWER_WIDTH, MINI_DRAWER_WIDTH } from './constants';
import styles from './AppLayout.module.scss';

export function AppLayout() {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const [desktopDrawerOpen, setDesktopDrawerOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const queryClient = useQueryClient();

  const drawerOpen = isDesktop ? desktopDrawerOpen : mobileOpen;
  const desktopDrawerWidth = desktopDrawerOpen ? DRAWER_WIDTH : MINI_DRAWER_WIDTH;

  const handleDrawerToggle = () => {
    if (isDesktop) {
      setDesktopDrawerOpen((open) => !open);
      return;
    }

    setMobileOpen((open) => !open);
  };

  const handleNavigate = () => {
    if (!isDesktop) {
      setMobileOpen(false);
    }
  };

  const sidebarContent = useMemo(
    () => <Sidebar drawerOpen={drawerOpen} onNavigate={handleNavigate} />,
    [drawerOpen],
  );

  const desktopNavClassName = desktopDrawerOpen
    ? styles.navDesktopExpanded
    : styles.navDesktopCollapsed;

  const desktopPaperClassName = desktopDrawerOpen
    ? styles.drawerPaperDesktopExpanded
    : styles.drawerPaperDesktopCollapsed;

  return (
    <Box className={styles.shell}>
      <AppBar
        position="fixed"
        color="inherit"
        elevation={0}
        className={cn(
          styles.appBar,
          desktopDrawerOpen ? styles.appBarDesktopExpanded : styles.appBarDesktopCollapsed,
        )}
      >
        <Toolbar className={styles.toolbar}>
          <IconButton color="inherit" edge="start" onClick={handleDrawerToggle}>
            {isDesktop && drawerOpen ? <MenuOpenRoundedIcon /> : <MenuRoundedIcon />}
          </IconButton>

          <Box className={styles.headerSpacer} />

          <Tooltip title="Refresh all visible data">
            <IconButton
              color="inherit"
              onClick={() => {
                queryClient.invalidateQueries();
              }}
            >
              <RefreshRoundedIcon />
            </IconButton>
          </Tooltip>
        </Toolbar>
      </AppBar>

      <Box component="nav" className={cn(styles.nav, desktopNavClassName)}>
        {isDesktop ? (
          <Drawer
            variant="permanent"
            open
            className={styles.desktopDrawer}
            slotProps={{
              paper: {
                className: cn(styles.drawerPaper, desktopPaperClassName),
              },
            }}
          >
            {sidebarContent}
          </Drawer>
        ) : (
          <Drawer
            variant="temporary"
            open={mobileOpen}
            onClose={() => setMobileOpen(false)}
            ModalProps={{ keepMounted: true }}
            className={styles.mobileDrawer}
            slotProps={{
              paper: {
                className: cn(styles.drawerPaper, styles.drawerPaperMobile),
              },
            }}
          >
            {sidebarContent}
          </Drawer>
        )}
      </Box>

      <Box component="main" className={styles.main}>
        <Outlet />
      </Box>
    </Box>
  );
}