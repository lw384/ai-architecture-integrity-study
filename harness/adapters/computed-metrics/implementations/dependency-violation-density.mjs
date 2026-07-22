import fs from 'node:fs';
import path from 'node:path';

export const VERSION = '1.0.0';

function readReport(rootDir, reportPath) {
    if (!rootDir) {
        return null;
    }

    const fullPath = path.join(rootDir, reportPath);

    if (!fs.existsSync(fullPath)) {
        return null;
    }

    const report = JSON.parse(fs.readFileSync(fullPath, 'utf8'));

    if (!report || !Array.isArray(report.modules)) {
        throw new Error(`Invalid dep-cruiser report at ${fullPath}: missing modules array.`);
    }

    return report;
}

function detectLayer(filePath) {
    if (filePath.endsWith('.controller.ts')) return 'controller';
    if (filePath.endsWith('.service.ts')) return 'service';
    if (filePath.endsWith('.repository.ts')) return 'repository';
    return null;
}

function isMcvDirectionViolation(sourceLayer, targetLayer, allowedTransitions) {
    if (!sourceLayer || !targetLayer) {
        return false;
    }

    const allowedTargets = allowedTransitions[sourceLayer] ?? [];
    return !allowedTargets.includes(targetLayer);
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
    const cyclicNodeSet = new Set();

    for (const scc of sccs) {
        if (scc.length > 1) {
            for (const node of scc) {
                cyclicNodeSet.add(node);
            }
        } else {
            const only = scc[0];
            const hasSelfLoop = adjacency.get(only)?.has(only) ?? false;
            if (hasSelfLoop) {
                cyclicNodeSet.add(only);
            }
        }
    }

    return edges.filter((edge) => cyclicNodeSet.has(edge.source) && cyclicNodeSet.has(edge.target)).length;
}

function evaluateReport(report, config = {}) {
    const allowedTransitions = config.allowed_transitions ?? {
        controller: ['service'],
        service: ['service', 'repository'],
        repository: ['repository'],
    };

    const edges = collectEdges(report);
    const mvcViolations = edges.filter((edge) => {
        const sourceLayer = detectLayer(edge.source);
        const targetLayer = detectLayer(edge.target);
        return isMcvDirectionViolation(sourceLayer, targetLayer, allowedTransitions);
    }).length;
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

export async function run({ targetDir, baselineDir, config }) {
    const reportPath = config?.report_path ?? 'reports/depcruise-raw.json';
    const targetReport = readReport(targetDir, reportPath);

    if (!targetReport) {
        throw new Error(`Target dep-cruiser report not found at ${path.join(targetDir, reportPath)}`);
    }

    const baselineReport = readReport(baselineDir, reportPath);
    const target = evaluateReport(targetReport, config ?? {});
    const baseline = baselineReport ? evaluateReport(baselineReport, config ?? {}) : null;
    const delta = baseline ? Number((target.value - baseline.value).toFixed(6)) : null;

    const findings = [
        `MVC violations: ${target.mvcViolations}`,
        `Cyclic dependency count: ${target.cyclicDependencyCount}`,
        `Total import edges: ${target.totalImportEdges}`,
        `Dependency violation density: ${target.value}`,
    ];

    if (delta === null) {
        findings.push('Baseline report unavailable; delta_vs_baseline set to null.');
    } else if (delta !== 0) {
        findings.push(`Delta vs baseline: ${delta > 0 ? '+' : ''}${delta}`);
    }

    return {
        score: {
            value: target.value,
            unit: 'ratio',
            direction: 'lower_is_better',
        },
        delta_vs_baseline: delta,
        findings,
        raw_artifact_path: config?.raw_artifact_path,
        details: {
            target,
            baseline,
            formula: '(mvc_direction_violations + cyclic_dependency_count) / total_import_edges',
        },
    };
}
