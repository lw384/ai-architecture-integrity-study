import PropTypes from 'prop-types';

// material-ui
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';

// project import
import NavGroup from './NavGroup';
import useRouteAccess from 'hooks/useRouteAccess';

// ==============================|| SIDEBAR CONTENT - NAVIGATION ||============================== //

export default function Navigation({ isSidebarExpanded }) {
  const { filteredMenuGroups, isLoading } = useRouteAccess();

  if (isLoading) {
    return <Box sx={{ pt: 2 }} />;
  }

  const navGroups = filteredMenuGroups.map((item) => {
    switch (item.type) {
      case 'group':
        return <NavGroup key={item.id} item={item} isSidebarExpanded={isSidebarExpanded} />;
      default:
        return (
          <Typography key={item.id} variant="h6" sx={{ color: 'error.main', textAlign: 'center' }}>
            Fix - Navigation Group
          </Typography>
        );
    }
  });

  return <Box sx={{ pt: 2 }}>{navGroups}</Box>;
}

Navigation.propTypes = { isSidebarExpanded: PropTypes.bool.isRequired };