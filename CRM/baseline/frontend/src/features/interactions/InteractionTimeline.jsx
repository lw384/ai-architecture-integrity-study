import {
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import PhoneForwardedRoundedIcon from '@mui/icons-material/PhoneForwardedRounded';
import AlternateEmailRoundedIcon from '@mui/icons-material/AlternateEmailRounded';
import GroupsRoundedIcon from '@mui/icons-material/GroupsRounded';
import StickyNote2RoundedIcon from '@mui/icons-material/StickyNote2Rounded';
import Timeline from '@mui/lab/Timeline';
import TimelineConnector from '@mui/lab/TimelineConnector';
import TimelineContent from '@mui/lab/TimelineContent';
import TimelineDot from '@mui/lab/TimelineDot';
import TimelineItem from '@mui/lab/TimelineItem';
import TimelineOppositeContent from '@mui/lab/TimelineOppositeContent';
import TimelineSeparator from '@mui/lab/TimelineSeparator';

const iconByType = {
  call: <PhoneForwardedRoundedIcon fontSize="small" />,
  email: <AlternateEmailRoundedIcon fontSize="small" />,
  meeting: <GroupsRoundedIcon fontSize="small" />,
  note: <StickyNote2RoundedIcon fontSize="small" />,
};

function formatDate(value) {
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function InteractionTimeline({ interactions }) {
  if (!interactions.length) {
    return (
      <Paper sx={{ p: 4, textAlign: 'center', borderRadius: 4 }}>
        <Typography variant="subtitle1">No interactions yet</Typography>
        <Typography sx={{ mt: 1, color: 'text.secondary' }}>
          Add one and watch the customer lastContactedAt refresh.
        </Typography>
      </Paper>
    );
  }

  const items = [...interactions].sort(
    (left, right) => new Date(right.occurredAt) - new Date(left.occurredAt),
  );

  return (
    <Timeline position="alternate" sx={{ m: 0, p: 0 }}>
      {items.map((interaction, index) => (
        <TimelineItem key={interaction.id}>
          <TimelineOppositeContent color="text.secondary" sx={{ flex: 0.2 }}>
            {formatDate(interaction.occurredAt)}
          </TimelineOppositeContent>
          <TimelineSeparator>
            <TimelineDot color="secondary">{iconByType[interaction.type]}</TimelineDot>
            {index < items.length - 1 ? <TimelineConnector /> : null}
          </TimelineSeparator>
          <TimelineContent>
            <Paper sx={{ borderRadius: 4, p: 2.5 }}>
              <Stack spacing={1}>
                <Typography variant="subtitle1" sx={{ textTransform: 'capitalize' }}>
                  {interaction.type}
                </Typography>
                <Typography color="text.secondary">
                  {interaction.note || 'No note provided.'}
                </Typography>
              </Stack>
            </Paper>
          </TimelineContent>
        </TimelineItem>
      ))}
    </Timeline>
  );
}