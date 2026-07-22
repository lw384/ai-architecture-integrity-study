import { useEffect } from 'react';

import Box from '@mui/material/Box';
import useMediaQuery from '@mui/material/useMediaQuery';

import ScrollTop from 'components/ScrollTop';
import useLayoutSettings from 'hooks/useLayoutSettings';

import AppMain from './components/AppMain';
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';

// ==============================|| LAYOUT SHELL ||============================== //

export default function Layout() {
  const { setMobileSidebarOpen, setSidebarCollapsed } = useLayoutSettings();
  const downXL = useMediaQuery((theme) => theme.breakpoints.down('xl'));

  useEffect(() => {
    if (downXL) {
      setMobileSidebarOpen(false);
      return;
    }

    setSidebarCollapsed(false);
  }, [downXL, setMobileSidebarOpen, setSidebarCollapsed]);

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', width: '100%', bgcolor: 'background.default', color: 'text.primary' }}>
      <ScrollTop />
      <Sidebar />
      <Box sx={{ display: 'flex', minWidth: 0, flex: 1, flexDirection: 'column' }}>
        <Navbar />
        <AppMain />
      </Box>
    </Box>
  );
}