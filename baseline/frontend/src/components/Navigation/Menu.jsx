import { cn } from '../../utils/cn';
import { List } from '@mui/material';

import { navigationItems } from '../../routes/router';
import { MenuItem } from './MenuItem';

export function Menu({ drawerOpen, onNavigate }) {
  return (
  <List className={cn( 'grid gap-2', 'px-3 pb-3',drawerOpen ? 'pt-8' : 'pt-6')}>
      {navigationItems.map((item) => (
        <MenuItem
          key={item.id}
          item={item}
          drawerOpen={drawerOpen}
          onNavigate={onNavigate}
        />
      ))}
    </List>
  );
}