import useRouteAccess from 'hooks/useRouteAccess';

import { getDefaultAccessiblePath } from '../config/route-access.config';

export default function useProtectedRoute(routeId, pathname) {
    const { allowedRouteIds, isRouteAllowed } = useRouteAccess();

    if (isRouteAllowed(routeId)) {
        return {
            isAllowed: true,
            redirectTo: null
        };
    }

    const fallbackPath = getDefaultAccessiblePath(allowedRouteIds);

    return {
        isAllowed: false,
        redirectTo: pathname === fallbackPath ? null : fallbackPath
    };
}
