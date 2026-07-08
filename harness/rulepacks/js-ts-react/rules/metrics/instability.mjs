// harness/rulepacks/js-ts-react/metrics/instability.mjs
import fs from 'node:fs';
import path from 'node:path';

export const VERSION = '1.0.0';

export async function run({ targetDir, baselineDir }) {
    // 假设你有辅助工具从目录中读取 dep-cruiser 的 json 报告
    const targetData = JSON.parse(fs.readFileSync(path.join(targetDir, 'reports/depcruise-raw.json'), 'utf8'));
    const baselineData = JSON.parse(fs.readFileSync(path.join(baselineDir, 'reports/depcruise-raw.json'), 'utf8'));

    const calc = (modules) => { /* ...复用之前的计算逻辑... */ };

    const targetScore = calc(targetData);
    const baselineScore = calc(baselineData);

    return {
        score: {
            value: targetScore,
            unit: 'ratio',
            direction: 'lower_is_better'
        },
        delta_vs_baseline: targetScore - baselineScore,
        findings: []
    };
}