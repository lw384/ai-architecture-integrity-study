export const VERSION = '3.2.1';

export async function run({ config = {} }) {
    const targetScore = config.target_value ?? 12.5;
    const baselineScore = config.baseline_value ?? 10.0;
    const delta = targetScore - baselineScore;
    const findings = config.findings ?? (
        delta > 0 ? ['auth.service.ts complexity increased from baseline'] : []
    );

    return {
        score: {
            value: targetScore,
            unit: 'complexity',
            direction: 'lower_is_better',
        },
        delta_vs_baseline: delta,
        findings,
        raw_artifact_path: config.raw_artifact_path,
    };
}