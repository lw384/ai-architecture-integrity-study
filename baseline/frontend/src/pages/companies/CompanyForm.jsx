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
import { useCreateCompany, useUpdateCompany } from './companyQueries';

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


function CompanyFormField({
  field,
  label,
  values,
  touched,
  errors,
  onChange,
  onBlur,
  value,
  ...rest
}) {
  const displayValue = value !== undefined ? value : (values?.[field] || '');

  const isError = Boolean(touched?.[field] && errors?.[field]);
  const helperText = touched?.[field] ? errors?.[field] : undefined;

  return (
    <TextField
      fullWidth
      label={label}
      value={displayValue}
      onChange={onChange ? onChange(field) : undefined}
      onBlur={onBlur ? onBlur(field) : undefined}
      error={isError}
      helperText={helperText}
      {...rest}
    />
  );
}

// main component
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
    if (!open) return;

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

    if (!isFormValid) return;

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

  const fieldProps = { values, touched, errors, onChange: handleChange, onBlur: handleBlur };

  return (
    <Dialog open={open} onClose={isPending ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>
        {mode === 'create' ? 'Create company' : 'Edit company'}
      </DialogTitle>

      <DialogContent sx={{ p: 2.5 }}>
        <Stack direction="column" spacing={2} component="form" onSubmit={handleSubmit} sx={{ mt: 1 }}>

          <CompanyFormField
            {...fieldProps}
            field="name"
            label="Name"
            required
            autoFocus
          />

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <CompanyFormField
              {...fieldProps}
              field="email"
              label="Email"
              type="email"
              required
            />
            <CompanyFormField
              {...fieldProps}
              field="phone"
              label="Phone"
              type="tel"
              placeholder="+86 13800000000"
              required
            />
          </Stack>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <CompanyFormField {...fieldProps} field="industry" label="Industry" select>
              <MenuItem value="TECHNOLOGY">Technology</MenuItem>
              <MenuItem value="FINANCE">Finance</MenuItem>
              <MenuItem value="HEALTHCARE">Healthcare</MenuItem>
              <MenuItem value="RETAIL">Retail</MenuItem>
              <MenuItem value="OTHER">Other</MenuItem>
            </CompanyFormField>

            <CompanyFormField {...fieldProps} field="status" label="Status" select>
              <MenuItem value="1">Active</MenuItem>
              <MenuItem value="0">Inactive</MenuItem>
              <MenuItem value="2">Pending</MenuItem>
            </CompanyFormField>
          </Stack>

          <CompanyFormField
            {...fieldProps}
            field="website"
            label="Website"
            type="url"
            placeholder="https://example.com"
          />

          <CompanyFormField
            {...fieldProps}
            field="lastContactedAt"
            label="Last Contacted At"
            type="datetime-local"
            InputLabelProps={{ shrink: true }}
          />

          {mode === 'edit' && initialValues?.createdAt && (
            <CompanyFormField
              field="createdAt"
              label="Created At"
              disabled
              // 针对只读字段直接覆盖 value，跳过标准的 values[field] 读取
              value={new Intl.DateTimeFormat('en', {
                dateStyle: 'medium',
                timeStyle: 'short'
              }).format(new Date(initialValues.createdAt))}
            />
          )}

          <button type="submit" hidden />
        </Stack>
      </DialogContent>

      <DialogActions>
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
