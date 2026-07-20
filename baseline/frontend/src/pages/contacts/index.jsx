import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Snackbar,
  MenuItem,
  Typography,
  Stack,
  TextField,
} from '@mui/material';
import PlusOutlined from '@ant-design/icons/PlusOutlined';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';

import { isTransportError } from 'api/request';
import { DataTablePagination } from '../../components/Table/Pagination/Pagination';
import { DataTableShell } from '../../components/Table/Shell/Shell';
import { ContactFormDialog } from './ContactForm';
import { ContactTable } from './ContactTable';

import {
  useContactList,
  useCreateContact,
  useDeleteContact,
  useUpdateContact,
} from './contactQueries';


function extractErrorMessage(error, fallbackMessage) {
  return error?.message || fallbackMessage;
}

export default function ContactsPage() {
  const navigate = useNavigate();
  const createContact = useCreateContact();
  const updateContact = useUpdateContact();
  const deleteContact = useDeleteContact();
  const [formState, setFormState] = useState({ open: false, mode: 'create', contact: null });
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [feedback, setFeedback] = useState({ open: false, severity: 'success', message: '' });
  const [searchInput, setSearchInput] = useState('');
  const [statusInput, setStatusInput] = useState('');
  const [listQuery, setListQuery] = useState({
    page: 1,
    pageSize: 10,
  });
  const contactsQuery = useContactList(listQuery);

  const handleFormSubmit = async (payload) => {
    try {
      if (formState.mode === 'create') {
        await createContact.mutateAsync(payload);
        setFeedback({
          open: true,
          severity: 'success',
          message: 'Contact created.',
        });
      } else {
        await updateContact.mutateAsync({
          id: formState.contact.id,
          data: payload,
        });
        setFeedback({
          open: true,
          severity: 'success',
          message: 'Contact updated.',
        });
      }

      setFormState({ open: false, mode: 'create', contact: null });
    } catch (error) {
      // Transport-level failures (network/5xx) are already toasted globally
      // (see App.jsx); only surface business errors here.
      if (!isTransportError(error)) {
        setFeedback({
          open: true,
          severity: 'error',
          message: extractErrorMessage(error, 'Contact request failed.'),
        });
      }
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) {
      return;
    }

    try {
      await deleteContact.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
      setFeedback({
        open: true,
        severity: 'success',
        message: 'Contact deleted.',
      });
    } catch (error) {
      if (!isTransportError(error)) {
        setFeedback({
          open: true,
          severity: 'error',
          message: extractErrorMessage(error, 'Delete failed.'),
        });
      }
    }
  };

  const handleSearchSubmit = (event) => {
    event.preventDefault();
    setListQuery((current) => ({
      ...current,
      page: 1,
      ...(searchInput.trim() ? { q: searchInput.trim() } : { q: undefined }),
      ...(statusInput ? { status: statusInput } : { status: undefined }),
    }));
  };

  const handleResetFilters = () => {
    setSearchInput('');
    setStatusInput('');
    setListQuery({ page: 1, pageSize: listQuery.pageSize });
  };

  const handlePageChange = (page) => {
    setListQuery((current) => ({ ...current, page }));
  };

  const handlePageSizeChange = (pageSize) => {
    setListQuery((current) => ({ ...current, page: 1, pageSize }));
  };

  const contactPage = contactsQuery.data;
  const contactItems = contactPage?.items ?? [];

  return (
    <Stack spacing={3}>
      <DataTableShell
        title="Customers"
        searchValue={searchInput}
        onSearchChange={setSearchInput}
        onSearchSubmit={handleSearchSubmit}
        onReset={handleResetFilters}
        searchPlaceholder="Search by name, company, or email"
        filters={(
          <TextField
            select
            size="small"
            label="Status"
            value={statusInput}
            onChange={(event) => setStatusInput(event.target.value)}
            className="min-w-[10rem]"
          >
            <MenuItem value="">All statuses</MenuItem>
            <MenuItem value="active">active</MenuItem>
            <MenuItem value="inactive">inactive</MenuItem>
          </TextField>
        )}
        actions={(
          <Button
            variant="contained"
            startIcon={<PlusOutlined />}
            onClick={() =>
              setFormState({
                open: true,
                mode: 'create',
                customer: null,
              })
            }
          >
            Add Contact
          </Button>
        )}
        loading={contactsQuery.isLoading}
        error={
          contactsQuery.isError && !isTransportError(contactsQuery.error)
            ? extractErrorMessage(contactsQuery.error, 'Failed to load contacts.')
            : null
        }
        isEmpty={!contactsQuery.isLoading && !contactsQuery.isError && contactItems.length === 0}
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
          contacts={contactItems}
          onDelete={setDeleteTarget}
          onEdit={(contact) =>
            setFormState({
              open: true,
              mode: 'edit',
              contact,
            })
          }
          onView={(contact) => navigate(`/contacts/${contact.id}`)}
        />
      </DataTableShell>

      <ContactFormDialog
        open={formState.open}
        mode={formState.mode}
        initialValues={formState.contact}
        isPending={createContact.isPending || updateContact.isPending}
        onClose={() => setFormState({ open: false, mode: 'create', contact: null })}
        onSubmit={handleFormSubmit}
      />

      <Dialog open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>Delete contact</DialogTitle>
        <DialogContent>
          <Typography>
             Delete {deleteTarget?.name}? This action cannot be undone.
          </Typography>
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
        <Alert
          onClose={() => setFeedback((current) => ({ ...current, open: false }))}
          severity={feedback.severity}
          variant="filled"
        >
          {feedback.message}
        </Alert>
      </Snackbar>
    </Stack>
  );
}