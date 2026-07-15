import { resolveMetricReports } from './_shared/report-io.mjs';

export const VERSION = '1.0.0';

function getEdges(modules) {
    return new Set(
        modules.flatMap((moduleEntry) =>
            (moduleEntry.dependencies ?? [])
                .map((dependency) => dependency.resolved)
                .filter(Boolean)
                .map((resolvedPath) => `${moduleEntry.source}->${resolvedPath}`),
        ),
    );
}

export async function run({ targetDir, baselineDir, config }) {
    const { baselineReport, targetReport } = resolveMetricReports({
        targetDir,
        baselineDir,
        config,
    });
    const baselineEdges = getEdges(baselineReport.modules);
    const targetEdges = getEdges(targetReport.modules);
    const added = [...targetEdges].filter((edge) => !baselineEdges.has(edge));
    const removed = [...baselineEdges].filter((edge) => !targetEdges.has(edge));
    const delta = targetEdges.size - baselineEdges.size;
    const findings = [];

    if (added.length > 0 || removed.length > 0) {
        findings.push(`Dependency graph changed: ${added.length} edges added, ${removed.length} edges removed.`);
    }

    return {
        score: {
            value: targetEdges.size,
            unit: 'edges',
            direction: 'lower_is_better',
        },
        delta_vs_baseline: delta,
        findings,
        raw_artifact_path: config.raw_artifact_path,
    };
}