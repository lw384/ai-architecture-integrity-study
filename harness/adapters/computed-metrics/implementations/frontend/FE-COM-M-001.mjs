import {
    appendBaselineDeltaFinding,
    buildMetricResult,
    computeDelta,
} from '../_shared/metric-result.mjs';
import { analyzeRenderDecisionDepth } from './frontend-source-analysis.mjs';

export const VERSION = '2.0.0';

export async function run({ targetDir, baselineDir, config }) {
    const target = analyzeRenderDecisionDepth(targetDir, config ?? {});
    const baseline = baselineDir ? analyzeRenderDecisionDepth(baselineDir, config ?? {}) : null;
    const delta = computeDelta(target.averageDepth, baseline?.averageDepth, 2);
    const findings = appendBaselineDeltaFinding([
        `Average maximum render-decision depth: ${target.averageDepth}`,
    ], delta, {
        missingBaselineMessage: 'Baseline render-decision depth distribution unavailable; delta_vs_baseline is set to null.',
    });

    return buildMetricResult({
        value: target.averageDepth,
        unit: 'levels',
        direction: 'lower_is_better',
        delta,
        findings,
        rawArtifactPath: config?.raw_artifact_path,
        details: { target, baseline },
    });
}
