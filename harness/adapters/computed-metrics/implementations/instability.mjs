import { resolveMetricReports } from './_shared/report-io.mjs';

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
    const delta = targetValue - baselineValue;
    const findings = [];

    if (delta > 0) {
        findings.push(`Instability increased by ${delta.toFixed(4)} from baseline.`);
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