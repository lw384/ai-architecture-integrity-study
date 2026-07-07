// mock/test_metrics.mjs
import path from 'node:path';
import { runMetrics } from '../core/layers/metrics_runner.mjs';

async function main() {
    const taskConfig = {
        enabled: {
            metrics: ['cyclomatic-complexity']
        },
        thresholds: {
            // 因为 score.direction 是 'lower_is_better'，12.5 超过了 10，所以会被判定为 WARN
            'cyclomatic-complexity': { warn: 10, fail: 15 }
        }
    };

    const targetDir = '/tmp/harness-target';
    const baselineDir = '/tmp/harness-baseline';
    const rulepackDir = path.resolve(process.cwd(), 'rulepacks');

    console.log('--- Starting Metrics Runner (v2) ---');

    const results = await runMetrics({ targetDir, baselineDir, rulepackDir, taskConfig });

    console.log(JSON.stringify(results, null, 2));
}

main();