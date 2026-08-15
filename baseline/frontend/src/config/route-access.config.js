import { routeDefinitions } from '../routes/route-registry';

export const routeAccessRegistry = Object.fromEntries(
    routeDefinitions.map((definition) => [
        definition.id,
        {
            id: definition.id,
            path: `/${definition.path}`,
            menu: definition.menu,
            external: definition.external,
            public: definition.public
        }
    ])
);

export const defaultAllowedRouteIds = Object.values(routeAccessRegistry)
    .filter((routeDefinition) => routeDefinition.menu)
    .map((routeDefinition) => routeDefinition.id);

export function normalizeAllowedRouteIds(routeIds) {
    if (!Array.isArray(routeIds)) {
        return defaultAllowedRouteIds;
    }

    return [...new Set(routeIds.filter((routeId) => routeAccessRegistry[routeId]))];
}

export function getDefaultAccessiblePath(allowedRouteIds) {
    const prioritizedRouteIds = routeDefinitions.filter((definition) => definition.menu && !definition.public).map((definition) => definition.id);

    const fallbackRouteId = prioritizedRouteIds.find((routeId) => allowedRouteIds.includes(routeId));

    return fallbackRouteId ? routeAccessRegistry[fallbackRouteId].path : null;
}
