import { resolveMetricReports } from './_shared/report-io.mjs';
import {
    appendBaselineDeltaFinding,
    buildMetricResult,
    computeDelta,
} from './_shared/metric-result.mjs';

// Associated metric rule: BE-DOM-M-001-cross-module-deep-import-count.
// Counts dep-cruiser edges tagged by constraint rule BE-DOM-C-001-no-cross-module-deep-import.

export const VERSION = '1.0.0';

function extractModuleName(filePath, moduleRootPattern) {
    const matched = filePath.match(moduleRootPattern);
    return matched ? matched[1] : '<unknown>';
}

function evaluateReport(report, config = {}) {
    const sourceRuleId = config.source_rule_id ?? 'BE-DOM-C-001-no-cross-module-deep-import';
    const moduleRootPattern = new RegExp(config.module_root_pattern ?? '^src\\/modules?\\/([^/]+)\\/');

    const byFromModule = {};
    const byToModule = {};
    const edges = [];

    for (const moduleEntry of report.modules) {
        const fromFile = moduleEntry.source;
        const dependencies = Array.isArray(moduleEntry.dependencies) ? moduleEntry.dependencies : [];

        for (const dep of dependencies) {
            if (!dep?.resolved || !Array.isArray(dep.rules)) {
                continue;
            }

            const hasTargetRule = dep.rules.some((rule) => rule?.name === sourceRuleId);

            if (!hasTargetRule) {
                continue;
            }

            const fromModule = extractModuleName(fromFile, moduleRootPattern);
            const toModule = extractModuleName(dep.resolved, moduleRootPattern);

            byFromModule[fromModule] = (byFromModule[fromModule] ?? 0) + 1;
            byToModule[toModule] = (byToModule[toModule] ?? 0) + 1;

            edges.push({
                from: fromFile,
                to: dep.resolved,
                from_module: fromModule,
                to_module: toModule,
            });
        }
    }

    return {
        value: edges.length,
        sourceRuleId,
        byFromModule,
        byToModule,
        edges,
    };
}

export async function run({ targetDir, baselineDir, config }) {
    const { targetReport, baselineReport } = resolveMetricReports({
        targetDir,
        baselineDir,
        config,
        baselineOptional: true,
    });
    const target = evaluateReport(targetReport, config ?? {});
    const baseline = baselineReport ? evaluateReport(baselineReport, config ?? {}) : null;
    const delta = computeDelta(target.value, baseline?.value);

    const findings = appendBaselineDeltaFinding([
        `Cross-module deep import count: ${target.value}`,
        `Source rule: ${target.sourceRuleId}`,
    ], delta);

    return buildMetricResult({
        value: target.value,
        unit: 'count',
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
