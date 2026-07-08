// rulepacks/js-ts-react/rules/metrics/dependency-graph.mjs
export async function run(baseline, target) {
    const getEdges = (modules) => new Set(
        modules.flatMap(m => m.dependencies.map(d => `${m.source}->${d.resolved}`))
    );

    const bEdges = getEdges(baseline.modules);
    const tEdges = getEdges(target.modules);

    const added = [...tEdges].filter(e => !bEdges.has(e));
    const removed = [...bEdges].filter(e => !tEdges.has(e));

    return {
        value: tEdges.size,
        delta: added.length - removed.length, // 净增长
        added_count: added.length,
        removed_count: removed.length
    };
}