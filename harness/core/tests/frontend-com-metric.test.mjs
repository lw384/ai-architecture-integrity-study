import assert from 'node:assert/strict';
import test from 'node:test';

import { run } from '../../adapters/computed-metrics/implementations/frontend/FE-COM-M-001.mjs';
import { runFrontendMetric } from './frontend-metric-test-helpers.mjs';

test('render-decision metric averages component maxima rather than file maxima', async () => {
    const result = await runFrontendMetric(run, {
        'src/Panels.jsx': `
            export function Conditional({ first, second }) {
                return <main>{first && <section>{second ? <span>x</span> : null}</section>}</main>;
            }
            export function Flat() {
                return <main><section><span>structural only</span></section></main>;
            }
        `,
    });

    assert.equal(result.details.target.totalComponents, 2);
    assert.equal(result.score.value, 1);
    assert.equal(result.details.target.maxDepth, 2);
    assert.equal(result.details.target.p90Depth, 2);
    assert.deepEqual(
        result.details.target.details.map(({ component, maxDecisionDepth }) => ({ component, maxDecisionDepth })),
        [
            { component: 'Conditional', maxDecisionDepth: 2 },
            { component: 'Flat', maxDecisionDepth: 0 },
        ],
    );
});

test('structural nesting, text fallbacks, and non-JSX prop conditions do not count', async () => {
    const result = await runFrontendMetric(run, {
        'src/Structural.jsx': `
            export function Structural({ value, compact }) {
                return (
                    <main data-size={compact ? 'small' : 'large'}>
                        <section><article><div><span>{value || '—'}</span></div></article></section>
                    </main>
                );
            }
        `,
        'src/Structural.test.jsx': `
            export function Ignored({ a, b, c, d }) {
                return <main>{a && <A>{b && <B>{c && <C>{d && <D />}</C>}</B>}</A>}</main>;
            }
        `,
    });

    assert.equal(result.details.target.totalComponents, 1);
    assert.equal(result.score.value, 0);
    assert.deepEqual(result.details.target.details, [{
        file: 'src/Structural.jsx',
        component: 'Structural',
        maxDecisionDepth: 0,
        decisionCount: 0,
        deepestLine: null,
    }]);
});

test('JSX-valued prop decisions and nested render decisions are counted', async () => {
    const result = await runFrontendMetric(run, {
        'src/Panel.jsx': `
            export function Panel({ visible, alternate }) {
                return <Card secondary={visible ? (alternate ? <A /> : <B />) : null} />;
            }
        `,
    }, { render_decision_max_depth: 1 });

    assert.equal(result.score.value, 2);
    assert.equal(result.details.target.componentsOverLimit, 1);
    assert.deepEqual(result.details.target.details[0], {
        file: 'src/Panel.jsx',
        component: 'Panel',
        maxDecisionDepth: 2,
        decisionCount: 2,
        deepestLine: 3,
    });
});
