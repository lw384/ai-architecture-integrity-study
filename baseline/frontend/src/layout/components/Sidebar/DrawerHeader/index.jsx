import PropTypes from 'prop-types';

// project imports
import Logo from 'components/Logo';

// ==============================|| SIDEBAR HEADER ||============================== //

export default function DrawerHeader({ open }) {
  return (
    <div className={`flex min-h-[60px] w-auto items-center pt-2 pb-2 ${open ? 'justify-start pl-6' : 'justify-center pl-0'}`}>
      <Logo isIcon={!open} className={`h-[35px] ${open ? 'w-auto' : 'w-[35px]'}`} />
    </div>
  );
}

DrawerHeader.propTypes = { open: PropTypes.bool };
