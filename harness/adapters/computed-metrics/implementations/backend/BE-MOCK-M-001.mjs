import {
    appendBaselineDeltaFinding,
    buildMetricResult,
    computeDelta,
} from '../_shared/metric-result.mjs';
import { analyzeMockUsage } from './backend-source-analysis.mjs';

export const VERSION = '1.0.0';

export async function run({ targetDir, baselineDir, config }) {
    const target = analyzeMockUsage(targetDir, config ?? {});
    const baseline = baselineDir ? analyzeMockUsage(baselineDir, config ?? {}) : null;

    if (target.ratio === null) {
        return {
            score: null,
            delta_vs_baseline: null,
            findings: ['No test cases found; mock-per-test-case metric is not applicable.'],
            raw_artifact_path: config?.raw_artifact_path,
            details: {
                target,
                baseline,
            },
        };
    }

    const delta = computeDelta(target.ratio, baseline?.ratio, 6);
    const findings = appendBaselineDeltaFinding([
        `Mocks per test case: ${target.mocks}/${target.testCases} (${target.ratio})`,
    ], delta, {
        missingBaselineMessage: 'Baseline mock-per-test-case ratio unavailable; delta_vs_baseline is set to null.',
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
