import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
} from '@mui/material';
import { useEffect, useState } from 'react';

const emptyValues = {
  name: '',
  company: '',
  email: '',
  status: '',
};

export function CustomerFormDialog({
  initialValues,
  isPending,
  mode,
  onClose,
  onSubmit,
  open,
}) {
  const [values, setValues] = useState(emptyValues);
  const [nameTouched, setNameTouched] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    setValues({
      ...emptyValues,
      ...initialValues,
    });
    setNameTouched(false);
  }, [initialValues, open]);

  const isNameEmpty = nameTouched && !values.name.trim();

  const handleSubmit = async (event) => {
    event.preventDefault();
    setNameTouched(true);

    if (!values.name.trim()) {
      return;
    }

    const payload = {
      name: values.name,
      company: values.company,
      email: values.email,
      ...(values.status ? { status: values.status } : {}),
    };

    await onSubmit(payload);
  };

  return (
    <Dialog open={open} onClose={isPending ? undefined : onClose} fullWidth>
      <DialogTitle>
        {mode === 'create' ? 'Create customer' : 'Edit customer'}
      </DialogTitle>
      <DialogContent>
        <Stack component="form" spacing={2.5} className="crm-form-stack" onSubmit={handleSubmit}>
          <TextField
            autoFocus
            label="Name"
            required
            value={values.name}
            onBlur={() => setNameTouched(true)}
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                name: event.target.value,
              }))
            }
            error={isNameEmpty}
            helperText={isNameEmpty ? 'Name is required.' : ' '}
          />
          <TextField
            label="Company"
            value={values.company}
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                company: event.target.value,
              }))
            }
          />
          <TextField
            label="Email"
            type="email"
            value={values.email}
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                email: event.target.value,
              }))
            }
          />
          <FormControl>
            <InputLabel id="customer-status-label">Status</InputLabel>
            <Select
              labelId="customer-status-label"
              label="Status"
              value={values.status}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  status: event.target.value,
                }))
              }
            >
              <MenuItem value="">Use backend default</MenuItem>
              <MenuItem value="active">active</MenuItem>
              <MenuItem value="inactive">inactive</MenuItem>
            </Select>
          </FormControl>
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