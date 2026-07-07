// mock/test_aggregator.mjs
import { calculateDeltas } from '../core/aggregators/delta_aggregator.mjs';

function main() {
    // 1. 模拟三份历史快照数据
    const baselineData = {
        constraints: [{ name: 'dep-cruiser-layer', status: 'pass', findings: [] }],
        metrics: [{ name: 'cyclomatic-complexity', status: 'pass', score: { value: 10.0 } }],
        judgments: [{ name: 'architecture-compliance-llm', status: 'pass', score: 95 }]
    };

    const preData = {
        constraints: [{ name: 'dep-cruiser-layer', status: 'fail', findings: [{}] }], // 1个违规
        metrics: [{ name: 'cyclomatic-complexity', status: 'pass', score: { value: 12.0 } }],
        judgments: [{ name: 'architecture-compliance-llm', status: 'pass', score: 85 }]
    };

    const postData = {
        constraints: [{ name: 'dep-cruiser-layer', status: 'fail', findings: [{}, {}] }], // 2个违规
        metrics: [{ name: 'cyclomatic-complexity', status: 'fail', score: { value: 15.0 } }],
        judgments: [{ name: 'architecture-compliance-llm', status: 'pass', score: 75 }]
    };

    console.log('--- Starting Delta Aggregator ---');

    const deltas = calculateDeltas({ baselineData, preData, postData });

    console.log(JSON.stringify(deltas, null, 2));
}

main();