import {
  Button,
  FormControl,
  MenuItem,
  Select,
  Stack,
  Typography,
} from '@mui/material';

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
    <Stack
      direction={{ xs: 'column', sm: 'row' }}
      spacing={1.5}
      alignItems="center"
      justifyContent="center"
      useFlexGap
      sx={{ pt: 2, flexWrap: 'wrap' }}
    >
      <Typography variant="body2" color="text.secondary">
        {total === 0
          ? 'No matching records'
          : `Showing page ${page} of ${Math.max(totalPages, 1)} · ${total} records`}
      </Typography>

      <FormControl size="small" sx={{ minWidth: '8.5rem' }}>
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
  );
}

export { DataTablePagination as Pagination };
