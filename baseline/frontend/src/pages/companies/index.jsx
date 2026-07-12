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
import { CompanyFormDialog } from './CompanyForm';
import { useCompanyList, useDeleteCompany } from './companyQueries'; // 移除了 create/update hooks
import { CompanyTable } from './CompanyTable';

function extractErrorMessage(error, fallbackMessage) {
  return error?.message || fallbackMessage;
}

export default function CompaniesPage() {
  const navigate = useNavigate();
  const deleteCompany = useDeleteCompany();

  const [formState, setFormState] = useState({ open: false, mode: 'create', company: null });
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [feedback, setFeedback] = useState({ open: false, severity: 'success', message: '' });
  const [searchInput, setSearchInput] = useState('');
  const [statusInput, setStatusInput] = useState('');
  const [listQuery, setListQuery] = useState({ page: 1, pageSize: 10 });

  const companiesQuery = useCompanyList(listQuery);

  const handleDelete = async () => {
    if (!deleteTarget) return;

    try {
      await deleteCompany.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
      setFeedback({
        open: true,
        severity: 'success',
        message: 'Company deleted.',
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
            <MenuItem value="1">Active</MenuItem>
            <MenuItem value="0">Inactive</MenuItem>
            <MenuItem value="2">Pending</MenuItem>
          </TextField>
        )}
        actions={(
          <Button
            variant="contained"
            startIcon={<PlusOutlined />}
            onClick={() => setFormState({ open: true, mode: 'create', company: null })}
          >
            Add Company
          </Button>
        )}
        loading={companiesQuery.isLoading}
        error={
          companiesQuery.isError && !isTransportError(companiesQuery.error)
            ? extractErrorMessage(companiesQuery.error, 'Failed to load companies.')
            : null
        }
        isEmpty={!companiesQuery.isLoading && !companiesQuery.isError && companyItems.length === 0}
        emptyTitle="No matching companies"
        emptyDescription="Try broadening the search or clearing the current filters."
        pagination={
          companyPage && companyPage.total > 0 ? (
            <div className="flex w-full justify-center">
              <DataTablePagination
                page={companyPage.page}
                pageSize={companyPage.pageSize}
                total={companyPage.total}
                totalPages={companyPage.totalPages}
                onPageChange={(page) => setListQuery((current) => ({ ...current, page }))}
                onPageSizeChange={(pageSize) => setListQuery((current) => ({ ...current, page: 1, pageSize }))}
              />
            </div>
          ) : null
        }
      >
        <CompanyTable
          companies={companyItems}
          onDelete={setDeleteTarget}
          onEdit={(company) => setFormState({ open: true, mode: 'edit', company })}
          onView={(company) => navigate(`/companies/${company.id}`)}
        />
      </DataTableShell>

      <CompanyFormDialog
        open={formState.open}
        mode={formState.mode}
        initialValues={formState.company}
        onClose={() => setFormState({ open: false, mode: 'create', company: null })}
        // 成功时关闭弹窗并弹出 Toast
        onSuccess={(message) => {
          setFeedback({ open: true, severity: 'success', message });
          setFormState({ open: false, mode: 'create', company: null });
        }}
        // 失败时仅弹出 Toast 报错，不关闭弹窗，允许用户修改
        onError={(error) => {
          setFeedback({
            open: true,
            severity: 'error',
            message: extractErrorMessage(error, 'Company request failed.'),
          });
        }}
      />

      <Dialog open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>Delete company</DialogTitle>
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