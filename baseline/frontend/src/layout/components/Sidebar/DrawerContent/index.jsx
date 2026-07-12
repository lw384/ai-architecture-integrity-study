import PropTypes from 'prop-types';

// project imports
import Navigation from './Navigation';
import SimpleBar from 'components/SimpleBar';

// ==============================|| SIDEBAR CONTENT ||============================== //

export default function DrawerContent({ isSidebarExpanded }) {
  return (
    <SimpleBar sx={{ '& .simplebar-content': { display: 'flex', flexDirection: 'column' } }}>
      <Navigation isSidebarExpanded={isSidebarExpanded} />
    </SimpleBar>
  );
}

DrawerContent.propTypes = { isSidebarExpanded: PropTypes.bool.isRequired };