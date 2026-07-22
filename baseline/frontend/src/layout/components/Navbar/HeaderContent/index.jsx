// material-ui
import Box from '@mui/material/Box';
import useMediaQuery from '@mui/material/useMediaQuery';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';

// project imports
import Search from './Search';
import Profile from './Profile';
import Notification from './Notification';
import MobileSection from './MobileSection';

// project import
import { GithubOutlined } from '@ant-design/icons';

// ==============================|| HEADER - CONTENT ||============================== //

export default function HeaderContent() {
  const downLG = useMediaQuery((theme) => theme.breakpoints.down('lg'));

  return (
    <>
      {!downLG && <Search />}
      {downLG && <Box sx={{ ml: 1, width: '100%' }} />}
      <IconButton
        component={Link}
        href="https://github.com/lw384/ai-architecture-integrity-study"
        target="_blank"
        disableRipple
        color="secondary"
        title="Download Free Version"
        sx={{
          bgcolor: 'background.paper',
          color: 'text.primary',
          '&:hover': {
            bgcolor: 'action.hover',
          },
        }}
      >
        <GithubOutlined />
      </IconButton>

      <Notification />
      {!downLG && <Profile />}
      {downLG && <MobileSection />}
    </>
  );
}