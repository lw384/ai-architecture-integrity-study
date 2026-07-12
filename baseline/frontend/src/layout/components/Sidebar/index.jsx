import PropTypes from 'prop-types';
import { useMemo } from 'react';

// material-ui
import Drawer from '@mui/material/Drawer';
import useMediaQuery from '@mui/material/useMediaQuery';

// project imports
import DrawerHeader from './DrawerHeader';
import DrawerContent from './DrawerContent';

import useLayoutSettings from 'hooks/useLayoutSettings';

// ==============================|| LAYOUT - SIDEBAR ||============================== //

// Mirrors DRAWER_WIDTH (260px) / MINI_DRAWER_WIDTH (60px) from src/config.js, and MUI's
// default transition timings (theme.transitions.duration.enteringScreen/leavingScreen,
// easing.sharp) which this app doesn't customize.
const drawerTransitionClass = 'overflow-hidden box-border transition-[width] ease-[cubic-bezier(0.4,0,0.6,1)]';
const drawerExpandedClass = `${drawerTransitionClass} w-[260px] border-r border-divider shadow-none duration-[225ms]`;
const drawerCollapsedClass = `${drawerTransitionClass} w-[60px] border-r-0 shadow-z1 duration-[195ms]`;

export default function Sidebar({ window }) {
  const downLG = useMediaQuery((theme) => theme.breakpoints.down('lg'));
  const { state, setMobileSidebarOpen } = useLayoutSettings();
  const isDesktopSidebarExpanded = !state.isSidebarCollapsed;
  const isSidebarExpanded = downLG ? state.isMobileSidebarOpen : isDesktopSidebarExpanded;

  const container = window !== undefined ? () => window().document.body : undefined;
  const drawerContent = useMemo(() => <DrawerContent isSidebarExpanded={isSidebarExpanded} />, [isSidebarExpanded]);
  const drawerHeader = useMemo(() => <DrawerHeader open={isSidebarExpanded} />, [isSidebarExpanded]);

  const desktopDrawerStateClass = isDesktopSidebarExpanded ? drawerExpandedClass : drawerCollapsedClass;

  return (
    <nav className="z-[1200] md:shrink-0" aria-label="mailbox folders">
      {!downLG ? (
        <Drawer
          variant="permanent"
          open={isDesktopSidebarExpanded}
          className={`shrink-0 whitespace-nowrap ${desktopDrawerStateClass}`}
          slotProps={{ paper: { className: desktopDrawerStateClass } }}
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
          className={`${state.isMobileSidebarOpen ? 'block' : 'hidden'} lg:hidden`}
          slotProps={{
            paper: {
              className: 'box-border w-[260px] border-r border-divider shadow-[inherit]'
            }
          }}
        >
          {drawerHeader}
          {drawerContent}
        </Drawer>
      )}
    </nav>
  );
}

Sidebar.propTypes = { window: PropTypes.func };
