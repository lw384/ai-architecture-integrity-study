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
  title: '',
  value: '',
  contactId: '',
  stage: '',
  expectedCloseDate: '',
};

export function DealFormDialog({
  contacts,
  initialValues,
  isPending,
  mode,
  onClose,
  onSubmit,
  open,
}) {
  const [values, setValues] = useState(emptyValues);
  const [titleTouched, setTitleTouched] = useState(false);
  const [valueTouched, setValueTouched] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    setValues({
      ...emptyValues,
      ...initialValues,
      contactId:
        initialValues?.contactId === null || initialValues?.contactId === undefined
          ? ''
          : String(initialValues.contactId),
      expectedCloseDate: initialValues?.expectedCloseDate ?? '',
      value:
        initialValues?.value === undefined || initialValues?.value === null
          ? ''
          : String(initialValues.value),
      stage: initialValues?.stage ?? '',
    });
    setTitleTouched(false);
    setValueTouched(false);
  }, [initialValues, open]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setTitleTouched(true);
    setValueTouched(true);

    if (!values.title.trim() || values.value === '') {
      return;
    }

    const payload = {
      title: values.title,
      value: Number(values.value),
      contactId: values.contactId ? Number(values.contactId) : null,
      expectedCloseDate: values.expectedCloseDate || null,
      ...(values.stage ? { stage: values.stage } : {}),
    };

    await onSubmit(payload);
  };

  return (
    <Dialog open={open} onClose={isPending ? undefined : onClose} fullWidth>
      <DialogTitle>{mode === 'create' ? 'Create deal' : 'Edit deal'}</DialogTitle>
      <DialogContent>
        <Stack component="form" spacing={2.5} sx={{ mt: 1 }} onSubmit={handleSubmit}>
          <TextField
            autoFocus
            required
            label="Title"
            value={values.title}
            onBlur={() => setTitleTouched(true)}
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                title: event.target.value,
              }))
            }
            error={titleTouched && !values.title.trim()}
            helperText={titleTouched && !values.title.trim() ? 'Title is required.' : ' '}
          />
          <TextField
            required
            type="number"
            label="Value"
            value={values.value}
            onBlur={() => setValueTouched(true)}
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                value: event.target.value,
              }))
            }
            error={valueTouched && values.value === ''}
            helperText={valueTouched && values.value === '' ? 'Value is required.' : ' '}
          />
          <FormControl>
            <InputLabel id="deal-contact-label">Contact</InputLabel>
            <Select
              labelId="deal-contact-label"
              label="Contact"
              value={values.contactId}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  contactId: event.target.value,
                }))
              }
            >
              <MenuItem value="">None / Unassigned</MenuItem>
              {contacts.map((contact) => (
                <MenuItem key={contact.id} value={String(contact.id)}>
                  {contact.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl>
            <InputLabel id="deal-stage-label">Stage</InputLabel>
            <Select
              labelId="deal-stage-label"
              label="Stage"
              value={values.stage}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  stage: event.target.value,
                }))
              }
            >
              <MenuItem value="">Use backend default</MenuItem>
              <MenuItem value="lead">lead</MenuItem>
              <MenuItem value="qualified">qualified</MenuItem>
              <MenuItem value="proposal">proposal</MenuItem>
              <MenuItem value="negotiation">negotiation</MenuItem>
              <MenuItem value="won">won</MenuItem>
              <MenuItem value="lost">lost</MenuItem>
            </Select>
          </FormControl>
          <TextField
            label="Expected close date"
            type="date"
            InputLabelProps={{ shrink: true }}
            value={values.expectedCloseDate}
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                expectedCloseDate: event.target.value,
              }))
            }
          />
          <button type="submit" hidden />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3 }}>
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