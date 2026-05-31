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
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import { useState } from 'react';

import { ContactFormDialog } from './ContactFormDialog';
import {
  useContactsByCustomerQuery,
  useCreateContactMutation,
  useDeleteContactMutation,
  useUpdateContactMutation,
} from './contactQueries';
import { ContactTable } from './ContactTable';

function extractErrorMessage(error, fallbackMessage) {
  return error?.message || fallbackMessage;
}

export function ContactsPanel({ customerId }) {
  const contactsQuery = useContactsByCustomerQuery(customerId);
  const createContact = useCreateContactMutation(customerId);
  const updateContact = useUpdateContactMutation(customerId);
  const deleteContact = useDeleteContactMutation(customerId);
  const [formState, setFormState] = useState({ open: false, mode: 'create', contact: null });
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [feedback, setFeedback] = useState({ open: false, severity: 'success', message: '' });

  const handleSubmit = async (payload) => {
    try {
      if (formState.mode === 'create') {
        await createContact.mutateAsync(payload);
        setFeedback({ open: true, severity: 'success', message: 'Contact created.' });
      } else {
        await updateContact.mutateAsync({ id: formState.contact.id, data: payload });
        setFeedback({ open: true, severity: 'success', message: 'Contact updated.' });
      }

      setFormState({ open: false, mode: 'create', contact: null });
    } catch (error) {
      setFeedback({
        open: true,
        severity: 'error',
        message: extractErrorMessage(error, 'Contact request failed.'),
      });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) {
      return;
    }

    try {
      await deleteContact.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
      setFeedback({ open: true, severity: 'success', message: 'Contact deleted.' });
    } catch (error) {
      setFeedback({
        open: true,
        severity: 'error',
        message: extractErrorMessage(error, 'Delete failed.'),
      });
    }
  };

  return (
    <Stack spacing={2.5}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={2}>
        <BoxlessTitle
          title="Contacts"
          body="Contacts belong to this customer implicitly through the current route."
        />
        <Button
          variant="contained"
          startIcon={<AddRoundedIcon />}
          onClick={() => setFormState({ open: true, mode: 'create', contact: null })}
        >
          Add contact
        </Button>
      </Stack>

      {contactsQuery.isLoading ? (
        <Stack alignItems="center" py={6}>
          <CircularProgress />
        </Stack>
      ) : null}

      {contactsQuery.isError ? (
        <Alert severity="error">
          {extractErrorMessage(contactsQuery.error, 'Failed to load contacts.')}
        </Alert>
      ) : null}

      {contactsQuery.data ? (
        <ContactTable
          contacts={contactsQuery.data}
          onEdit={(contact) => setFormState({ open: true, mode: 'edit', contact })}
          onDelete={setDeleteTarget}
        />
      ) : null}

      <ContactFormDialog
        open={formState.open}
        mode={formState.mode}
        initialValues={formState.contact}
        isPending={createContact.isPending || updateContact.isPending}
        onClose={() => setFormState({ open: false, mode: 'create', contact: null })}
        onSubmit={handleSubmit}
      />

      <Dialog open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>Delete contact</DialogTitle>
        <DialogContent>
          <Typography>Delete {deleteTarget?.name} from this customer?</Typography>
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

function BoxlessTitle({ body, title }) {
  return (
    <Stack spacing={0.5}>
      <Typography variant="h5">{title}</Typography>
      <Typography color="text.secondary">{body}</Typography>
    </Stack>
  );
}