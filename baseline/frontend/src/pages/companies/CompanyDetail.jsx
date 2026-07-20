import CircularProgress from '@mui/material/CircularProgress';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import ArrowLeftOutlined from '@ant-design/icons/ArrowLeftOutlined';
import { Link, useParams } from 'react-router-dom';

import MainCard from 'components/MainCard';
import IconButton from 'components/IconButton';
import { isTransportError } from 'api/request';
import { useCompany } from './companyQueries';
import { useContactList } from '../contacts/contactQueries';

function formatDate(value) {
  if (!value) {
    return '—';
  }

  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function DetailRow({ label, value }) {
  return (
    <Stack direction="row" spacing={2} className="justify-between">
      <Typography className="text-text-secondary">
        {label}
      </Typography>
      <Typography >{value || '—'}</Typography>
    </Stack>
  );
}

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

export default function CompanyDetail() {
  const { id } = useParams();
  const companyQuery = useCompany(id);
  const company = companyQuery.data;
  const contactsQuery = useContactList({ companyId: id, page: 1, pageSize: 100 });
  const contacts = contactsQuery.data?.items ?? [];

  return (
    <Stack spacing={2}>
      <IconButton component={Link} to="/companies" aria-label="Back to companies" shape="rounded">
        <ArrowLeftOutlined />
      </IconButton>

      <MainCard title={company?.name || 'Company detail'}>
        {companyQuery.isLoading ? (
          <div className="flex justify-center py-6">
            <CircularProgress />
          </div>
        ) : null}

        {companyQuery.isError && !isTransportError(companyQuery.error) ? (
          <Typography color="error">{companyQuery.error?.message || 'Failed to load company.'}</Typography>
        ) : null}

        {company ? (
          <Stack spacing={1.5}>
            <Stack direction="row" spacing={1} className="items-center">
              <Chip label={statusLabels[company.status]} size="small" color={statusColors[company.status]} />
              <Chip label={company.industry} size="small" variant="outlined" />
            </Stack>
            <DetailRow label="Email" value={company.email} />
            <DetailRow label="Phone" value={company.phone} />
            <DetailRow label="Website" value={company.website} />
            <DetailRow label="Last contacted" value={formatDate(company.lastContactedAt)} />
            <DetailRow label="Created" value={formatDate(company.createdAt)} />

            <Stack spacing={1} sx={{ pt: 1 }}>
              <Typography className="text-text-secondary">
                Contacts
              </Typography>

              {contactsQuery.isLoading ? (
                <Typography>Loading contacts...</Typography>
              ) : null}

              {contactsQuery.isError && !isTransportError(contactsQuery.error) ? (
                <Typography color="error">
                  {contactsQuery.error?.message || 'Failed to load contacts.'}
                </Typography>
              ) : null}

              {!contactsQuery.isLoading && !contactsQuery.isError && contacts.length === 0 ? (
                <Typography>—</Typography>
              ) : null}

              {contacts.length > 0 ? (
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
              ) : null}
            </Stack>
          </Stack>
        ) : null}
      </MainCard>
    </Stack>
  );
}
