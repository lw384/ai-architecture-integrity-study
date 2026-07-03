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
      <Paper className="crm-empty-state">
        <Typography variant="subtitle1">No interactions yet</Typography>
        <Typography className="crm-empty-copy">
          Add one and watch the customer lastContactedAt refresh.
        </Typography>
      </Paper>
    );
  }

  const items = [...interactions].sort(
    (left, right) => new Date(right.occurredAt) - new Date(left.occurredAt),
  );

  return (
    <Timeline position="alternate" className="crm-timeline">
      {items.map((interaction, index) => (
        <TimelineItem key={interaction.id}>
          <TimelineOppositeContent color="text.secondary" className="crm-timeline-opposite">
            {formatDate(interaction.occurredAt)}
          </TimelineOppositeContent>
          <TimelineSeparator>
            <TimelineDot color="secondary">{iconByType[interaction.type]}</TimelineDot>
            {index < items.length - 1 ? <TimelineConnector /> : null}
          </TimelineSeparator>
          <TimelineContent>
            <Paper className="crm-timeline-paper">
              <Stack spacing={1}>
                <Typography variant="subtitle1" className="crm-capitalize">
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