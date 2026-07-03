import { Button, Stack, TextField, Typography } from '@mui/material';

import styles from './Toolbar.module.scss';

export function DataTableToolbar({
  actions,
  description,
  filters,
  onReset,
  onSearchChange,
  onSearchSubmit,
  searchPlaceholder,
  searchValue,
  title,
}) {
  return (
    <div className={styles.toolbarShell}>
      <div className={styles.headerRow}>
        <div>
          <Typography variant="h4">{title}</Typography>
          {description ? (
            <Typography className={styles.description}>{description}</Typography>
          ) : null}
        </div>
        {actions ? <div className={styles.actions}>{actions}</div> : null}
      </div>

      <form className={styles.filtersForm} onSubmit={onSearchSubmit}>
        <TextField
          size="small"
          placeholder={searchPlaceholder}
          value={searchValue}
          onChange={(event) => onSearchChange(event.target.value)}
          className={styles.searchField}
        />

        {filters ? <div className={styles.filters}>{filters}</div> : null}

        <Stack direction="row" spacing={1} className={styles.submitActions}>
          <Button type="submit" variant="contained">
            Query
          </Button>
          <Button type="button" onClick={onReset}>
            Reset
          </Button>
        </Stack>
      </form>
    </div>
  );
}

export { DataTableToolbar as Toolbar };