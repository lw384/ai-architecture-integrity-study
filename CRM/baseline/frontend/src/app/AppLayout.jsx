import {
  AppBar,
  Box,
  Chip,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  Toolbar,
  Tooltip,
  Typography,
  useMediaQuery,
} from '@mui/material';
import PeopleAltRoundedIcon from '@mui/icons-material/PeopleAltRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import SellRoundedIcon from '@mui/icons-material/SellRounded';
import MenuRoundedIcon from '@mui/icons-material/MenuRounded';
import { useTheme } from '@mui/material/styles';
import { useQueryClient } from '@tanstack/react-query';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useState } from 'react';

const drawerWidth = 280;

export function AppLayout() {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  const sidebar = (
    <Box sx={{ display: 'flex', height: '100%', flexDirection: 'column' }}>
      <Box sx={{ px: 3, py: 4 }}>
        <Typography variant="overline" sx={{ letterSpacing: 2.4 }}>
          Workspace
        </Typography>
        <Typography variant="h5" sx={{ mt: 1 }}>
          CRM Baseline
        </Typography>
        <Typography sx={{ mt: 1.5, color: 'rgba(248,245,239,0.74)' }}>
          Customers stay at the center. Contacts, interactions, and deals all
          live inside the customer detail view.
        </Typography>
      </Box>

      <Divider sx={{ borderColor: 'rgba(248,245,239,0.12)' }} />

      <List sx={{ px: 2, py: 2, gap: 1, display: 'grid' }}>
        <ListItemButton
          selected={location.pathname.startsWith('/customers')}
          onClick={() => {
            navigate('/customers');
            setMobileOpen(false);
          }}
          sx={{ borderRadius: 3 }}
        >
          <ListItemIcon sx={{ minWidth: 40, color: 'inherit' }}>
            <PeopleAltRoundedIcon />
          </ListItemIcon>
          <ListItemText
            primary="Customers"
            secondary="List, detail, contacts, interactions, deals"
            secondaryTypographyProps={{ color: 'rgba(248,245,239,0.62)' }}
          />
        </ListItemButton>

        <ListItemButton disabled sx={{ borderRadius: 3, opacity: 0.84 }}>
          <ListItemIcon sx={{ minWidth: 40, color: 'inherit' }}>
            <SellRoundedIcon />
          </ListItemIcon>
          <ListItemText
            primary="Deals"
            secondary="Managed inside customer detail"
            secondaryTypographyProps={{ color: 'rgba(248,245,239,0.62)' }}
          />
        </ListItemButton>
      </List>

      <Box sx={{ mt: 'auto', p: 3 }}>
        <Box
          sx={{
            borderRadius: 4,
            border: '1px solid rgba(248,245,239,0.12)',
            bgcolor: 'rgba(248,245,239,0.06)',
            p: 2.5,
          }}
        >
          <Typography variant="subtitle2">Validation Surface</Typography>
          <Typography sx={{ mt: 1, color: 'rgba(248,245,239,0.7)' }}>
            UI only helps trigger backend rules. The service layer still owns the
            real checks.
          </Typography>
        </Box>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <AppBar
        position="fixed"
        sx={{
          width: { md: `calc(100% - ${drawerWidth}px)` },
          ml: { md: `${drawerWidth}px` },
        }}
      >
        <Toolbar sx={{ gap: 2 }}>
          {!isDesktop ? (
            <IconButton
              color="inherit"
              edge="start"
              onClick={() => setMobileOpen(true)}
            >
              <MenuRoundedIcon />
            </IconButton>
          ) : null}

          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="h6">CRM Baseline Admin</Typography>
            <Typography variant="body2" sx={{ opacity: 0.84 }}>
              MUI + React Query + JavaScript boundary preserved
            </Typography>
          </Box>

          <Stack direction="row" spacing={1} alignItems="center">
            <Chip label="baseline-v1" color="secondary" />
            <Chip label="API /api" variant="outlined" sx={{ color: 'white' }} />
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
          </Stack>
        </Toolbar>
      </AppBar>

      <Box
        component="nav"
        sx={{ width: { md: drawerWidth }, flexShrink: { md: 0 } }}
      >
        <Drawer
          variant={isDesktop ? 'permanent' : 'temporary'}
          open={isDesktop ? true : mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: drawerWidth,
            },
          }}
        >
          {sidebar}
        </Drawer>
      </Box>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          px: { xs: 2, sm: 3, md: 4 },
          pb: 5,
          pt: { xs: 11, md: 12 },
          minWidth: 0,
        }}
      >
        <Outlet />
      </Box>
    </Box>
  );
}