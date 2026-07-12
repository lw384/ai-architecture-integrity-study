import PropTypes from 'prop-types';

// material-ui
import List from '@mui/material/List';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';

// project import
import NavItem from './NavItem';

// ==============================|| SIDEBAR NAVIGATION - LIST GROUP ||============================== //

export default function NavGroup({ item, isSidebarExpanded }) {
  const navCollapse = item.children?.map((menuItem) => {
    switch (menuItem.type) {
      case 'collapse':
        return (
          <Typography key={menuItem.id} variant="caption" sx={{ p: 2.5, color: 'error.main' }}>
            collapse - only available in paid version
          </Typography>
        );
      case 'item':
        return <NavItem key={menuItem.id} item={menuItem} level={1} isSidebarExpanded={isSidebarExpanded} />;
      default:
        return (
          <Typography key={menuItem.id} variant="h6" sx={{ color: 'error.main', textAlign: 'center' }}>
            Fix - Group Collapse or Items
          </Typography>
        );
    }
  });

  return (
    <List
      subheader={
        item.title &&
        isSidebarExpanded && (
          <Box sx={{ pl: 3, mb: 1.5 }}>
            <Typography variant="subtitle2" sx={{ color: 'text.secondary' }}>
              {item.title}
            </Typography>
          </Box>
        )
      }
      sx={{ mb: isSidebarExpanded ? 1.5 : 0, py: 0, zIndex: 0 }}
    >
      {navCollapse}
    </List>
  );
}

NavGroup.propTypes = { item: PropTypes.object, isSidebarExpanded: PropTypes.bool.isRequired };