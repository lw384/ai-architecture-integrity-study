import {
    appendBaselineDeltaFinding,
    buildMetricResult,
    computeDelta,
} from './_shared/metric-result.mjs';
import { analyzeStateDistribution } from './_shared/frontend-source-analysis.mjs';

export const VERSION = '1.0.0';

export async function run({ targetDir, baselineDir, config }) {
    const target = analyzeStateDistribution(targetDir, config ?? {});
    const baseline = baselineDir ? analyzeStateDistribution(baselineDir, config ?? {}) : null;
    const delta = computeDelta(target.contextRatio, baseline?.contextRatio, 6);
    const findings = appendBaselineDeltaFinding([
        `Context-provider ratio: ${target.contextProviders}/${target.localStateHooks + target.contextProviders} (${target.contextRatio})`,
    ], delta, {
        missingBaselineMessage: 'Baseline state distribution unavailable; delta_vs_baseline is set to null.',
    });

    return buildMetricResult({
        value: target.contextRatio,
        unit: 'ratio',
        direction: 'lower_is_better',
        delta,
        findings,
        rawArtifactPath: config?.raw_artifact_path,
        details: { target, baseline },
    });
}
