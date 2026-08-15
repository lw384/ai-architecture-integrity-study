import PropTypes from 'prop-types';
import { Navigate, useLocation } from 'react-router-dom';

import useProtectedRoute from 'hooks/useProtectedRoute';

export default function ProtectedRoute({ children, routeId }) {
  const location = useLocation();
  const { isAllowed, isLoading, redirectTo } = useProtectedRoute(routeId, location.pathname);

  if (isLoading) {
    return null;
  }

  if (isAllowed) {
    return children;
  }

  if (!redirectTo) {
    return (
      <section aria-labelledby="access-denied-title">
        <h1 id="access-denied-title">Access denied</h1>
        <p>You do not have permission to view this page.</p>
      </section>
    );
  }

  return <Navigate replace to={redirectTo} />;
}

export function protectRoute(routeId, element) {
  return <ProtectedRoute routeId={routeId}>{element}</ProtectedRoute>;
}

ProtectedRoute.propTypes = {
  children: PropTypes.node,
  routeId: PropTypes.string.isRequired
};
