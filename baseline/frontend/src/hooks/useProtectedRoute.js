import useRouteAccess from 'hooks/useRouteAccess';

import { getDefaultAccessiblePath } from '../config/route-access.config';

export default function useProtectedRoute(routeId, pathname) {
    const { allowedRouteIds, isLoading, isRouteAllowed } = useRouteAccess();

    if (isLoading) {
        return {
            isLoading: true,
            isAllowed: false,
            redirectTo: null
        };
    }

    if (isRouteAllowed(routeId)) {
        return {
            isLoading: false,
            isAllowed: true,
            redirectTo: null
        };
    }

    const fallbackPath = getDefaultAccessiblePath(allowedRouteIds);

    return {
        isLoading: false,
        isAllowed: false,
        redirectTo: pathname === fallbackPath ? null : fallbackPath
    };
}