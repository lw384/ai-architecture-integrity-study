import {
  Alert,
  Box,
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
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';

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
  const customersQuery = useCustomersQuery();
  const createCustomer = useCreateCustomerMutation();
  const updateCustomer = useUpdateCustomerMutation();
  const deleteCustomer = useDeleteCustomerMutation();
  const [formState, setFormState] = useState({ open: false, mode: 'create', customer: null });
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [feedback, setFeedback] = useState({ open: false, severity: 'success', message: '' });

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

  return (
    <Stack spacing={3}>
      <Box
        sx={{
          borderRadius: 5,
          p: { xs: 3, md: 4 },
          background:
            'linear-gradient(135deg, rgba(15,76,92,0.12), rgba(200,85,61,0.08))',
        }}
      >
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={2}
          justifyContent="space-between"
          alignItems={{ xs: 'flex-start', md: 'center' }}
        >
          <Box>
            <Typography variant="h3">Customers</Typography>
            <Typography sx={{ mt: 1.25, maxWidth: 760, color: 'text.secondary' }}>
              Manage the CRM backbone here. This list is also the fastest place
              to confirm backend rules like default status, 404 detail handling,
              and lastContactedAt updates after interactions.
            </Typography>
          </Box>

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
        </Stack>
      </Box>

      {customersQuery.isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
          <CircularProgress />
        </Box>
      ) : null}

      {customersQuery.isError ? (
        <Alert severity="error">
          {extractErrorMessage(customersQuery.error, 'Failed to load customers.')}
        </Alert>
      ) : null}

      {customersQuery.data ? (
        <CustomerTable
          customers={customersQuery.data}
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
      ) : null}

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