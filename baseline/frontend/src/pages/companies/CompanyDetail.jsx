import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import ArrowLeftOutlined from '@ant-design/icons/ArrowLeftOutlined';
import { Link, useParams } from 'react-router-dom';

import MainCard from 'components/MainCard';
import IconButton from 'components/IconButton';
import { isTransportError } from 'api/request';
import formatDate from 'utils/formatDate';
import { useCompany } from './companyQueries';
import { useContactList } from '../contacts/contactQueries';

// constants
const statusColors = {
  "1": 'success',
  "0": 'default',
  "2": 'warning',
};

const statusLabels = {
  "1": 'Active',
  "0": 'Inactive',
  "2": 'Pending',
};

// subcomponents
function DetailRow({ label, value }) {
  return (
    <Stack direction="row" spacing={2} sx={{ justifyContent: 'space-between' }}>
      <Typography color="text.secondary">{label}</Typography>
      <Typography>{value || '—'}</Typography>
    </Stack>
  );
}

function CompanyContactsSection({ query, contacts }) {
  return (
    <Stack spacing={1} sx={{ pt: 1 }}>
      <Typography color="text.secondary">Contacts</Typography>

      {query.isLoading && <Typography>Loading contacts...</Typography>}

      {query.isError && !isTransportError(query.error) && (
        <Typography color="error">
          {query.error?.message || 'Failed to load contacts.'}
        </Typography>
      )}

      {!query.isLoading && !query.isError && contacts.length === 0 && (
        <Typography>—</Typography>
      )}

      {contacts.length > 0 && (
        <Stack spacing={0.75}>
          {contacts.map((contact) => (
            <Typography
              key={contact.id}
              component={Link}
              to={`/contacts/${contact.id}`}
              color="primary"
              sx={{ textDecoration: 'none' }}
            >
              {contact.name}
            </Typography>
          ))}
        </Stack>
      )}
    </Stack>
  );
}

// main component
export default function CompanyDetail() {
  const { id } = useParams();

  // get company data
  const companyQuery = useCompany(id);
  const company = companyQuery.data;

  // get contacts data
  const contactsQuery = useContactList({ companyId: id, page: 1, pageSize: 100 });
  const contacts = contactsQuery.data?.items ?? [];

  return (
    <Stack spacing={2}>
      <IconButton component={Link} to="/companies" aria-label="Back to companies" shape="rounded">
        <ArrowLeftOutlined />
      </IconButton>

      <MainCard title={company?.name || 'Company detail'}>
        {/* company loading state */}
        {companyQuery.isLoading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
            <CircularProgress />
          </Box>
        )}

        {/* company error state */}
        {companyQuery.isError && !isTransportError(companyQuery.error) && (
          <Typography color="error">
            {companyQuery.error?.message || 'Failed to load company.'}
          </Typography>
        )}

        {/* company detail display (if data is available) */}
        {company && (
          <Stack spacing={2} sx={{ mb: 3 }}>
            <DetailRow
              label="Status"
              value={
                company.status ? (
                  <Chip
                    label={statusLabels[company.status]}
                    color={statusColors[company.status]}
                    size="small"
                  />
                ) : '—'
              }
            />
            <DetailRow label="Email" value={company.email} />
            <DetailRow label="Phone" value={company.phone} />
            <DetailRow label="Industry" value={company.industry} />
            <DetailRow label="Created At" value={formatDate(company.createdAt)} />
            <DetailRow label="Last Contact At" value={formatDate(company.lastContactedAt)} />
          </Stack>
        )}

        {/* contacts section */}
        <CompanyContactsSection query={contactsQuery} contacts={contacts} />
      </MainCard>
    </Stack>
  );
}
