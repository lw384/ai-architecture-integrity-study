import {
    appendBaselineDeltaFinding,
    buildMetricResult,
    computeDelta,
} from '../_shared/metric-result.mjs';
import { analyzeCyclomaticComplexity } from './backend-source-analysis.mjs';

// Associated metric rule: BE-SIZE-M-001-cyclomatic-complexity-ratio.
// Replaces the former parameter-count-based SIZE metric (McCabe 1976, V(G) = 1 + decision
// points) — see backend-source-analysis.mjs::analyzeMethodParameters() for the retired logic,
// still in the repo but no longer wired to any rule.

export const VERSION = '2.0.0';

export async function run({ targetDir, baselineDir, config }) {
    const target = analyzeCyclomaticComplexity(targetDir, config ?? {});
    const baseline = baselineDir ? analyzeCyclomaticComplexity(baselineDir, config ?? {}) : null;
    const delta = computeDelta(target.ratio, baseline?.ratio, 6);
    const findings = appendBaselineDeltaFinding([
        `Methods over complexity limit (${target.maxComplexity}): ${target.violatingMethods}/${target.totalMethods} (${target.ratio})`,
        `Average cyclomatic complexity: ${target.averageComplexity}`,
    ], delta, {
        missingBaselineMessage: 'Baseline cyclomatic complexity ratio unavailable; delta_vs_baseline is set to null.',
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
            formula: '1 + count(if/while/for/case/&&/||/ternary); ratio = methods over max_complexity / total methods',
        },
    });
}
