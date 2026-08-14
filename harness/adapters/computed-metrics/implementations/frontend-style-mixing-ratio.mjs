import {
    appendBaselineDeltaFinding,
    buildMetricResult,
    computeDelta,
} from './_shared/metric-result.mjs';
import { analyzeStyleMixing } from './_shared/frontend-source-analysis.mjs';

export const VERSION = '1.0.0';

export async function run({ targetDir, baselineDir, config }) {
    const target = analyzeStyleMixing(targetDir, config ?? {});
    const baseline = baselineDir ? analyzeStyleMixing(baselineDir, config ?? {}) : null;
    const delta = computeDelta(target.ratio, baseline?.ratio, 6);
    const findings = appendBaselineDeltaFinding([
        `Style mixing ratio: ${target.mixedFiles}/${target.totalFiles} (${target.ratio})`,
    ], delta, {
        missingBaselineMessage: 'Baseline style mixing ratio unavailable; delta_vs_baseline is set to null.',
    });

    return buildMetricResult({
        value: target.ratio,
        unit: 'ratio',
        direction: 'lower_is_better',
        delta,
        findings,
        rawArtifactPath: config?.raw_artifact_path,
        details: { target, baseline },
    });
}
