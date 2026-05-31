import {
  Alert,
  Button,
  CircularProgress,
  Snackbar,
  Stack,
  Typography,
} from '@mui/material';
import BoltRoundedIcon from '@mui/icons-material/BoltRounded';
import { useState } from 'react';

import { InteractionFormDialog } from './InteractionFormDialog';
import {
  useCreateInteractionMutation,
  useInteractionsByCustomerQuery,
} from './interactionQueries';
import { InteractionTimeline } from './InteractionTimeline';

function extractErrorMessage(error, fallbackMessage) {
  return error?.message || fallbackMessage;
}

export function InteractionsPanel({ customerId }) {
  const interactionsQuery = useInteractionsByCustomerQuery(customerId);
  const createInteraction = useCreateInteractionMutation(customerId);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [feedback, setFeedback] = useState({ open: false, severity: 'success', message: '' });

  const handleSubmit = async (payload) => {
    try {
      await createInteraction.mutateAsync(payload);
      setDialogOpen(false);
      setFeedback({
        open: true,
        severity: 'success',
        message: 'Interaction created. Customer timestamps refreshed.',
      });
    } catch (error) {
      setFeedback({
        open: true,
        severity: 'error',
        message: extractErrorMessage(error, 'Interaction request failed.'),
      });
    }
  };

  return (
    <Stack spacing={2.5}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={2}>
        <Stack spacing={0.5}>
          <Typography variant="h5">Interactions</Typography>
          <Typography color="text.secondary">
            Every successful interaction should refresh both this timeline and the
            customer lastContactedAt field.
          </Typography>
        </Stack>
        <Button
          variant="contained"
          startIcon={<BoltRoundedIcon />}
          onClick={() => setDialogOpen(true)}
        >
          Log interaction
        </Button>
      </Stack>

      {interactionsQuery.isLoading ? (
        <Stack alignItems="center" py={6}>
          <CircularProgress />
        </Stack>
      ) : null}

      {interactionsQuery.isError ? (
        <Alert severity="error">
          {extractErrorMessage(
            interactionsQuery.error,
            'Failed to load interactions.',
          )}
        </Alert>
      ) : null}

      {interactionsQuery.data ? (
        <InteractionTimeline interactions={interactionsQuery.data} />
      ) : null}

      <InteractionFormDialog
        open={dialogOpen}
        isPending={createInteraction.isPending}
        onClose={() => setDialogOpen(false)}
        onSubmit={handleSubmit}
      />

      <Snackbar
        open={feedback.open}
        autoHideDuration={3200}
        onClose={() => setFeedback((current) => ({ ...current, open: false }))}
      >
        <Alert severity={feedback.severity} variant="filled">
          {feedback.message}
        </Alert>
      </Snackbar>
    </Stack>
  );
}