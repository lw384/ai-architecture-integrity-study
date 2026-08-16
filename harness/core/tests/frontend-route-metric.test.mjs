import assert from 'node:assert/strict';
import test from 'node:test';

import { run } from '../../adapters/computed-metrics/implementations/frontend/FE-ROUTE-M-001.mjs';
import { runFrontendMetric } from './frontend-metric-test-helpers.mjs';

test('route complexity averages dynamic parameter segments from static route objects', async () => {
    const result = await runFrontendMetric(run, {
        'src/routes/index.js': `
            const dynamic = '/ignored/:id';
            export const routes = [
                { path: '/companies/:companyId/contacts/:contactId', element: 'detail' },
                { path: \`/settings/:section\`, element: 'settings' },
                { path: '/dashboard', element: 'dashboard' },
                { path: dynamic, element: 'ignored' },
            ];
        `,
        'src/pages/not-a-route.js': "export const fake = { path: '/outside/:id/:child' };",
    });

    assert.equal(result.details.target.totalRoutes, 3);
    assert.equal(result.score.value, 1);
    assert.deepEqual(result.details.target.details.map((item) => item.paramCount), [2, 1, 0]);
});

test('routes_root is configurable and non-production route fixtures are excluded', async () => {
    const result = await runFrontendMetric(run, {
        'app/navigation/routes.ts': "export const routes = [{ path: '/users/:id' }];",
        'app/navigation/routes.spec.ts': "export const routes = [{ path: '/bad/:a/:b/:c' }];",
    }, { routes_root: 'app/navigation' });

    assert.equal(result.details.target.totalRoutes, 1);
    assert.equal(result.score.value, 1);
});
