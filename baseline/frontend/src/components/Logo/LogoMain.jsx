import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import LogoIcon from './LogoIcon';

// ==============================|| LOGO PLACEHOLDER ||============================== //

export default function LogoMain() {
  return (
    <Stack component="span" direction="row" spacing={1} alignItems="center">
      <LogoIcon />
      <Typography component="span" variant="h6" fontWeight={700} noWrap color="text.primary">
        CRM Baseline
      </Typography>
    </Stack>
  );
}
