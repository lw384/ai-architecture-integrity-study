import PropTypes from 'prop-types';
import { createContext, useCallback, useEffect, useMemo, useState } from 'react';

import menuItems from 'mock/menu';

import { defaultAllowedRouteIds, normalizeAllowedRouteIds, routeAccessRegistry } from '../config/route-access.config';

export const RouteAccessContext = createContext(undefined);

const mockRouteAccessResponse = {
  allowedRouteIds: defaultAllowedRouteIds,
  source: 'mock'
};

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

async function fetchRouteAccess() {
  const endpoint = import.meta.env.VITE_ROUTE_ACCESS_ENDPOINT;

  if (!endpoint) {
    return mockRouteAccessResponse;
  }

  try {
    const response = await fetch(endpoint, {
      headers: {
        Accept: 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Route access request failed with status ${response.status}`);
    }

    const payload = await response.json();
    const allowedRouteIds = normalizeAllowedRouteIds(payload?.allowedRouteIds ?? payload?.routes);

    return {
      allowedRouteIds,
      source: 'api'
    };
  } catch (error) {
    console.warn('Falling back to mock route access config.', error);

    return mockRouteAccessResponse;
  }
}

export function RouteAccessProvider({ children }) {
  const [allowedRouteIds, setAllowedRouteIds] = useState(defaultAllowedRouteIds);
  const [isLoading, setIsLoading] = useState(true);
  const [source, setSource] = useState('mock');

  useEffect(() => {
    let isMounted = true;

    async function loadRouteAccess() {
      const nextRouteAccess = await fetchRouteAccess();

      if (!isMounted) {
        return;
      }

      setAllowedRouteIds(nextRouteAccess.allowedRouteIds);
      setSource(nextRouteAccess.source);
      setIsLoading(false);
    }

    loadRouteAccess();

    return () => {
      isMounted = false;
    };
  }, []);

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
      isLoading,
      isRouteAllowed,
      source
    }),
    [allowedRouteIds, filteredMenuGroups, isLoading, isRouteAllowed, source]
  );

  return <RouteAccessContext.Provider value={value}>{children}</RouteAccessContext.Provider>;
}

RouteAccessProvider.propTypes = { children: PropTypes.node };