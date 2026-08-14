import {
    appendBaselineDeltaFinding,
    buildMetricResult,
    computeDelta,
} from './_shared/metric-result.mjs';
import { analyzeRoutes } from './_shared/frontend-source-analysis.mjs';

export const VERSION = '1.0.0';

export async function run({ targetDir, baselineDir, config }) {
    const target = analyzeRoutes(targetDir, config ?? {});
    const baseline = baselineDir ? analyzeRoutes(baselineDir, config ?? {}) : null;
    const delta = computeDelta(target.averageParamCount, baseline?.averageParamCount, 2);
    const findings = appendBaselineDeltaFinding([
        `Average route parameter count: ${target.averageParamCount}`,
    ], delta, {
        missingBaselineMessage: 'Baseline route parameter complexity unavailable; delta_vs_baseline is set to null.',
    });

    return buildMetricResult({
        value: target.averageParamCount,
        unit: 'params',
        direction: 'lower_is_better',
        delta,
        findings,
        rawArtifactPath: config?.raw_artifact_path,
        details: { target, baseline },
    });
}
