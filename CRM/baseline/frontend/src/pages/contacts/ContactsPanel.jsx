import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Snackbar,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import { useState } from 'react';

import { DataTablePagination } from '../../components/Table/Pagination/Pagination';
import { DataTableShell } from '../../components/Table/Shell/Shell';
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
  const createContact = useCreateContactMutation(customerId);
  const updateContact = useUpdateContactMutation(customerId);
  const deleteContact = useDeleteContactMutation(customerId);
  const [formState, setFormState] = useState({ open: false, mode: 'create', contact: null });
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [feedback, setFeedback] = useState({ open: false, severity: 'success', message: '' });
  const [searchInput, setSearchInput] = useState('');
  const [roleInput, setRoleInput] = useState('');
  const [listQuery, setListQuery] = useState({
    page: 1,
    pageSize: 10,
  });
  const contactsQuery = useContactsByCustomerQuery(customerId, listQuery);

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

  const handleSearchSubmit = (event) => {
    event.preventDefault();
    const normalizedSearch = searchInput.trim();

    setListQuery((current) => ({
      ...current,
      page: 1,
      ...(normalizedSearch ? { q: normalizedSearch } : { q: undefined }),
      ...(roleInput ? { role: roleInput } : { role: undefined }),
    }));
  };

  const handleResetFilters = () => {
    setSearchInput('');
    setRoleInput('');
    setListQuery({ page: 1, pageSize: listQuery.pageSize });
  };

  const handlePageChange = (page) => {
    setListQuery((current) => ({ ...current, page }));
  };

  const handlePageSizeChange = (pageSize) => {
    setListQuery((current) => ({ ...current, page: 1, pageSize }));
  };

  const contactPage = contactsQuery.data;
  const contacts = contactPage?.items ?? [];

  return (
    <Stack spacing={2.5}>
      <DataTableShell
        title="Contacts"
        searchValue={searchInput}
        onSearchChange={setSearchInput}
        onSearchSubmit={handleSearchSubmit}
        onReset={handleResetFilters}
        searchPlaceholder="Search by name, email, phone, or role"
        filters={(
          <TextField
            select
            size="small"
            label="Role"
            value={roleInput}
            onChange={(event) => setRoleInput(event.target.value)}
            className="min-w-[10rem]"
          >
            <MenuItem value="">All roles</MenuItem>
            <MenuItem value="decision-maker">decision-maker</MenuItem>
            <MenuItem value="champion">champion</MenuItem>
            <MenuItem value="user">user</MenuItem>
          </TextField>
        )}
        actions={(
          <Button
            variant="contained"
            startIcon={<AddRoundedIcon />}
            onClick={() => setFormState({ open: true, mode: 'create', contact: null })}
          >
            Add contact
          </Button>
        )}
        loading={contactsQuery.isLoading}
        error={
          contactsQuery.isError
            ? extractErrorMessage(contactsQuery.error, 'Failed to load contacts.')
            : null
        }
        isEmpty={!contactsQuery.isLoading && !contactsQuery.isError && contacts.length === 0}
        emptyTitle="No matching contacts"
        emptyDescription="Try broadening the search or clearing the current filters."
        pagination={
          contactPage && contactPage.total > 0 ? (
            <DataTablePagination
              page={contactPage.page}
              pageSize={contactPage.pageSize}
              total={contactPage.total}
              totalPages={contactPage.totalPages}
              onPageChange={handlePageChange}
              onPageSizeChange={handlePageSizeChange}
            />
          ) : null
        }
      >
        <ContactTable
          contacts={contacts}
          onEdit={(contact) => setFormState({ open: true, mode: 'edit', contact })}
          onDelete={setDeleteTarget}
        />
      </DataTableShell>

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
        <DialogActions className="crm-dialog-actions">
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