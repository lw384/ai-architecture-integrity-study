import PropTypes from 'prop-types';

// material-ui
import Box from '@mui/material/Box';

// project imports
import Logo from 'components/Logo';

// ==============================|| SIDEBAR HEADER ||============================== //

export default function DrawerHeader({ open }) {
  return (
    <Box
      sx={(theme) => ({
        display: 'flex',
        alignItems: 'center',
        justifyContent: open ? 'flex-start' : 'center',
        width: 'auto',
        minHeight: theme.mixins.toolbar.minHeight,
        py: 1,
        pl: open ? 3 : 0
      })}
    >
      <Logo isIcon={!open} sx={{ width: open ? 'auto' : 35, height: 35 }} />
    </Box>
  );
}

DrawerHeader.propTypes = { open: PropTypes.bool };
