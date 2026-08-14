import {
    appendBaselineDeltaFinding,
    buildMetricResult,
    computeDelta,
} from './_shared/metric-result.mjs';
import { analyzeComponentLineCounts } from './_shared/frontend-source-analysis.mjs';

export const VERSION = '1.0.0';

export async function run({ targetDir, baselineDir, config }) {
    const target = analyzeComponentLineCounts(targetDir, config ?? {});
    const baseline = baselineDir ? analyzeComponentLineCounts(baselineDir, config ?? {}) : null;
    const delta = computeDelta(target.averageLines, baseline?.averageLines, 2);
    const findings = appendBaselineDeltaFinding([
        `Average component non-blank lines: ${target.averageLines}`,
    ], delta, {
        missingBaselineMessage: 'Baseline component line distribution unavailable; delta_vs_baseline is set to null.',
    });

    return buildMetricResult({
        value: target.averageLines,
        unit: 'lines',
        direction: 'lower_is_better',
        delta,
        findings,
        rawArtifactPath: config?.raw_artifact_path,
        details: { target, baseline },
    });
}
