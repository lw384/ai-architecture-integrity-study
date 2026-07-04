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
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';

import { DataTablePagination } from '../../components/Table/Pagination/Pagination';
import { DataTableShell } from '../../components/Table/Shell/Shell';
import { CustomerFormDialog } from './CustomerFormDialog';
import {
  useCreateCustomerMutation,
  useCustomersQuery,
  useDeleteCustomerMutation,
  useUpdateCustomerMutation,
} from './customerQueries';
import { CustomerTable } from './CustomerTable';

function extractErrorMessage(error, fallbackMessage) {
  return error?.message || fallbackMessage;
}

export function CustomersPage() {
  const navigate = useNavigate();
  const createCustomer = useCreateCustomerMutation();
  const updateCustomer = useUpdateCustomerMutation();
  const deleteCustomer = useDeleteCustomerMutation();
  const [formState, setFormState] = useState({ open: false, mode: 'create', customer: null });
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [feedback, setFeedback] = useState({ open: false, severity: 'success', message: '' });
  const [searchInput, setSearchInput] = useState('');
  const [statusInput, setStatusInput] = useState('');
  const [listQuery, setListQuery] = useState({
    page: 1,
    pageSize: 10,
  });
  const customersQuery = useCustomersQuery(listQuery);

  const handleFormSubmit = async (payload) => {
    try {
      if (formState.mode === 'create') {
        await createCustomer.mutateAsync(payload);
        setFeedback({
          open: true,
          severity: 'success',
          message: 'Customer created.',
        });
      } else {
        await updateCustomer.mutateAsync({
          id: formState.customer.id,
          data: payload,
        });
        setFeedback({
          open: true,
          severity: 'success',
          message: 'Customer updated.',
        });
      }

      setFormState({ open: false, mode: 'create', customer: null });
    } catch (error) {
      setFeedback({
        open: true,
        severity: 'error',
        message: extractErrorMessage(error, 'Customer request failed.'),
      });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) {
      return;
    }

    try {
      await deleteCustomer.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
      setFeedback({
        open: true,
        severity: 'success',
        message: 'Customer deleted.',
      });
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

  const customerPage = customersQuery.data;
  const customerItems = customerPage?.items ?? [];

  return (
    <Stack spacing={3}>
      <DataTableShell
        title="Customers"
        description="Manage the CRM backbone here. This list is also the fastest place to confirm backend rules like default status, 404 detail handling, and lastContactedAt updates after interactions."
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
            startIcon={<AddRoundedIcon />}
            onClick={() =>
              setFormState({
                open: true,
                mode: 'create',
                customer: null,
              })
            }
          >
            Create customer
          </Button>
        )}
        loading={customersQuery.isLoading}
        error={
          customersQuery.isError
            ? extractErrorMessage(customersQuery.error, 'Failed to load customers.')
            : null
        }
        isEmpty={!customersQuery.isLoading && !customersQuery.isError && customerItems.length === 0}
        emptyTitle="No matching customers"
        emptyDescription="Try broadening the search or clearing the current filters."
        pagination={
          customerPage && customerPage.total > 0 ? (
            <DataTablePagination
              page={customerPage.page}
              pageSize={customerPage.pageSize}
              total={customerPage.total}
              totalPages={customerPage.totalPages}
              onPageChange={handlePageChange}
              onPageSizeChange={handlePageSizeChange}
            />
          ) : null
        }
      >
        <CustomerTable
          customers={customerItems}
          onDelete={setDeleteTarget}
          onEdit={(customer) =>
            setFormState({
              open: true,
              mode: 'edit',
              customer,
            })
          }
          onView={(customer) => navigate(`/customers/${customer.id}`)}
        />
      </DataTableShell>

      <CustomerFormDialog
        open={formState.open}
        mode={formState.mode}
        initialValues={formState.customer}
        isPending={createCustomer.isPending || updateCustomer.isPending}
        onClose={() => setFormState({ open: false, mode: 'create', customer: null })}
        onSubmit={handleFormSubmit}
      />

      <Dialog open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>Delete customer</DialogTitle>
        <DialogContent>
          <Typography>
            Delete {deleteTarget?.name}? This helps verify that backend delete
            behavior is wired correctly.
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