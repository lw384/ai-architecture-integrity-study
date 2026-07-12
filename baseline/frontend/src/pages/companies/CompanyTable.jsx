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
import DeleteOutlined from '@ant-design/icons/DeleteOutlined';
import EditOutlined from '@ant-design/icons/EditOutlined';
import EyeOutlined from '@ant-design/icons/EyeOutlined';

function formatDate(value) {
  if (!value) {
    return '—';
  }

  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

const statusColors = {
  "1": 'success',
  "0": 'default',
  "2": 'warning',
};

const statusLabels = {
  "1": 'Active',
  "0": 'Inactive',
  "2": 'Pending',
};

export function CompanyTable({ companies, onDelete, onEdit, onView }) {
  return (
    <TableContainer component={Paper} className="crm-table-shell">
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>Company</TableCell>
            <TableCell>Email</TableCell>
            <TableCell>Status</TableCell>
            <TableCell>Last contacted</TableCell>
            <TableCell>Created</TableCell>
            <TableCell align="right">Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {companies.map((company) => (
            <TableRow key={company.id} hover>
              <TableCell>
                <Stack spacing={0.5}>
                  <Typography fontWeight={600}>{company.name}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {company.id}
                  </Typography>
                </Stack>
              </TableCell>
              <TableCell>{company.email || '—'}</TableCell>
              <TableCell>
                <Chip
                  label={statusLabels[company.status]}
                  color={statusColors[company.status]}
                  size="small"
                />
              </TableCell>
              <TableCell>{formatDate(company.lastContactedAt)}</TableCell>
              <TableCell>{formatDate(company.createdAt)}</TableCell>
              <TableCell align="right">
                <Stack direction="row" spacing={1} justifyContent="flex-end">
                  <Button
                    size="small"
                    startIcon={<EyeOutlined />}
                    onClick={() => onView(company)}
                  >
                    View
                  </Button>
                  <IconButton onClick={() => onEdit(company)}>
                    <EditOutlined />
                  </IconButton>
                  <IconButton color="error" onClick={() => onDelete(company)}>
                    <DeleteOutlined />
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