import {
    appendBaselineDeltaFinding,
    buildMetricResult,
    computeDelta,
} from '../_shared/metric-result.mjs';
import { analyzeRoutes } from './backend-source-analysis.mjs';

export const VERSION = '1.0.0';

export async function run({ targetDir, baselineDir, config }) {
    const target = analyzeRoutes(targetDir, config ?? {});
    const baseline = baselineDir ? analyzeRoutes(baselineDir, config ?? {}) : null;
    const delta = computeDelta(target.ratio, baseline?.ratio, 6);
    const findings = appendBaselineDeltaFinding([
        `Route prefix/path violations: ${target.violatingEndpoints}/${target.totalEndpoints} (${target.ratio})`,
        target.hasGlobalPrefix
            ? `Global prefix "${target.requiredPrefix}" detected.`
            : `Global prefix "${target.requiredPrefix}" is missing.`,
    ], delta, {
        missingBaselineMessage: 'Baseline route violation ratio unavailable; delta_vs_baseline is set to null.',
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
