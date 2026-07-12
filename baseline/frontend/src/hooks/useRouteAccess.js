import { use } from 'react';

import { RouteAccessContext } from 'contexts/RouteAccessContext';

export default function useRouteAccess() {
    const context = use(RouteAccessContext);

    if (!context) {
        throw new Error('useRouteAccess must be used inside RouteAccessProvider');
    }

    return context;
}