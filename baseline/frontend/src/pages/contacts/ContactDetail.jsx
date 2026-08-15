import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import ArrowLeftOutlined from '@ant-design/icons/ArrowLeftOutlined';
import { Link, useParams } from 'react-router-dom';

import MainCard from 'components/MainCard';
import IconButton from 'components/IconButton';
import { isTransportError } from 'api/request';
import { useContact } from './contactQueries';
import { useCompany } from '../companies/companyQueries';

function formatDate(value) {
  if (!value) {
    return '—';
  }

  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function DetailRow({ label, value }) {
  return (
    <Stack direction="row" spacing={2} sx={{ justifyContent: 'space-between' }}>
      <Typography color="text.secondary">
        {label}
      </Typography>
      <Typography>{value || '—'}</Typography>
    </Stack>
  );
}


export default function ContactDetail() {
  const { id } = useParams();
  const contactQuery = useContact(id);
  const contact = contactQuery.data;
  const companyQuery = useCompany(contact?.companyId);

  const companyValue = !contact?.companyId
    ? '—'
    : companyQuery.isLoading
      ? 'Loading...'
      : companyQuery.data?.name || contact.companyId;

  return (
    <Stack spacing={2}>
      <IconButton component={Link} to="/contacts" aria-label="Back to contacts" shape="rounded">
        <ArrowLeftOutlined />
      </IconButton>

      <MainCard title={contact?.name || 'Contact detail'}>
        {contactQuery.isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
            <CircularProgress />
          </Box>
        ) : null}

        {contactQuery.isError && !isTransportError(contactQuery.error) ? (
          <Typography color="error">{contactQuery.error?.message || 'Failed to load contact.'}</Typography>
        ) : null}

        {contact ? (
          <Stack spacing={1.5}>
            <DetailRow label="ID" value={contact.id} />
            <DetailRow label="Company" value={companyValue} />
            <DetailRow label="Email" value={contact.email} />
            <DetailRow label="Phone" value={contact.phone} />
            <DetailRow label="Role" value={contact.role} />
            <DetailRow label="Created" value={formatDate(contact.createdAt)} />
          </Stack>
        ) : null}
      </MainCard>
    </Stack>
  );
}
