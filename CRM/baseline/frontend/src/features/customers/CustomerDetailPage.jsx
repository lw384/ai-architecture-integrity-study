import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  Grid,
  Stack,
  Tab,
  Tabs,
  Typography,
} from '@mui/material';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { ContactsPanel } from '../contacts/ContactsPanel';
import { DealsPanel } from '../deals/DealsPanel';
import { InteractionsPanel } from '../interactions/InteractionsPanel';
import { customerKeys, useCustomerDetailQuery } from './customerQueries';

function formatDate(value) {
  if (!value) {
    return '—';
  }

  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function DetailField({ label, value }) {
  return (
    <Stack spacing={0.5}>
      <Typography variant="overline" color="text.secondary">
        {label}
      </Typography>
      <Typography>{value || '—'}</Typography>
    </Stack>
  );
}

export function CustomerDetailPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { customerId } = useParams();
  const numericCustomerId = Number(customerId);
  const customerQuery = useCustomerDetailQuery(numericCustomerId);
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') ?? 'contacts';

  if (customerQuery.isLoading) {
    return (
      <Stack alignItems="center" py={12}>
        <CircularProgress />
      </Stack>
    );
  }

  if (customerQuery.isError) {
    return (
      <Stack spacing={2.5}>
        <Button startIcon={<ArrowBackRoundedIcon />} onClick={() => navigate('/customers')}>
          Back to customers
        </Button>
        <Alert severity="error">
          {customerQuery.error?.status === 404
            ? 'Customer not found. This is the expected 404 surface for the backend rule.'
            : customerQuery.error?.message || 'Failed to load customer detail.'}
        </Alert>
      </Stack>
    );
  }

  const customer = customerQuery.data;

  return (
    <Stack spacing={3}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={2}>
        <Button startIcon={<ArrowBackRoundedIcon />} onClick={() => navigate('/customers')}>
          Back to customers
        </Button>
        <Button
          startIcon={<RefreshRoundedIcon />}
          onClick={() =>
            queryClient.invalidateQueries({
              queryKey: customerKeys.detail(numericCustomerId),
            })
          }
        >
          Refresh detail
        </Button>
      </Stack>

      <Card sx={{ borderRadius: 5 }}>
        <CardContent sx={{ p: { xs: 3, md: 4 } }}>
          <Stack spacing={3}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} justifyContent="space-between">
              <Box>
                <Typography variant="h3">{customer.name}</Typography>
                <Typography sx={{ mt: 1.25, color: 'text.secondary' }}>
                  Customer #{customer.id}
                </Typography>
              </Box>
              <Stack direction="row" spacing={1} alignItems="flex-start">
                <Chip
                  label={customer.status}
                  color={customer.status === 'active' ? 'success' : 'default'}
                />
                <Chip label="baseline-v1" variant="outlined" />
              </Stack>
            </Stack>

            <Grid container spacing={3}>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <DetailField label="Company" value={customer.company} />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <DetailField label="Email" value={customer.email} />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <DetailField
                  label="Last Contacted"
                  value={formatDate(customer.lastContactedAt)}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <DetailField label="Created" value={formatDate(customer.createdAt)} />
              </Grid>
            </Grid>

            <Alert severity="info">
              This detail page is the main verification surface for cross-module behavior.
              Creating an interaction should update lastContactedAt above.
            </Alert>
          </Stack>
        </CardContent>
      </Card>

      <Card sx={{ borderRadius: 5 }}>
        <CardContent sx={{ p: 0 }}>
          <Tabs
            value={activeTab}
            onChange={(_, value) => setSearchParams({ tab: value })}
            variant="scrollable"
            allowScrollButtonsMobile
          >
            <Tab label="Contacts" value="contacts" />
            <Tab label="Interactions" value="interactions" />
            <Tab label="Deals" value="deals" />
          </Tabs>

          <Divider />

          <Box sx={{ p: { xs: 2, md: 3 } }}>
            {activeTab === 'contacts' ? (
              <ContactsPanel customerId={numericCustomerId} />
            ) : null}
            {activeTab === 'interactions' ? (
              <InteractionsPanel customerId={numericCustomerId} />
            ) : null}
            {activeTab === 'deals' ? (
              <DealsPanel customerId={numericCustomerId} />
            ) : null}
          </Box>
        </CardContent>
      </Card>
    </Stack>
  );
}