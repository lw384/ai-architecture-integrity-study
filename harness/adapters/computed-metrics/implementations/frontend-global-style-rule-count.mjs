import {
    appendBaselineDeltaFinding,
    buildMetricResult,
    computeDelta,
} from './_shared/metric-result.mjs';
import { analyzeGlobalStyleRuleCount } from './_shared/frontend-source-analysis.mjs';

export const VERSION = '1.0.0';

export async function run({ targetDir, baselineDir, config }) {
    const target = analyzeGlobalStyleRuleCount(targetDir, config ?? {});
    const baseline = baselineDir ? analyzeGlobalStyleRuleCount(baselineDir, config ?? {}) : null;
    const delta = computeDelta(target.totalRules, baseline?.totalRules, 2);
    const findings = appendBaselineDeltaFinding([
        `Global style rule count: ${target.totalRules}`,
    ], delta, {
        missingBaselineMessage: 'Baseline global style rule count unavailable; delta_vs_baseline is set to null.',
    });

    return buildMetricResult({
        value: target.totalRules,
        unit: 'count',
        direction: 'lower_is_better',
        delta,
        findings,
        rawArtifactPath: config?.raw_artifact_path,
        details: { target, baseline },
    });
}
