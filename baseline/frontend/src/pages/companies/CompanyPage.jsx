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
// import { CustomerFormDialog } from './CustomerFormDialog';
import {
  useCreateCompany,
  useCompanyList,
  useDeleteCompany,
  useUpdateCompany,
} from './companyQueries';
import { CompanyTable } from './CompanyTable';

function extractErrorMessage(error, fallbackMessage) {
  return error?.message || fallbackMessage;
}

export function CompaniesPage() {
  const navigate = useNavigate();
  const createCompany = useCreateCompany();
  const updateCompany = useUpdateCompany();
  const deleteCompany = useDeleteCompany();
  const [formState, setFormState] = useState({ open: false, mode: 'create', company: null });
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [feedback, setFeedback] = useState({ open: false, severity: 'success', message: '' });
  const [searchInput, setSearchInput] = useState('');
  const [statusInput, setStatusInput] = useState('');
  const [listQuery, setListQuery] = useState({
    page: 1,
    pageSize: 10,
  });
  const companiesQuery = useCompanyList(listQuery);

//   const handleFormSubmit = async (payload) => {
//     try {
//       if (formState.mode === 'create') {
//         await createCompany.mutateAsync(payload);
//         setFeedback({
//           open: true,
//           severity: 'success',
//           message: 'Company  created.',
//         });
//       } else {
//         await updateCompany.mutateAsync({
//           id: formState.company.id,
//           data: payload,
//         });
//         setFeedback({
//           open: true,
//           severity: 'success',
//           message: 'Company updated.',
//         });
//       }

//       setFormState({ open: false, mode: 'create', company: null });
//     } catch (error) {
//       setFeedback({
//         open: true,
//         severity: 'error',
//         message: extractErrorMessage(error, 'Company request failed.'),
//       });
//     }
//   };

  const handleDelete = async () => {
    if (!deleteTarget) {
      return;
    }

    try {
      await deleteCompany.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
      setFeedback({
        open: true,
        severity: 'success',
        message: 'Company deleted.',
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

  const companyPage = companiesQuery.data;
  const companyItems = companyPage?.items ?? [];

  return (
    <Stack spacing={3}>
      <DataTableShell
        title="Companies"
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
                company: null,
              })
            }
          >
            Add Company
          </Button>
        )}
        loading={companiesQuery.isLoading}
        error={
          companiesQuery.isError
            ? extractErrorMessage(companiesQuery.error, 'Failed to load companies.')
            : null
        }
        isEmpty={!companiesQuery.isLoading && !companiesQuery.isError && companyItems.length === 0}
        emptyTitle="No matching companies"
        emptyDescription="Try broadening the search or clearing the current filters."
        pagination={
          companyPage && companyPage.total > 0 ? (
            <DataTablePagination
              page={companyPage.page}
              pageSize={companyPage.pageSize}
              total={companyPage.total}
              totalPages={companyPage.totalPages}
              onPageChange={handlePageChange}
              onPageSizeChange={handlePageSizeChange}
            />
          ) : null
        }
      >
        <CompanyTable
          companies={companyItems}
          onDelete={setDeleteTarget}
          onEdit={(company) =>
            setFormState({
              open: true,
              mode: 'edit',
              company,
            })
          }
          onView={(company) => navigate(`/companies/${company.id}`)}
        />
      </DataTableShell>

      {/* <CompanyFormDialog
        open={formState.open}
        mode={formState.mode}
        initialValues={formState.company}
        isPending={createCompany.isPending || updateCompany.isPending}
        onClose={() => setFormState({ open: false, mode: 'create', company: null })}
        onSubmit={handleFormSubmit}
      />

      <Dialog open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>Delete company</DialogTitle>
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
      </Dialog> */}

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