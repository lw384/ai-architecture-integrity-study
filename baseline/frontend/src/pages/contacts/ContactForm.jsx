import {
  Autocomplete,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
} from '@mui/material';
import { useEffect, useState } from 'react';
import { useCompanyList } from '../companies/companyQueries';


const emptyValues = {
  companyId: '',
  name: '',
  email: '',
  phone: '',
  role: '',
  lastContactedAt: '',
};


const formatForDatetimeLocal = (isoString) => {
  if (!isoString) return '';
  return isoString.slice(0, 16);
};

export function ContactFormDialog({
  initialValues,
  isPending,
  mode,
  onClose,
  onSubmit,
  open,
}) {
  const [values, setValues] = useState(emptyValues);
  const [touched, setTouched] = useState({
    companyId: false,
    name: false,
    email: false,
    phone: false,
  });
  const companiesQuery = useCompanyList({ page: 1, pageSize: 100 });
  const companyOptions = companiesQuery.data?.items ?? [];
  const selectedCompany = companyOptions.find(
    (company) => company.id === values.companyId,
  ) ?? null;

  const phoneDigits = values.phone?.replace(/[^0-9]/g, '') || '';

  // 校验逻辑：只针对姓名、邮箱、手机号三项必填项
  const errors = {
    companyId: !values.companyId ? 'Company is required.' : '',
    name: !values.name?.trim() ? 'Name is required.' : '',
    email: !values.email?.trim()
      ? 'Email is required.'
      : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)
        ? 'Invalid email format.'
        : '',
    phone: !values.phone?.trim()
      ? 'Phone is required.'
      : !values.phone.trim().startsWith('+')
        ? 'Must start with "+" and country code (e.g., +86).'
        : phoneDigits.length < 8 || phoneDigits.length > 15
          ? 'Invalid phone number length (8-15 digits required).'
          : '',
  };

          const isFormValid =
            !errors.companyId && !errors.name && !errors.email && !errors.phone;

  useEffect(() => {
    if (!open) {
      return;
    }

    setValues({
      ...emptyValues,
      ...initialValues,
      lastContactedAt: formatForDatetimeLocal(initialValues?.lastContactedAt),
    });
    setTouched({ companyId: false, name: false, email: false, phone: false });
  }, [initialValues, open]);

  const handleChange = (field) => (event) => {
    setValues((current) => ({ ...current, [field]: event.target.value }));
  };

  const handleBlur = (field) => () => {
    setTouched((current) => ({ ...current, [field]: true }));
  };

  const handleCompanyChange = (_, company) => {
    setValues((current) => ({
      ...current,
      companyId: company?.id || '',
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setTouched({ companyId: true, name: true, email: true, phone: true });

    if (!isFormValid) {
      return;
    }

    const payload = {
      companyId: values.companyId,
      name: values.name.trim(),
      email: values.email.trim(),
      phone: values.phone.trim(),
      role: values.role?.trim() || null,
      lastContactedAt: values.lastContactedAt ? new Date(values.lastContactedAt).toISOString() : null,
    };

    await onSubmit(payload);
  };

  return (
    <Dialog open={open} onClose={isPending ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>
        {mode === 'create' ? 'Create contact' : 'Edit contact'}
      </DialogTitle>

      <DialogContent className="!p-5">

        <Stack component="form" spacing={2} onSubmit={handleSubmit} >
            <TextField
            autoFocus
            required
            label="Name"
            value={values.name}
            onBlur={handleBlur('name')}
            onChange={handleChange('name')}
            error={touched.name && Boolean(errors.name)}
            helperText={touched.name ? errors.name : undefined}
          />

          <Autocomplete
            fullWidth
            options={companyOptions}
            value={selectedCompany}
            loading={companiesQuery.isLoading}
            onBlur={handleBlur('companyId')}
            onChange={handleCompanyChange}
            isOptionEqualToValue={(option, value) => option.id === value.id}
            getOptionLabel={(option) => option?.name || ''}
            noOptionsText={companiesQuery.isLoading ? 'Loading companies...' : 'No companies found'}
            sx={{
              '& .MuiOutlinedInput-root .MuiAutocomplete-input': {
                padding: '0 !important',
              },
            }}
            renderInput={(params) => (
              <TextField
                {...params}
                required
                label="Company"
                error={touched.companyId && Boolean(errors.companyId)}
                helperText={
                  touched.companyId
                    ? errors.companyId
                    : companiesQuery.isError
                      ? 'Failed to load companies.'
                      : undefined
                }
                InputProps={{
                  ...params.InputProps,
                  endAdornment: (
                    <>
                      {companiesQuery.isLoading ? (
                        <CircularProgress color="inherit" size={20} />
                      ) : null}
                      {params.InputProps.endAdornment}
                    </>
                  ),
                }}
              />
            )}
          />



          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              required
              fullWidth
              label="Email"
              type="email"
              value={values.email}
              onBlur={handleBlur('email')}
              onChange={handleChange('email')}
              error={touched.email && Boolean(errors.email)}
              helperText={touched.email ? errors.email : undefined}
            />
            <TextField
              required
              fullWidth
              label="Phone"
              type="tel"
              placeholder="+00 00000000000"
              value={values.phone}
              onBlur={handleBlur('phone')}
              onChange={handleChange('phone')}
              error={touched.phone && Boolean(errors.phone)}
              helperText={touched.phone ? errors.phone : undefined}
            />
          </Stack>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              fullWidth
              label="Role"
              value={values.role || ''}
              onChange={handleChange('role')}
              placeholder="e.g. Manager, User, Admin"
            />

            <TextField
              fullWidth
              label="Last Contacted At"
              type="datetime-local"
              InputLabelProps={{ shrink: true }}
              value={values.lastContactedAt}
              onChange={handleChange('lastContactedAt')}
            />
          </Stack>

          {/* 创建时间：仅在编辑模式下可见且不可更改 */}
          {mode === 'edit' && initialValues?.createdAt && (
            <TextField
              disabled
              label="Created At"
              value={new Intl.DateTimeFormat('en', {
                dateStyle: 'medium',
                timeStyle: 'short'
              }).format(new Date(initialValues.createdAt))}
            />
          )}

          <button type="submit" hidden />
        </Stack>
      </DialogContent>

      <DialogActions className="crm-dialog-actions">
        <Button onClick={onClose} disabled={isPending}>
          Cancel
        </Button>
        <Button variant="contained" onClick={handleSubmit} disabled={isPending}>
          {mode === 'create' ? 'Create' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}