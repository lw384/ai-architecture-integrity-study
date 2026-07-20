import { Paper, Stack, Typography } from '@mui/material';

export function EmptyState({ description, title }) {
  return (
    <Paper sx={{ borderRadius: 4, p: 4, textAlign: 'center' }}>
      <Stack spacing={0.5}>
        <Typography variant="h6">{title}</Typography>
      {description ? (
          <Typography color="text.secondary">{description}</Typography>
      ) : null}
      </Stack>
    </Paper>
  );
}