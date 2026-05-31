import {
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

function formatDate(value) {
  if (!value) {
    return '—';
  }

  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function getStageColor(stage) {
  if (stage === 'won') {
    return 'success';
  }

  if (stage === 'lost') {
    return 'error';
  }

  if (stage === 'proposal' || stage === 'negotiation') {
    return 'warning';
  }

  return 'default';
}

export function DealTable({ contactMap, deals, onDelete, onEdit }) {
  if (!deals.length) {
    return (
      <Paper sx={{ p: 4, textAlign: 'center', borderRadius: 4 }}>
        <Typography variant="subtitle1">No deals yet</Typography>
        <Typography sx={{ mt: 1, color: 'text.secondary' }}>
          Add a deal to verify nullable contact handling and stageChangedAt updates.
        </Typography>
      </Paper>
    );
  }

  return (
    <TableContainer component={Paper} sx={{ borderRadius: 4 }}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Title</TableCell>
            <TableCell>Value</TableCell>
            <TableCell>Stage</TableCell>
            <TableCell>Contact</TableCell>
            <TableCell>Expected close</TableCell>
            <TableCell>Stage changed</TableCell>
            <TableCell>Created</TableCell>
            <TableCell align="right">Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {deals.map((deal) => (
            <TableRow key={deal.id} hover>
              <TableCell>{deal.title}</TableCell>
              <TableCell>${deal.value}</TableCell>
              <TableCell>
                <Chip label={deal.stage} color={getStageColor(deal.stage)} size="small" />
              </TableCell>
              <TableCell>
                {deal.contactId === null
                  ? 'Unassigned'
                  : contactMap.get(deal.contactId) ?? `Contact #${deal.contactId}`}
              </TableCell>
              <TableCell>{deal.expectedCloseDate || '—'}</TableCell>
              <TableCell>{formatDate(deal.stageChangedAt)}</TableCell>
              <TableCell>{formatDate(deal.createdAt)}</TableCell>
              <TableCell align="right">
                <Stack direction="row" spacing={1} justifyContent="flex-end">
                  <IconButton onClick={() => onEdit(deal)}>
                    <EditRoundedIcon />
                  </IconButton>
                  <IconButton color="error" onClick={() => onDelete(deal)}>
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