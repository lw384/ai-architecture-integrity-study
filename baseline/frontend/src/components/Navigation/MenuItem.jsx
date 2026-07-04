import { Link as RouterLink, useLocation } from 'react-router-dom';

import { cn } from '../../utils/cn';
import {
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Tooltip,
} from '@mui/material';

import styles from './MenuItem.module.scss';

export function MenuItem({ item, drawerOpen, onNavigate }) {
  const location = useLocation();
  const Icon = item.icon;
  const selected = item.to ? location.pathname.startsWith(item.to) : false;

  const content = (
    <ListItemButton
      {...(item.to
        ? {
            component: RouterLink,
            to: item.to,
            onClick: onNavigate,
          }
        : {})}
      disabled={item.disabled}
      selected={selected}
      className={cn(
        styles.menuItem,
        drawerOpen ? styles.menuItemExpanded : styles.menuItemCollapsed,
      )}
    >
      <ListItemIcon
        className={cn(
          styles.menuItemIcon,
          drawerOpen ? styles.menuItemIconExpanded : styles.menuItemIconCollapsed,
        )}
      >
        <Icon fontSize="small" />
      </ListItemIcon>
      {drawerOpen ? (
        <ListItemText
          primary={item.label}
          primaryTypographyProps={{ variant: 'body2', fontWeight: 600 }}
          secondaryTypographyProps={{ variant: 'caption', color: 'text.secondary' }}
        />
      ) : null}
    </ListItemButton>
  );

  if (drawerOpen) {
    return content;
  }

  return (
    <Tooltip title={item.label} placement="right">
      {content}
    </Tooltip>
  );
}