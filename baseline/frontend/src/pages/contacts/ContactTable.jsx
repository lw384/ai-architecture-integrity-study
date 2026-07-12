import {
  Button,
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
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function ContactTable({ contacts, onView, onDelete, onEdit }) {
  return (
    <TableContainer component={Paper} className="crm-table-shell">
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Name</TableCell>
            <TableCell>Email</TableCell>
            <TableCell>Phone</TableCell>
            <TableCell>Role</TableCell>

            <TableCell>Last Contacted</TableCell>
            <TableCell>Created</TableCell>
            <TableCell align="right">Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {contacts.map((contact) => (
            <TableRow key={contact.id} hover>
              <TableCell>{contact.name}</TableCell>
              <TableCell>{contact.email || '—'}</TableCell>
              <TableCell>{contact.phone || '—'}</TableCell>
              <TableCell>{contact.role || '—'}</TableCell>
              <TableCell>{formatDate(contact.lastContactedAt)}</TableCell>
              <TableCell>{formatDate(contact.createdAt)}</TableCell>
              <TableCell align="right">
                <Stack direction="row" spacing={1} justifyContent="flex-end">
                  <Button
                    size="small"
                    startIcon={<EyeOutlined />}
                    onClick={() => onView(contact)}
                  >
                    View
                  </Button>
                  <IconButton onClick={() => onEdit(contact)}>
                    <EditOutlined />
                  </IconButton>
                  <IconButton color="error" onClick={() => onDelete(contact)}>
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