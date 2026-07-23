import { businessJsxMaxDepthRule } from './component-rules.js';
import {
    contextProviderOnlyInControlledLocationsRule,
    noUseStateInDeepChildComponentsRule,
} from './state-rules.js';
import {
    routeDefinitionsOnlyInRoutesDirRule,
    routeMustMapToPageComponentRule,
} from './route-rules.js';

export const architecturePlugin = {
    rules: {
        'business-jsx-max-depth': businessJsxMaxDepthRule,
        'no-usestate-in-deep-child-components': noUseStateInDeepChildComponentsRule,
        'context-provider-only-in-controlled-locations': contextProviderOnlyInControlledLocationsRule,
        'route-definitions-only-in-routes-dir': routeDefinitionsOnlyInRoutesDirRule,
        'route-must-map-to-page-component': routeMustMapToPageComponentRule,
    },
};
