import { useEffect } from 'react';

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
    <div className="flex min-h-screen w-full bg-surface-subtle text-text">
      <ScrollTop />
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Navbar />
        <AppMain />
      </div>
    </div>
  );
}