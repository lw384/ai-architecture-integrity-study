import { createElement, lazy } from 'react';

// project imports
import Loadable from 'components/Loadable';
import Layout from 'layout';
import { protectRoute } from './ProtectedRoute';
import { routeDefinitions } from './route-registry';

const componentsById = Object.fromEntries(routeDefinitions.map((definition) => [definition.id, Loadable(lazy(definition.loader))]));

// ==============================|| MAIN ROUTING ||============================== //

const MainRoutes = {
  path: '/',
  element: <Layout />,
  children: [
    {
      index: true,
      element: protectRoute('dashboard', createElement(componentsById.dashboard))
    },
    ...routeDefinitions.map((definition) => ({
      path: definition.path,
      element: protectRoute(definition.accessId ?? definition.id, createElement(componentsById[definition.id]))
    }))
  ]
};

export default MainRoutes;
