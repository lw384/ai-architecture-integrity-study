import {
    appendBaselineDeltaFinding,
    buildMetricResult,
    computeDelta,
} from './_shared/metric-result.mjs';
import { analyzeMethodParameters } from './_shared/backend-source-analysis.mjs';

export const VERSION = '1.0.0';

export async function run({ targetDir, baselineDir, config }) {
    const target = analyzeMethodParameters(targetDir, config ?? {});
    const baseline = baselineDir ? analyzeMethodParameters(baselineDir, config ?? {}) : null;
    const delta = computeDelta(target.ratio, baseline?.ratio, 6);
    const findings = appendBaselineDeltaFinding([
        `Methods over parameter limit: ${target.violatingMethods}/${target.totalMethods} (${target.ratio})`,
    ], delta, {
        missingBaselineMessage: 'Baseline method-parameter ratio unavailable; delta_vs_baseline is set to null.',
    });

    return buildMetricResult({
        value: target.ratio,
        unit: 'ratio',
        direction: 'lower_is_better',
        delta,
        findings,
        rawArtifactPath: config?.raw_artifact_path,
        details: {
            target,
            baseline,
        },
    });
}
