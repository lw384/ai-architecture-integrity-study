import { cn } from '../../utils/cn';
import styles from './Sidebar.module.scss';
import { Box, Divider, Typography } from '@mui/material';

import { Menu } from './Menu';

export function Sidebar({ drawerOpen, onNavigate }) {
  return (
    <Box className={cn('flex h-full flex-col', styles.sidebarShell)}>
      <Box className={cn(styles.brand, drawerOpen ? styles.brandExpanded : styles.brandCollapsed)}>
        <Typography
          variant="h6"
          className={cn(
            styles.brandTitle,
            drawerOpen ? styles.brandTitleExpanded : styles.brandTitleCollapsed,
          )}
        >
          CRM
        </Typography>
      </Box>

      <Divider />

      <Menu drawerOpen={drawerOpen} onNavigate={onNavigate} />
    </Box>
  );
}