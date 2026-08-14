import { businessJsxMaxDepthRule } from './component-rules.js';
import {
    networkCallsOnlyInApprovedModulesRule,
    useEffectRequiresDependencyArrayRule,
} from './data-rules.js';
import { noGlobalEventBusRule } from './communication-rules.js';
import {
    contextProviderOnlyInControlledLocationsRule,
    noUseStateInDeepChildComponentsRule,
} from './state-rules.js';
import {
    routeDefinitionsOnlyInRoutesDirRule,
    routeMustMapToPageComponentRule,
} from './route-rules.js';
import {
    globalStylesOnlyInApprovedLocationsRule,
    noRawJsxStyleRule,
} from './style-rules.js';

export const architecturePlugin = {
    rules: {
        'business-jsx-max-depth': businessJsxMaxDepthRule,
        'no-usestate-in-deep-child-components': noUseStateInDeepChildComponentsRule,
        'context-provider-only-in-controlled-locations': contextProviderOnlyInControlledLocationsRule,
        'route-definitions-only-in-routes-dir': routeDefinitionsOnlyInRoutesDirRule,
        'route-must-map-to-page-component': routeMustMapToPageComponentRule,
        'no-raw-jsx-style': noRawJsxStyleRule,
        'global-styles-only-in-approved-locations': globalStylesOnlyInApprovedLocationsRule,
        'network-calls-only-in-approved-modules': networkCallsOnlyInApprovedModulesRule,
        'useeffect-requires-dependency-array': useEffectRequiresDependencyArrayRule,
        'no-global-event-bus': noGlobalEventBusRule,
    },
};
