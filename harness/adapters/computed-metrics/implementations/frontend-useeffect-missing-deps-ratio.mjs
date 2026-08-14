import {
    appendBaselineDeltaFinding,
    buildMetricResult,
    computeDelta,
} from './_shared/metric-result.mjs';
import { analyzeUseEffectDependencyArrays } from './_shared/frontend-source-analysis.mjs';

export const VERSION = '1.0.0';

export async function run({ targetDir, baselineDir, config }) {
    const target = analyzeUseEffectDependencyArrays(targetDir, config ?? {});
    const baseline = baselineDir ? analyzeUseEffectDependencyArrays(baselineDir, config ?? {}) : null;
    const delta = computeDelta(target.ratio, baseline?.ratio, 6);
    const findings = appendBaselineDeltaFinding([
        `useEffect calls missing dependency arrays: ${target.missingDependencyArrays}/${target.totalUseEffects} (${target.ratio})`,
    ], delta, {
        missingBaselineMessage: 'Baseline useEffect dependency-array metric unavailable; delta_vs_baseline is set to null.',
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
