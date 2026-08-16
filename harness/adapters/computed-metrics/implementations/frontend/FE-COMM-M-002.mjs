import {
    appendBaselineDeltaFinding,
    buildMetricResult,
    computeDelta,
} from '../_shared/metric-result.mjs';
import { analyzePropDrilling } from './frontend-source-analysis.mjs';

export const VERSION = '1.0.0';

export async function run({ targetDir, baselineDir, config }) {
    const target = analyzePropDrilling(targetDir, config ?? {});
    const baseline = baselineDir ? analyzePropDrilling(baselineDir, config ?? {}) : null;
    const delta = computeDelta(target.averagePropFanout, baseline?.averagePropFanout, 2);
    const findings = appendBaselineDeltaFinding([
        `Average prop-drilling candidate fanout: ${target.averagePropFanout}`,
    ], delta, {
        missingBaselineMessage: 'Baseline prop-drilling metric unavailable; delta_vs_baseline is set to null.',
    });

    return buildMetricResult({
        value: target.averagePropFanout,
        unit: 'props',
        direction: 'lower_is_better',
        delta,
        findings,
        rawArtifactPath: config?.raw_artifact_path,
        details: { target, baseline },
    });
}
