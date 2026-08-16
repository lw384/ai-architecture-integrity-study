import {
    appendBaselineDeltaFinding,
    buildMetricResult,
    computeDelta,
} from '../_shared/metric-result.mjs';
import { analyzeContextUsageDepth } from './frontend-source-analysis.mjs';

export const VERSION = '1.0.0';

export async function run({ targetDir, baselineDir, config }) {
    const target = analyzeContextUsageDepth(targetDir, config ?? {});
    const baseline = baselineDir ? analyzeContextUsageDepth(baselineDir, config ?? {}) : null;
    const delta = computeDelta(target.consumerPerProviderRatio, baseline?.consumerPerProviderRatio, 2);
    const findings = appendBaselineDeltaFinding([
        `Context consumer-per-provider ratio: ${target.consumerPerProviderRatio}`,
    ], delta, {
        missingBaselineMessage: 'Baseline context-usage metric unavailable; delta_vs_baseline is set to null.',
    });

    return buildMetricResult({
        value: target.consumerPerProviderRatio,
        unit: 'ratio',
        direction: 'lower_is_better',
        delta,
        findings,
        rawArtifactPath: config?.raw_artifact_path,
        details: { target, baseline },
    });
}
