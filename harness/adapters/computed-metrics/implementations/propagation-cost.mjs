import { resolveMetricReports } from './_shared/report-io.mjs';
import {
    appendBaselineDeltaFinding,
    buildMetricResult,
    computeDelta,
} from './_shared/metric-result.mjs';

// Metric implementation key: propagation-cost.
// Rule linkage is provided by rule YAML files that set implementation: propagation-cost.

export const VERSION = '1.0.0';

function buildAdjacency(modules) {
    const adjacency = new Map();

    for (const moduleEntry of modules) {
        const source = moduleEntry.source;
        const resolvedDependencies = (moduleEntry.dependencies ?? [])
            .map((dependency) => dependency.resolved)
            .filter(Boolean);

        adjacency.set(source, resolvedDependencies);
    }

    return adjacency;
}

function countReachable(adjacency, startNode) {
    const visited = new Set();
    const queue = [...(adjacency.get(startNode) ?? [])];

    while (queue.length > 0) {
        const node = queue.shift();

        if (!node || visited.has(node) || node === startNode) {
            continue;
        }

        visited.add(node);
        queue.push(...(adjacency.get(node) ?? []));
    }

    return visited.size;
}

function calcPropagationCost(report) {
    const adjacency = buildAdjacency(report.modules ?? []);
    const moduleIds = [...adjacency.keys()];

    if (moduleIds.length <= 1) {
        return 0;
    }

    const reachablePairs = moduleIds.reduce(
        (sum, moduleId) => sum + countReachable(adjacency, moduleId),
        0,
    );

    return reachablePairs / (moduleIds.length * moduleIds.length);
}

export async function run({ targetDir, baselineDir, config }) {
    const { baselineReport, targetReport } = resolveMetricReports({
        targetDir,
        baselineDir,
        config,
    });
    const baselineValue = calcPropagationCost(baselineReport);
    const targetValue = calcPropagationCost(targetReport);
    const delta = computeDelta(targetValue, baselineValue, 6);
    const findings = appendBaselineDeltaFinding([], delta, {
        formatDelta: (value) => value.toFixed(4),
    });

    return buildMetricResult({
        value: targetValue,
        unit: 'ratio',
        direction: 'lower_is_better',
        delta,
        findings,
        rawArtifactPath: config.raw_artifact_path,
    });
}