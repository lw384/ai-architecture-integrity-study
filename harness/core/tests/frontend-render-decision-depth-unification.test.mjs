import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { runAdapter as runFrontendStatic } from '../../adapters/frontend-static/adapter.mjs';
import { run as runComMetric } from '../../adapters/computed-metrics/implementations/frontend/FE-COM-M-001.mjs';

const harnessRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const frontendStaticConfigPath = path.join(
    harnessRoot,
    'rulepacks/js-react-frontend/tool-configs/frontend-static.config.json',
);
const frontendStaticConfig = JSON.parse(fs.readFileSync(frontendStaticConfigPath, 'utf8'));
const metricConfig = JSON.parse(fs.readFileSync(
    path.join(harnessRoot, 'rulepacks/js-react-frontend/tool-configs/metrics.config.json'),
    'utf8',
)).metrics['FE-COM-M-001-render-decision-depth-average'];

function writeFiles(rootDir, files) {
    for (const [relativePath, content] of Object.entries(files)) {
        const filePath = path.join(rootDir, relativePath);
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, content, 'utf8');
    }
}

async function withTempDir(files, callback) {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'frontend-render-decision-depth-'));

    try {
        writeFiles(rootDir, files);
        return await callback(rootDir);
    } finally {
        fs.rmSync(rootDir, { recursive: true, force: true });
    }
}

async function analyze(rootDir) {
    const constraintResult = await runFrontendStatic({
        targetDir: rootDir,
        adapterConfig: { configPath: frontendStaticConfigPath },
        toolVersion: 'test',
    });
    const metricResult = await runComMetric({ targetDir: rootDir, baselineDir: null, config: metricConfig });

    return {
        findings: constraintResult.normalized_events.filter(
            (event) => event.source_rule_id === 'FE-COM-C-002',
        ),
        metric: metricResult.details.target,
    };
}

test('constraint and metric share the same maximum decision depth for each component', async () => {
    assert.equal(metricConfig.render_decision_max_depth, frontendStaticConfig.render_decision_max_depth);

    await withTempDir({
        'src/pages/Dashboard.jsx': `
            export function Dashboard({ a, b, c, d }) {
                return <main>{a && <section>{b ? <article>{c && <div>{d ? <b>x</b> : null}</div>}</article> : null}</section>}</main>;
            }
        `,
    }, async (rootDir) => {
        const result = await analyze(rootDir);
        const detail = result.metric.details.find((item) => item.component === 'Dashboard');

        assert.equal(result.findings.length, 1);
        assert.equal(result.findings[0].payload.component, 'Dashboard');
        assert.equal(result.findings[0].payload.decision_depth, 4);
        assert.equal(detail.maxDecisionDepth, 4);
        assert.equal(result.metric.componentsOverLimit, 1);
    });
});

test('one component emits only one finding when several branches exceed the limit', async () => {
    await withTempDir({
        'src/pages/Dashboard.jsx': `
            export function Dashboard({ a, b, c, d, w, x, y, z }) {
                return <main>
                    {a && <section>{b && <article>{c && <div>{d && <b>first</b>}</div>}</article>}</section>}
                    {w && <section>{x && <article>{y && <div>{z && <b>second</b>}</div>}</article>}</section>}
                </main>;
            }
        `,
    }, async (rootDir) => {
        const result = await analyze(rootDir);

        assert.equal(result.findings.length, 1);
        assert.equal(result.findings[0].payload.component, 'Dashboard');
        assert.equal(result.findings[0].payload.decision_depth, 4);
    });
});

test('two over-limit components in one file emit one finding each', async () => {
    await withTempDir({
        'src/pages/Panels.jsx': `
            export function First({ a, b, c, d }) {
                return <main>{a && <section>{b && <article>{c && <div>{d && <b>first</b>}</div>}</article>}</section>}</main>;
            }
            export function Second({ a, b, c, d }) {
                return <main>{a && <section>{b && <article>{c && <div>{d && <b>second</b>}</div>}</article>}</section>}</main>;
            }
        `,
    }, async (rootDir) => {
        const result = await analyze(rootDir);

        assert.deepEqual(result.findings.map((item) => item.payload.component), ['First', 'Second']);
        assert.equal(result.metric.totalComponents, 2);
        assert.deepEqual(result.metric.details.map((item) => item.maxDecisionDepth), [4, 4]);
    });
});

test('structural JSX, flat logical chains, and else-if chains do not create artificial nesting', async () => {
    await withTempDir({
        'src/pages/Panels.jsx': `
            export function Structural() {
                return <main><section><div><article><span><b><i><em><strong>x</strong></em></i></b></span></article></div></section></main>;
            }
            export function FlatConditions({ a, b, c }) {
                if (a) return <A />;
                else if (b) return <B />;
                else if (c) return <C />;
                return <main>{a && b && c && <D />}</main>;
            }
        `,
    }, async (rootDir) => {
        const result = await analyze(rootDir);

        assert.deepEqual(result.findings, []);
        assert.deepEqual(
            result.metric.details.map(({ component, maxDecisionDepth }) => ({ component, maxDecisionDepth })),
            [
                { component: 'Structural', maxDecisionDepth: 0 },
                { component: 'FlatConditions', maxDecisionDepth: 1 },
            ],
        );
    });
});

test('memo, forwardRef, and class render bodies are analyzed as component boundaries', async () => {
    await withTempDir({
        'src/pages/WrappedPanels.jsx': `
            import React, { forwardRef, memo } from 'react';
            export const MemoPanel = memo(({ visible }) => <main>{visible && <A />}</main>);
            export const ForwardPanel = forwardRef(({ a, b }, ref) => (
                <main ref={ref}>{a && <section>{b ? <B /> : null}</section>}</main>
            ));
            export class ClassPanel extends React.Component {
                render() {
                    return <main>{this.props.visible && <C />}</main>;
                }
            }
        `,
    }, async (rootDir) => {
        const result = await analyze(rootDir);

        assert.deepEqual(
            result.metric.details.map(({ component, maxDecisionDepth }) => ({ component, maxDecisionDepth })),
            [
                { component: 'MemoPanel', maxDecisionDepth: 1 },
                { component: 'ForwardPanel', maxDecisionDepth: 2 },
                { component: 'ClassPanel', maxDecisionDepth: 1 },
            ],
        );
    });
});
