// rulepacks/metrics/cyclomatic-complexity.mjs
export const VERSION = "3.2.1";

export async function run({ targetDir, baselineDir }) {
    // 在真实逻辑中，你会在这里分别对 targetDir 和 baselineDir 跑计算，然后求差值
    // 这里我们用 hardcode 模拟：baseline 分数是 10.0，target 是 12.5

    const targetScore = 12.5;
    const baselineScore = 10.0;

    return {
        score: {
            value: targetScore,
            unit: 'complexity',
            direction: 'lower_is_better'
        },
        delta_vs_baseline: targetScore - baselineScore, // +2.5 意味着退化了
        findings: ["auth.service.ts complexity increased from baseline"]
    };
}