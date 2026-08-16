import {
    appendBaselineDeltaFinding,
    buildMetricResult,
    computeDelta,
} from '../_shared/metric-result.mjs';
import { analyzeDataAccessWrapping } from './frontend-source-analysis.mjs';

export const VERSION = '1.0.0';

export async function run({ targetDir, baselineDir, config }) {
    const target = analyzeDataAccessWrapping(targetDir, config ?? {});
    const baseline = baselineDir ? analyzeDataAccessWrapping(baselineDir, config ?? {}) : null;
    const delta = computeDelta(target.ratio, baseline?.ratio, 6);
    const findings = appendBaselineDeltaFinding([
        `Approved data-access wrapping ratio: ${target.approvedCalls}/${target.totalCalls} (${target.ratio})`,
    ], delta, {
        missingBaselineMessage: 'Baseline data-access wrapping ratio unavailable; delta_vs_baseline is set to null.',
    });

    return buildMetricResult({
        value: target.ratio,
        unit: 'ratio',
        direction: 'higher_is_better',
        delta,
        findings,
        rawArtifactPath: config?.raw_artifact_path,
        details: { target, baseline },
    });
}
