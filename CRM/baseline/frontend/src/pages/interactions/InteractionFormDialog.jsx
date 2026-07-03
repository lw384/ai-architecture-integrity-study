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
  type: '',
  note: '',
};

export function InteractionFormDialog({ isPending, onClose, onSubmit, open }) {
  const [values, setValues] = useState(emptyValues);

  useEffect(() => {
    if (open) {
      setValues(emptyValues);
    }
  }, [open]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const payload = {
      ...(values.type ? { type: values.type } : {}),
      note: values.note,
    };
    await onSubmit(payload);
  };

  return (
    <Dialog open={open} onClose={isPending ? undefined : onClose} fullWidth>
      <DialogTitle>Log interaction</DialogTitle>
      <DialogContent>
        <Stack component="form" spacing={2.5} className="crm-form-stack" onSubmit={handleSubmit}>
          <FormControl>
            <InputLabel id="interaction-type-label">Type</InputLabel>
            <Select
              labelId="interaction-type-label"
              label="Type"
              value={values.type}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  type: event.target.value,
                }))
              }
            >
              <MenuItem value="">Leave empty to test backend rule</MenuItem>
              <MenuItem value="call">call</MenuItem>
              <MenuItem value="email">email</MenuItem>
              <MenuItem value="meeting">meeting</MenuItem>
              <MenuItem value="note">note</MenuItem>
            </Select>
          </FormControl>
          <TextField
            label="Note"
            multiline
            minRows={3}
            value={values.note}
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                note: event.target.value,
              }))
            }
          />
          <button type="submit" hidden />
        </Stack>
      </DialogContent>
      <DialogActions className="crm-dialog-actions">
        <Button onClick={onClose} disabled={isPending}>
          Cancel
        </Button>
        <Button variant="contained" onClick={handleSubmit} disabled={isPending}>
          Save interaction
        </Button>
      </DialogActions>
    </Dialog>
  );
}