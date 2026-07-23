import { resolveMetricReports } from './_shared/report-io.mjs';
import {
    appendBaselineDeltaFinding,
    buildMetricResult,
    computeDelta,
} from './_shared/metric-result.mjs';

// Metric implementation key: instability.
// Rule linkage is provided by rule YAML files that set implementation: instability.

export const VERSION = '1.0.0';

function collectModuleIds(modules = []) {
    return new Set(modules.map((moduleEntry) => moduleEntry.source));
}

function calcInstability(report) {
    const modules = report.modules ?? [];
    const ids = collectModuleIds(modules);
    const incoming = new Map();
    const outgoing = new Map();

    for (const moduleId of ids) {
        incoming.set(moduleId, 0);
        outgoing.set(moduleId, 0);
    }

    for (const moduleEntry of modules) {
        const source = moduleEntry.source;
        const deps = (moduleEntry.dependencies ?? [])
            .map((dependency) => dependency.resolved)
            .filter((resolved) => ids.has(resolved));

        outgoing.set(source, deps.length);

        for (const dep of deps) {
            incoming.set(dep, (incoming.get(dep) ?? 0) + 1);
        }
    }

    if (modules.length === 0) {
        return 0;
    }

    const total = modules.reduce((sum, moduleEntry) => {
        const moduleId = moduleEntry.source;
        const afferent = incoming.get(moduleId) ?? 0;
        const efferent = outgoing.get(moduleId) ?? 0;
        const denom = afferent + efferent;

        if (denom === 0) {
            return sum;
        }

        return sum + (efferent / denom);
    }, 0);

    return total / modules.length;
}

export async function run({ targetDir, baselineDir, config }) {
    const { baselineReport, targetReport } = resolveMetricReports({
        targetDir,
        baselineDir,
        config,
    });
    const baselineValue = calcInstability(baselineReport);
    const targetValue = calcInstability(targetReport);
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