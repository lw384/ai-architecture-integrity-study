import PropTypes from 'prop-types';

// material-ui
import Box from '@mui/material/Box';

// project imports
import Logo from 'components/Logo';

// ==============================|| SIDEBAR HEADER ||============================== //

export default function DrawerHeader({ open }) {
  return (
    <Box
      sx={{
        display: 'flex',
        minHeight: 60,
        width: 'auto',
        alignItems: 'center',
        py: 1,
        justifyContent: open ? 'flex-start' : 'center',
        pl: open ? 3 : 0,
      }}
    >
      <Logo isIcon={!open} sx={{ height: 35, width: open ? 'auto' : 35 }} />
    </Box>
  );
}

DrawerHeader.propTypes = { open: PropTypes.bool };
