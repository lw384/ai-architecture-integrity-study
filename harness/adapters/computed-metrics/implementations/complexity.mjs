import {
    buildMetricResult,
    computeDelta,
} from './_shared/metric-result.mjs';

// Metric implementation key: complexity.
// Rule linkage is provided by rule YAML files that set implementation: complexity.

export const VERSION = '3.2.1';

export async function run({ config = {} }) {
    const targetScore = config.target_value ?? 12.5;
    const baselineScore = config.baseline_value ?? 10.0;
    const delta = computeDelta(targetScore, baselineScore, 6);
    const findings = config.findings ?? (
        delta > 0 ? ['auth.service.ts complexity increased from baseline'] : []
    );

    return buildMetricResult({
        value: targetScore,
        unit: 'complexity',
        direction: 'lower_is_better',
        delta,
        findings,
        rawArtifactPath: config.raw_artifact_path,
    });
}