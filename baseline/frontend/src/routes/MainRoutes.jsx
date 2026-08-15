import { createElement, lazy } from 'react';
import { Navigate } from 'react-router-dom';

// project imports
import Loadable from 'components/Loadable';
import Layout from 'layout';
import { protectRoute } from './ProtectedRoute';
import { routeDefinitions } from './route-registry';

const componentsById = Object.fromEntries(routeDefinitions.map((definition) => [definition.id, Loadable(lazy(definition.loader))]));
const defaultRoutes = routeDefinitions.filter((definition) => definition.default);

if (defaultRoutes.length !== 1) {
  throw new Error('Exactly one default route must be configured.');
}

const [defaultRoute] = defaultRoutes;

// ==============================|| MAIN ROUTING ||============================== //

const MainRoutes = {
  path: '/',
  element: <Layout />,
  children: [
    {
      index: true,
      element: <Navigate replace to={`/${defaultRoute.path}`} />
    },
    ...routeDefinitions.map((definition) => ({
      path: definition.path,
      element: protectRoute(definition.accessId ?? definition.id, createElement(componentsById[definition.id]))
    }))
  ]
};

export default MainRoutes;
