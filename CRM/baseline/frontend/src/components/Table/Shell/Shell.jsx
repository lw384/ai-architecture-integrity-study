import { Alert, CircularProgress } from '@mui/material';

import { EmptyState } from '../EmptyState/EmptyState';
import { DataTableToolbar } from '../Toolbar/Toolbar';
import styles from './Shell.module.scss';

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
    <section className={styles.shell}>
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

      <div className={styles.content}>
        {loading ? (
          <div className={styles.loadingState}>
            <CircularProgress />
          </div>
        ) : null}

        {!loading && error ? <Alert severity="error">{error}</Alert> : null}

        {!loading && !error && isEmpty ? (
          <EmptyState title={emptyTitle} description={emptyDescription} />
        ) : null}

        {!loading && !error && !isEmpty ? children : null}

        {!loading && !error && pagination ? pagination : null}
      </div>
    </section>
  );
}

export { DataTableShell as TableShell };