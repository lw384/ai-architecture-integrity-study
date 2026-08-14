import {
    appendBaselineDeltaFinding,
    buildMetricResult,
    computeDelta,
} from './_shared/metric-result.mjs';
import { analyzeJsxDepth } from './_shared/frontend-source-analysis.mjs';

export const VERSION = '1.0.0';

export async function run({ targetDir, baselineDir, config }) {
    const target = analyzeJsxDepth(targetDir, config ?? {});
    const baseline = baselineDir ? analyzeJsxDepth(baselineDir, config ?? {}) : null;
    const delta = computeDelta(target.averageDepth, baseline?.averageDepth, 2);
    const findings = appendBaselineDeltaFinding([
        `Average JSX depth: ${target.averageDepth}`,
    ], delta, {
        missingBaselineMessage: 'Baseline JSX depth distribution unavailable; delta_vs_baseline is set to null.',
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
