import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

export default function Footer() {
  return (
    <Box
      component="footer"
      sx={{
        mt: 'auto',
        px: 2,
        pt: 3,
        display: 'flex',
        flexDirection: { xs: 'column', sm: 'row' },
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 1.5,
        textAlign: { xs: 'center', sm: 'left' },
        color: 'text.primary',
      }}
    >
      <Typography component="p" variant="caption" sx={{ m: 0 }}>
        &copy; All rights reserved{' '}
      </Typography>
    </Box>
  );
}