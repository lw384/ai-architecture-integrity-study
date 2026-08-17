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
import formatDate from 'utils/formatDate';

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

const industryLabels = {
  TECHNOLOGY: 'Technology',
  FINANCE: 'Finance',
  HEALTHCARE: 'Healthcare',
  RETAIL: 'Retail',
  OTHER: 'Other',
};


function StatusCell({ status }) {
  if (!status) {
    return <TableCell>—</TableCell>;
  }

  return (
    <TableCell>
      <Chip
        label={statusLabels[status] || 'Unknown'}
        color={statusColors[status] || 'default'}
        size="small"
      />
    </TableCell>
  );
}

function IndustryCell({ industry }) {
  if (!industry) {
    return <TableCell>—</TableCell>;
  }

  return (
    <TableCell>
      <Chip
        label={industryLabels[industry] || industry}
        size="small"
        variant="outlined" // 使用描边样式与 Status 区分开
      />
    </TableCell>
  );
}

function ActionCell({ company, onView, onEdit, onDelete }) {
  return (
    <TableCell align="right">
      <Stack direction="row" spacing={1} justifyContent="flex-end">
        <Button
          size="small"
          startIcon={<EyeOutlined />}
          onClick={() => onView(company)}
        >
          View
        </Button>
        <IconButton onClick={() => onEdit(company)} aria-label="edit">
          <EditOutlined />
        </IconButton>
        <IconButton color="error" onClick={() => onDelete(company)} aria-label="delete">
          <DeleteOutlined />
        </IconButton>
      </Stack>
    </TableCell>
  );
}

// main component

export function CompanyTable({ companies, onDelete, onEdit, onView }) {
  return (
    <TableContainer component={Paper} className="crm-table-shell">
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>Company</TableCell>
            <TableCell>Email</TableCell>
            <TableCell>Industry</TableCell> {/* 新增了行业列头 */}
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

              <IndustryCell industry={company.industry} />

              <StatusCell status={company.status} />

              <TableCell>{formatDate(company.lastContactedAt)}</TableCell>

              <TableCell>{formatDate(company.createdAt)}</TableCell>

              <ActionCell
                company={company}
                onView={onView}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
