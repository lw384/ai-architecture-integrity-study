import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  MenuItem,
} from '@mui/material';
import { useEffect, useState } from 'react';
import { useCreateCompany, useUpdateCompany } from './companyQueries'; // 引入请求 Hooks

const emptyValues = {
  name: '',
  email: '',
  phone: '',
  website: '',
  industry: 'OTHER',
  status: '1',
  lastContactedAt: '',
};

const formatForDatetimeLocal = (isoString) => {
  if (!isoString) return '';
  return isoString.slice(0, 16);
};

export function CompanyFormDialog({
  initialValues,
  mode,
  open,
  onClose,
  onSuccess,
  onError,
}) {
  const createCompany = useCreateCompany();
  const updateCompany = useUpdateCompany();

  const isPending = createCompany.isPending || updateCompany.isPending;

  const [values, setValues] = useState(emptyValues);
  const [touched, setTouched] = useState({ name: false, email: false, phone: false });

  const phoneDigits = values.phone?.replace(/[^0-9]/g, '') || '';

  const errors = {
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

  const isFormValid = !errors.name && !errors.email && !errors.phone;

  useEffect(() => {
    if (!open) {
      return;
    }
    setValues({
      ...emptyValues,
      ...initialValues,
      lastContactedAt: formatForDatetimeLocal(initialValues?.lastContactedAt),
    });
    setTouched({ name: false, email: false, phone: false });
  }, [initialValues, open]);

  const handleChange = (field) => (event) => {
    setValues((current) => ({ ...current, [field]: event.target.value }));
  };

  const handleBlur = (field) => () => {
    setTouched((current) => ({ ...current, [field]: true }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setTouched({ name: true, email: true, phone: true });

    if (!isFormValid) {
      return;
    }

    const payload = {
      name: values.name.trim(),
      email: values.email.trim(),
      phone: values.phone.trim(),
      website: values.website?.trim() || '',
      industry: values.industry,
      status: values.status,
      lastContactedAt: values.lastContactedAt ? new Date(values.lastContactedAt).toISOString() : null,
    };

    try {
      if (mode === 'create') {
        await createCompany.mutateAsync(payload);
        onSuccess('Company created successfully.');
      } else {
        await updateCompany.mutateAsync({
          id: initialValues.id,
          data: payload,
        });
        onSuccess('Company updated successfully.');
      }
    } catch (error) {
      onError(error);
    }
  };

  return (
    <Dialog open={open} onClose={isPending ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>
        {mode === 'create' ? 'Create company' : 'Edit company'}
      </DialogTitle>
      <DialogContent className="!p-5">
        <Stack direction={{ xs: 'column', sm: 'row' }}  spacing={2} onSubmit={handleSubmit} sx={{ mt: 1 }}>
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
              placeholder="+86 13800000000"
              value={values.phone}
              onBlur={handleBlur('phone')}
              onChange={handleChange('phone')}
              error={touched.phone && Boolean(errors.phone)}
              helperText={touched.phone ? errors.phone : undefined}
            />
          </Stack>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              select
              fullWidth
              label="Industry"
              value={values.industry}
              onChange={handleChange('industry')}
            >
              <MenuItem value="TECHNOLOGY">Technology</MenuItem>
              <MenuItem value="FINANCE">Finance</MenuItem>
              <MenuItem value="HEALTHCARE">Healthcare</MenuItem>
              <MenuItem value="RETAIL">Retail</MenuItem>
              <MenuItem value="OTHER">Other</MenuItem>
            </TextField>

            <TextField
              select
              fullWidth
              label="Status"
              value={values.status}
              onChange={handleChange('status')}
            >
              <MenuItem value="1">Active</MenuItem>
              <MenuItem value="0">Inactive</MenuItem>
              <MenuItem value="2">Pending</MenuItem>
            </TextField>
          </Stack>

          <TextField
            label="Website"
            type="url"
            value={values.website || ''}
            onChange={handleChange('website')}
            placeholder="https://example.com"
          />

          <TextField
            label="Last Contacted At"
            type="datetime-local"
            InputLabelProps={{ shrink: true }}
            value={values.lastContactedAt}
            onChange={handleChange('lastContactedAt')}
          />

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