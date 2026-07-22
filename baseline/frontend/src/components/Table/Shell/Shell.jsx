import { Alert, Box, CircularProgress, Stack } from '@mui/material';

import { EmptyState } from '../EmptyState/EmptyState';
import { DataTableToolbar } from '../Toolbar/Toolbar';

export function DataTableShell({
  actions,
  children,
  description,
  emptyDescription,
  emptyTitle,
  error,
  filters,
  isEmpty,
  loading,
  pagination,
  onReset,
  onSearchChange,
  onSearchSubmit,
  searchPlaceholder,
  searchValue,
  title,
}) {
  return (
    <Stack component="section" spacing={2.5}>
      <DataTableToolbar
        actions={actions}
        description={description}
        filters={filters}
        onReset={onReset}
        onSearchChange={onSearchChange}
        onSearchSubmit={onSearchSubmit}
        searchPlaceholder={searchPlaceholder}
        searchValue={searchValue}
        title={title}
      />

      <Stack spacing={2}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 6 }}>
            <CircularProgress />
          </Box>
        ) : null}

        {!loading && error ? <Alert severity="error">{error}</Alert> : null}

        {!loading && !error && isEmpty ? (
          <EmptyState title={emptyTitle} description={emptyDescription} />
        ) : null}

        {!loading && !error && !isEmpty ? children : null}

        {!loading && !error && pagination ? pagination : null}
      </Stack>
    </Stack>
  );
}

export { DataTableShell as TableShell };