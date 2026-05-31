import {
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

function formatDate(value) {
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function ContactTable({ contacts, onDelete, onEdit }) {
  if (!contacts.length) {
    return (
      <Paper sx={{ p: 4, textAlign: 'center', borderRadius: 4 }}>
        <Typography variant="subtitle1">No contacts for this customer</Typography>
        <Typography sx={{ mt: 1, color: 'text.secondary' }}>
          Add one to validate cross-module customer ownership on the backend.
        </Typography>
      </Paper>
    );
  }

  return (
    <TableContainer component={Paper} sx={{ borderRadius: 4 }}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Name</TableCell>
            <TableCell>Email</TableCell>
            <TableCell>Phone</TableCell>
            <TableCell>Role</TableCell>
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
              <TableCell>{formatDate(contact.createdAt)}</TableCell>
              <TableCell align="right">
                <Stack direction="row" spacing={1} justifyContent="flex-end">
                  <IconButton onClick={() => onEdit(contact)}>
                    <EditRoundedIcon />
                  </IconButton>
                  <IconButton color="error" onClick={() => onDelete(contact)}>
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