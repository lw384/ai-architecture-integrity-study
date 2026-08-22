import { resolveMetricReports } from './report-io.mjs';
import {
    appendBaselineDeltaFinding,
    buildMetricResult,
    computeDelta,
} from '../_shared/metric-result.mjs';
import { FORBIDDEN_LAYER_PAIRS } from '../../../backend-static/rules/dependencies.mjs';

// Associated metric rule: BE-DEP-M-001-dependency-violation-density.
// Aggregates dependency drift signals aligned with BE-DEP-C-001 (layering) and
// BE-DEP-C-004 (circular dependencies).

export const VERSION = '1.0.0';

// Mirrors BE-DEP-C-001's own layer detection (adapters/backend-static/rules/shared.mjs::layerOf),
// including the entity layer, which the previous controller/service/repository-only detector missed.
function detectLayer(filePath) {
    const match = filePath.match(/\.(controller|service|repository|entity)\.[cm]?[jt]sx?$/);
    return match?.[1] ?? null;
}

// BE-DEP-C-001 only governs imports within the same business module. Mirrors
// adapters/backend-static/rules/shared.mjs::moduleParts()'s module-boundary pattern exactly.
function moduleOwner(filePath) {
    const match = filePath.match(/^src\/modules\/([^/]+)\//);
    return match ? match[1] : null;
}

function isLayeringViolation(sourceFile, targetFile, forbiddenPairs) {
    const sourceLayer = detectLayer(sourceFile);
    const targetLayer = detectLayer(targetFile);

    if (!sourceLayer || !targetLayer) {
        return false;
    }

    if (moduleOwner(sourceFile) !== moduleOwner(targetFile)) {
        return false;
    }

    return forbiddenPairs.has(`${sourceLayer}:${targetLayer}`);
}

function collectEdges(report) {
    const edges = [];

    for (const moduleEntry of report.modules) {
        const source = moduleEntry.source;
        const dependencies = Array.isArray(moduleEntry.dependencies) ? moduleEntry.dependencies : [];

        for (const dep of dependencies) {
            if (!dep || !dep.resolved) {
                continue;
            }

            edges.push({ source, target: dep.resolved });
        }
    }

    return edges;
}

function makeAdjacency(edges) {
    const nodes = new Set();
    const adjacency = new Map();

    for (const edge of edges) {
        nodes.add(edge.source);
        nodes.add(edge.target);

        if (!adjacency.has(edge.source)) {
            adjacency.set(edge.source, new Set());
        }

        adjacency.get(edge.source).add(edge.target);
    }

    for (const node of nodes) {
        if (!adjacency.has(node)) {
            adjacency.set(node, new Set());
        }
    }

    return adjacency;
}

function findSccs(adjacency) {
    const indexMap = new Map();
    const lowLinkMap = new Map();
    const onStack = new Set();
    const stack = [];
    const sccs = [];
    let index = 0;

    function strongConnect(node) {
        indexMap.set(node, index);
        lowLinkMap.set(node, index);
        index += 1;
        stack.push(node);
        onStack.add(node);

        for (const next of adjacency.get(node) ?? []) {
            if (!indexMap.has(next)) {
                strongConnect(next);
                lowLinkMap.set(node, Math.min(lowLinkMap.get(node), lowLinkMap.get(next)));
            } else if (onStack.has(next)) {
                lowLinkMap.set(node, Math.min(lowLinkMap.get(node), indexMap.get(next)));
            }
        }

        if (lowLinkMap.get(node) === indexMap.get(node)) {
            const component = [];

            while (stack.length > 0) {
                const n = stack.pop();
                onStack.delete(n);
                component.push(n);

                if (n === node) {
                    break;
                }
            }

            sccs.push(component);
        }
    }

    for (const node of adjacency.keys()) {
        if (!indexMap.has(node)) {
            strongConnect(node);
        }
    }

    return sccs;
}

function countCyclicEdges(edges) {
    if (edges.length === 0) {
        return 0;
    }

    const adjacency = makeAdjacency(edges);
    const sccs = findSccs(adjacency);
    // Track which cyclic component each node belongs to, rather than a flat set of "any
    // cyclic node" — otherwise a bridge edge between two unrelated cyclic clusters would be
    // miscounted as a cyclic edge even though it never participates in either cycle.
    const sccIndexByNode = new Map();

    sccs.forEach((scc, index) => {
        const hasCycle = scc.length > 1 || (adjacency.get(scc[0])?.has(scc[0]) ?? false);

        if (!hasCycle) {
            return;
        }

        for (const node of scc) {
            sccIndexByNode.set(node, index);
        }
    });

    return edges.filter((edge) =>
        sccIndexByNode.has(edge.source)
        && sccIndexByNode.get(edge.source) === sccIndexByNode.get(edge.target)
    ).length;
}

function evaluateReport(report) {
    const edges = collectEdges(report);
    const mvcViolations = edges.filter((edge) =>
        isLayeringViolation(edge.source, edge.target, FORBIDDEN_LAYER_PAIRS)
    ).length;
    const cyclicDependencyCount = countCyclicEdges(edges);
    const totalImportEdges = edges.length;
    const numerator = mvcViolations + cyclicDependencyCount;
    const value = totalImportEdges === 0 ? 0 : Number((numerator / totalImportEdges).toFixed(6));

    return {
        value,
        mvcViolations,
        cyclicDependencyCount,
        totalImportEdges,
    };
}

export async function run({ targetDir, baselineDir, constraintsLayer, config }) {
    const { targetReport, baselineReport } = resolveMetricReports({
        targetDir,
        baselineDir,
        config,
        baselineOptional: true,
        targetReportOverride: constraintsLayer?.adapterRawOutputs?.['dep-cruiser'],
    });
    const target = evaluateReport(targetReport);
    const baseline = baselineReport ? evaluateReport(baselineReport) : null;
    const delta = computeDelta(target.value, baseline?.value, 6);

    const findings = appendBaselineDeltaFinding([
        `MVC violations: ${target.mvcViolations}`,
        `Cyclic dependency count: ${target.cyclicDependencyCount}`,
        `Total import edges: ${target.totalImportEdges}`,
        `Dependency violation density: ${target.value}`,
    ], delta);

    return buildMetricResult({
        value: target.value,
        unit: 'ratio',
        direction: 'lower_is_better',
        delta,
        findings,
        rawArtifactPath: config?.raw_artifact_path,
        details: {
            target,
            baseline,
            formula: '(mvc_direction_violations + cyclic_dependency_count) / total_import_edges',
        },
    });
}
