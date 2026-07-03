import {
  Button,
  FormControl,
  MenuItem,
  Select,
  Stack,
  Typography,
} from '@mui/material';

import styles from './Pagination.module.scss';

const PAGE_SIZE_OPTIONS = [10, 25, 50];

export function DataTablePagination({
  page,
  pageSize,
  total,
  totalPages,
  onPageChange,
  onPageSizeChange,
}) {
  return (
    <div className={styles.pagination}>
      <Typography variant="body2" className={styles.summary}>
        {total === 0
          ? 'No matching records'
          : `Showing page ${page} of ${Math.max(totalPages, 1)} · ${total} records`}
      </Typography>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems="center">
        <FormControl size="small" className={styles.pageSizeControl}>
          <Select
            value={String(pageSize)}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
          >
            {PAGE_SIZE_OPTIONS.map((option) => (
              <MenuItem key={option} value={String(option)}>
                {option} / page
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <Stack direction="row" spacing={1}>
          <Button disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
            Previous
          </Button>
          <Button
            disabled={totalPages === 0 || page >= totalPages}
            variant="contained"
            onClick={() => onPageChange(page + 1)}
          >
            Next
          </Button>
        </Stack>
      </Stack>
    </div>
  );
}

export { DataTablePagination as Pagination };