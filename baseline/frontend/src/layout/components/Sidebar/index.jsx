import PropTypes from 'prop-types';
import { useMemo } from 'react';

// material-ui
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import useMediaQuery from '@mui/material/useMediaQuery';

// project imports
import DrawerHeader from './DrawerHeader';
import DrawerContent from './DrawerContent';

import useLayoutSettings from 'hooks/useLayoutSettings';

// ==============================|| LAYOUT - SIDEBAR ||============================== //

const drawerPaperBaseSx = {
  overflow: 'hidden',
  boxSizing: 'border-box',
  whiteSpace: 'nowrap',
};

const drawerExpandedPaperSx = {
  ...drawerPaperBaseSx,
  width: 260,
  borderRight: 1,
  borderColor: 'divider',
  boxShadow: 'none',
};

const drawerCollapsedPaperSx = {
  ...drawerPaperBaseSx,
  width: 60,
  borderRight: 0,
  boxShadow: (theme) => theme.shadows[1],
};

export default function Sidebar({ window }) {
  const downLG = useMediaQuery((theme) => theme.breakpoints.down('lg'));
  const { state, setMobileSidebarOpen } = useLayoutSettings();
  const isDesktopSidebarExpanded = !state.isSidebarCollapsed;
  const isSidebarExpanded = downLG ? state.isMobileSidebarOpen : isDesktopSidebarExpanded;

  const container = window !== undefined ? () => window().document.body : undefined;
  const drawerContent = useMemo(() => <DrawerContent isSidebarExpanded={isSidebarExpanded} />, [isSidebarExpanded]);
  const drawerHeader = useMemo(() => <DrawerHeader open={isSidebarExpanded} />, [isSidebarExpanded]);

  const desktopDrawerPaperSx = isDesktopSidebarExpanded ? drawerExpandedPaperSx : drawerCollapsedPaperSx;

  return (
    <Box component="nav" sx={{ zIndex: 1200, flexShrink: { md: 0 } }} aria-label="mailbox folders">
      {!downLG ? (
        <Drawer
          variant="permanent"
          open={isDesktopSidebarExpanded}
          sx={{
            width: desktopDrawerPaperSx.width,
            flexShrink: 0,
            transition: (theme) =>
              theme.transitions.create('width', {
                easing: theme.transitions.easing.sharp,
                duration: isDesktopSidebarExpanded ? 225 : 195,
              }),
            '& .MuiDrawer-paper': {
              ...desktopDrawerPaperSx,
              transition: (theme) =>
                theme.transitions.create('width', {
                  easing: theme.transitions.easing.sharp,
                  duration: isDesktopSidebarExpanded ? 225 : 195,
                }),
            },
          }}
        >
          {drawerHeader}
          {drawerContent}
        </Drawer>
      ) : (
        <Drawer
          container={container}
          variant="temporary"
          open={state.isMobileSidebarOpen}
          onClose={() => setMobileSidebarOpen(false)}
          ModalProps={{ keepMounted: true }}
          slotProps={{
            paper: {
              sx: {
                boxSizing: 'border-box',
                width: 260,
                borderRight: 1,
                borderColor: 'divider',
                boxShadow: 'inherit',
              },
            },
          }}
        >
          {drawerHeader}
          {drawerContent}
        </Drawer>
      )}
    </Box>
  );
}

Sidebar.propTypes = { window: PropTypes.func };
