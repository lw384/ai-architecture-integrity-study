import {
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Snackbar,
  Stack,
  Typography,
} from '@mui/material';
import AddCardRoundedIcon from '@mui/icons-material/AddCardRounded';
import { useState } from 'react';

import { useContactsByCustomerQuery } from '../contacts/contactQueries';
import { DealFormDialog } from './DealFormDialog';
import {
  useCreateDealMutation,
  useDealsByCustomerQuery,
  useDeleteDealMutation,
  useUpdateDealMutation,
} from './dealQueries';
import { DealTable } from './DealTable';

function extractErrorMessage(error, fallbackMessage) {
  return error?.message || fallbackMessage;
}

export function DealsPanel({ customerId }) {
  const dealsQuery = useDealsByCustomerQuery(customerId);
  const contactsQuery = useContactsByCustomerQuery(customerId);
  const createDeal = useCreateDealMutation(customerId);
  const updateDeal = useUpdateDealMutation(customerId);
  const deleteDeal = useDeleteDealMutation(customerId);
  const [formState, setFormState] = useState({ open: false, mode: 'create', deal: null });
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [feedback, setFeedback] = useState({ open: false, severity: 'success', message: '' });

  const handleSubmit = async (payload) => {
    try {
      if (formState.mode === 'create') {
        await createDeal.mutateAsync(payload);
        setFeedback({ open: true, severity: 'success', message: 'Deal created.' });
      } else {
        await updateDeal.mutateAsync({ id: formState.deal.id, data: payload });
        setFeedback({ open: true, severity: 'success', message: 'Deal updated.' });
      }

      setFormState({ open: false, mode: 'create', deal: null });
    } catch (error) {
      setFeedback({
        open: true,
        severity: 'error',
        message: extractErrorMessage(error, 'Deal request failed.'),
      });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) {
      return;
    }

    try {
      await deleteDeal.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
      setFeedback({ open: true, severity: 'success', message: 'Deal deleted.' });
    } catch (error) {
      setFeedback({
        open: true,
        severity: 'error',
        message: extractErrorMessage(error, 'Delete failed.'),
      });
    }
  };

  const contactMap = new Map(
    (contactsQuery.data ?? []).map((contact) => [contact.id, contact.name]),
  );

  return (
    <Stack spacing={2.5}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={2}>
        <Stack spacing={0.5}>
          <Typography variant="h5">Deals</Typography>
          <Typography color="text.secondary">
            Deals stay inside the customer workflow. Nullable contactId remains visible as
            Unassigned, and stageChangedAt should move when stage changes.
          </Typography>
        </Stack>
        <Button
          variant="contained"
          startIcon={<AddCardRoundedIcon />}
          onClick={() => setFormState({ open: true, mode: 'create', deal: null })}
        >
          Add deal
        </Button>
      </Stack>

      {dealsQuery.isLoading ? (
        <Stack alignItems="center" py={6}>
          <CircularProgress />
        </Stack>
      ) : null}

      {dealsQuery.isError ? (
        <Alert severity="error">
          {extractErrorMessage(dealsQuery.error, 'Failed to load deals.')}
        </Alert>
      ) : null}

      {dealsQuery.data ? (
        <DealTable
          deals={dealsQuery.data}
          contactMap={contactMap}
          onEdit={(deal) => setFormState({ open: true, mode: 'edit', deal })}
          onDelete={setDeleteTarget}
        />
      ) : null}

      <DealFormDialog
        open={formState.open}
        mode={formState.mode}
        initialValues={formState.deal}
        contacts={contactsQuery.data ?? []}
        isPending={createDeal.isPending || updateDeal.isPending}
        onClose={() => setFormState({ open: false, mode: 'create', deal: null })}
        onSubmit={handleSubmit}
      />

      <Dialog open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>Delete deal</DialogTitle>
        <DialogContent>
          <Typography>Delete {deleteTarget?.title}?</Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Button onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={handleDelete}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={feedback.open}
        autoHideDuration={3200}
        onClose={() => setFeedback((current) => ({ ...current, open: false }))}
      >
        <Alert severity={feedback.severity} variant="filled">
          {feedback.message}
        </Alert>
      </Snackbar>
    </Stack>
  );
}