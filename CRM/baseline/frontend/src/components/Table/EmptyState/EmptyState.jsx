import { Paper, Typography } from '@mui/material';

import styles from './EmptyState.module.scss';

export function EmptyState({ description, title }) {
  return (
    <Paper className={styles.emptyState}>
      <Typography variant="h6">{title}</Typography>
      {description ? (
        <Typography className={styles.description}>{description}</Typography>
      ) : null}
    </Paper>
  );
}