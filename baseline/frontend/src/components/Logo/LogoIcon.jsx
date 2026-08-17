import Box from '@mui/material/Box';

// ==============================|| LOGO ICON PLACEHOLDER ||============================== //

export default function LogoIcon() {
  return (
    <Box
      component="svg"
      width="35"
      height="35"
      viewBox="0 0 35 35"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      sx={{ display: 'block', flexShrink: 0 }}
    >
      <Box component="rect" width="35" height="35" rx="8" sx={(theme) => ({ fill: theme.vars.palette.primary.main })} />
      <Box
        component="text"
        x="50%"
        y="52%"
        textAnchor="middle"
        dominantBaseline="middle"
        sx={(theme) => ({ fill: theme.vars.palette.primary.contrastText, fontSize: '1.125rem', fontWeight: 700 })}
      >
        C
      </Box>
    </Box>
  );
}
