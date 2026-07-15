import { resolveMetricReports } from './_shared/report-io.mjs';

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
    const delta = targetValue - baselineValue;
    const findings = [];

    if (delta > 0) {
        findings.push(`Propagation cost increased by ${delta.toFixed(4)} from baseline.`);
    }

    return {
        score: {
            value: targetValue,
            unit: 'ratio',
            direction: 'lower_is_better',
        },
        delta_vs_baseline: delta,
        findings,
        raw_artifact_path: config.raw_artifact_path,
    };
}