import {
  Button,
  Chip,
  IconButton,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded';

function formatDate(value) {
  if (!value) {
    return '—';
  }

  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function CustomerTable({ customers, onDelete, onEdit, onView }) {
  return (
    <TableContainer component={Paper} className="crm-table-shell">
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>Name</TableCell>
            <TableCell>Company</TableCell>
            <TableCell>Email</TableCell>
            <TableCell>Status</TableCell>
            <TableCell>Last contacted</TableCell>
            <TableCell>Created</TableCell>
            <TableCell align="right">Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {customers.map((customer) => (
            <TableRow key={customer.id} hover>
              <TableCell>
                <Stack spacing={0.5}>
                  <Typography fontWeight={600}>{customer.name}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Customer #{customer.id}
                  </Typography>
                </Stack>
              </TableCell>
              <TableCell>{customer.company || '—'}</TableCell>
              <TableCell>{customer.email || '—'}</TableCell>
              <TableCell>
                <Chip
                  label={customer.status}
                  color={customer.status === 'active' ? 'success' : 'default'}
                  size="small"
                />
              </TableCell>
              <TableCell>{formatDate(customer.lastContactedAt)}</TableCell>
              <TableCell>{formatDate(customer.createdAt)}</TableCell>
              <TableCell align="right">
                <Stack direction="row" spacing={1} justifyContent="flex-end">
                  <Button
                    size="small"
                    startIcon={<VisibilityRoundedIcon />}
                    onClick={() => onView(customer)}
                  >
                    View
                  </Button>
                  <IconButton onClick={() => onEdit(customer)}>
                    <EditRoundedIcon />
                  </IconButton>
                  <IconButton color="error" onClick={() => onDelete(customer)}>
                    <DeleteOutlineRoundedIcon />
                  </IconButton>
                </Stack>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}