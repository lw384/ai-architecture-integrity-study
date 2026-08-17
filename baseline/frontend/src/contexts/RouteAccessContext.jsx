import PropTypes from 'prop-types';
import { createContext, useCallback, useMemo } from 'react';

import menuItems from 'mock/menu';

import { defaultAllowedRouteIds, routeAccessRegistry } from '../config/route-access.config';

export const RouteAccessContext = createContext(undefined);

function filterMenuItems(items, allowedRouteIds) {
  return items
    .map((item) => {
      if (item.type === 'group') {
        const children = filterMenuItems(item.children ?? [], allowedRouteIds);

        return children.length > 0 ? { ...item, children } : null;
      }

      const routeDefinition = routeAccessRegistry[item.id];

      if (!routeDefinition) {
        return null;
      }

      if (routeDefinition.public) {
        return item;
      }

      return allowedRouteIds.includes(item.id) ? item : null;
    })
    .filter(Boolean);
}

export function RouteAccessProvider({ children }) {
  const allowedRouteIds = defaultAllowedRouteIds;

  const filteredMenuGroups = useMemo(() => filterMenuItems(menuItems.items, allowedRouteIds), [allowedRouteIds]);

  const isRouteAllowed = useCallback(
    (routeId) => {
      const routeDefinition = routeAccessRegistry[routeId];

      if (!routeDefinition) {
        return false;
      }

      if (routeDefinition.public) {
        return true;
      }

      return allowedRouteIds.includes(routeId);
    },
    [allowedRouteIds]
  );

  const value = useMemo(
    () => ({
      allowedRouteIds,
      filteredMenuGroups,
      isRouteAllowed
    }),
    [allowedRouteIds, filteredMenuGroups, isRouteAllowed]
  );

  return <RouteAccessContext.Provider value={value}>{children}</RouteAccessContext.Provider>;
}

RouteAccessProvider.propTypes = { children: PropTypes.node };
