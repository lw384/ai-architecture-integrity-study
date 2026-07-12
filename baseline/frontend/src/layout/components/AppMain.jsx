import Toolbar from '@mui/material/Toolbar';
import Box from '@mui/material/Box';

import { Outlet } from 'react-router-dom';

import Breadcrumbs from 'components/Breadcrumbs';
import Footer from './Footer';

// ==============================|| LAYOUT - APP MAIN ||============================== //

export default function AppMain() {
  return (
    <Box component="main" sx={{ flexGrow: 1, width: '100%', p: { xs: 2, sm: 3 } }}>
      <Toolbar sx={{ mt: 'inherit' }} />
      <Box
        sx={{
          px: { xs: 0, sm: 2 },
          position: 'relative',
          minHeight: 'calc(100vh - 110px)',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        <Breadcrumbs />
        <Outlet />
        <Footer />
      </Box>
    </Box>
  );
}