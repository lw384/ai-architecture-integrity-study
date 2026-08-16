import {
    appendBaselineDeltaFinding,
    buildMetricResult,
    computeDelta,
} from '../_shared/metric-result.mjs';
import { analyzePropCounts } from './frontend-source-analysis.mjs';

export const VERSION = '1.0.0';

export async function run({ targetDir, baselineDir, config }) {
    const target = analyzePropCounts(targetDir, config ?? {});
    const baseline = baselineDir ? analyzePropCounts(baselineDir, config ?? {}) : null;
    const delta = computeDelta(target.averagePropCount, baseline?.averagePropCount, 2);
    const findings = appendBaselineDeltaFinding([
        `Average prop count across destructured components: ${target.averagePropCount}`,
    ], delta, {
        missingBaselineMessage: 'Baseline prop-count metric unavailable; delta_vs_baseline is set to null.',
    });

    return buildMetricResult({
        value: target.averagePropCount,
        unit: 'props',
        direction: 'lower_is_better',
        delta,
        findings,
        rawArtifactPath: config?.raw_artifact_path,
        details: { target, baseline },
    });
}
