// core/layers/metrics_runner.mjs
// Input: target workspace path, baseline path, rulepack directory, and enabled metric selection.
// Output: a list of normalized metric results produced from manifest-declared metric rules.
import fs from 'node:fs';
import path from 'node:path';
import { load } from 'js-yaml';
import { pathToFileURL } from 'node:url';

function readManifest(rulepackDir) {
    const manifestPath = path.join(rulepackDir, 'manifest.yaml');

    if (!fs.existsSync(manifestPath)) {
        throw new Error(`[Harness Error] Rulepack manifest not found at ${manifestPath}`);
    }

    return load(fs.readFileSync(manifestPath, 'utf8'));
}

function pickMetricPaths(manifest, taskConfig) {
    const allPaths = manifest.rules?.metrics ?? [];
    const enabled = taskConfig.enabled?.metrics ?? [];

    if (!enabled.length) {
        return allPaths;
    }

    return allPaths.filter((rulePath) => {
        const name = path.basename(rulePath, '.yaml');
        return enabled.some((ruleId) => name === ruleId || name.startsWith(`${ruleId}-`));
    });
}

function loadMetricDefs(rulepackDir, rulePaths) {
    return rulePaths.flatMap((rulePath) => {
        const fullPath = path.resolve(rulepackDir, rulePath);

        if (!fs.existsSync(fullPath)) {
            console.warn(`[Harness Warning] Metric rule declaration missing at ${fullPath}`);
            return [];
        }

        return [{ ...load(fs.readFileSync(fullPath, 'utf8')), rule_path: rulePath }];
    });
}

function pickAdapters(adapters = {}) {
    return Object.entries(adapters).filter(([, adapter]) => adapter.emits?.includes('metrics'));
}

function pickAdapterForRule(ruleDef, adapters) {
    if (adapters.length === 0) {
        return null;
    }

    if (ruleDef.adapter) {
        return adapters.find(([adapterId]) => adapterId === ruleDef.adapter) ?? null;
    }

    if (adapters.length === 1) {
        return adapters[0];
    }

    throw new Error(
        `[Harness Error] Metric rule ${ruleDef.rule_id || ruleDef.rule_path} must declare adapter when multiple metric adapters exist.`,
    );
}

async function loadMetricRun(rulepackDir, ruleDef) {
    const baseName = path.basename(ruleDef.rule_path ?? `${ruleDef.rule_id}.yaml`, '.yaml');
    const relPath = ruleDef.runner || ruleDef.run || ruleDef.implementation || `rules/metrics/${baseName}.mjs`;
    const modulePath = path.resolve(rulepackDir, relPath);

    if (!fs.existsSync(modulePath)) {
        throw new Error(`Metric runner not found at ${modulePath}`);
    }

    const moduleUrl = pathToFileURL(modulePath).href;
    const mod = await import(moduleUrl);
    const run = mod.run;

    if (typeof run !== 'function') {
        throw new Error(`Metric runner ${modulePath} does not export run.`);
    }

    return { run, version: mod.VERSION || ruleDef.version || '1.0.0' };
}

async function runMetricAdapter({
    targetDir,
    baselineDir,
    rulepackDir,
    ruleDef,
    adapterEntry,
    adapterRegistry,
    constraintsLayer,
}) {
    const [adapterId, adapter] = adapterEntry;
    const reg = adapterRegistry?.get(adapterId);
    let run = reg?.run;
    let configPath = reg?.configPath;

    if (!run) {
        const modulePath = adapter.source.includes('/')
            ? path.resolve(rulepackDir, adapter.source)
            : path.resolve(rulepackDir, '..', '..', 'adapters', adapter.source || adapterId, 'adapter.mjs');
        const mod = await import(pathToFileURL(modulePath).href);
        run = mod.runAdapter || mod.run;
        configPath = path.resolve(rulepackDir, adapter.config);
    }

    if (typeof run !== 'function') {
        throw new Error(`Adapter ${adapterId} does not export runAdapter or run.`);
    }

    const result = await run({
        targetDir,
        baselineDir,
        constraintsLayer,
        rule: ruleDef,
        adapterConfig: {
            configPath,
            ...(adapter.options ?? {}),
        },
        toolVersion: adapter.version ?? 'unknown',
    });

    return {
        execResult: result.metric_result ?? result,
        version: result.execution_meta?.implementation_version ?? adapter.version ?? ruleDef.version ?? 'unknown',
    };
}

function readThreshold(ruleId, thresholds = {}) {
    return thresholds[ruleId] ?? {};
}

function judgeMetric(score, threshold, baseFindings = []) {
    const nextFindings = [...baseFindings];
    const value = typeof score?.value === 'number' ? score.value : null;
    const direction = score?.direction || 'lower_is_better';
    const warn = threshold.warn ?? threshold.warn_at;
    const fail = threshold.fail ?? threshold.fail_at;

    if (value === null) {
        return { status: 'pass', findings: nextFindings };
    }

    if (direction === 'higher_is_better') {
        if (fail !== undefined && value <= fail) {
            nextFindings.push(`Value ${value} dropped below FAIL threshold of ${fail}`);
            return { status: 'fail', findings: nextFindings };
        }

        if (warn !== undefined && value <= warn) {
            nextFindings.push(`Value ${value} dropped below WARN threshold of ${warn}`);
        }

        return { status: 'pass', findings: nextFindings };
    }

    if (fail !== undefined && value >= fail) {
        nextFindings.push(`Value ${value} exceeded FAIL threshold of ${fail}`);
        return { status: 'fail', findings: nextFindings };
    }

    if (warn !== undefined && value >= warn) {
        nextFindings.push(`Value ${value} exceeded WARN threshold of ${warn}`);
    }

    return { status: 'pass', findings: nextFindings };
}

function makeMetricResult(ruleDef, execResult, status, findings, version) {
    const score = execResult.score || null;
    const baseName = path.basename(ruleDef.rule_path ?? `${ruleDef.rule_id}.yaml`, '.yaml');

    return {
        name: ruleDef.rule_id || baseName,
        version,
        status,
        score,
        delta_vs_baseline: execResult.delta_vs_baseline ?? null,
        findings,
        raw_artifact_path: execResult.raw_artifact_path || `artifacts/metrics/${baseName}.json`,
    };
}

export async function runMetrics({
    targetDir,
    baselineDir,
    rulepackDir,
    taskConfig,
    adapterRegistry,
    constraintsLayer,
}) {
    const manifest = readManifest(rulepackDir);
    const rulePaths = pickMetricPaths(manifest, taskConfig);
    const defs = loadMetricDefs(rulepackDir, rulePaths);
    const thresholds = taskConfig.thresholds || {};
    const adapters = pickAdapters(manifest.adapters);
    const results = [];

    for (const ruleDef of defs) {
        try {
            const adapterEntry = pickAdapterForRule(ruleDef, adapters);
            const { execResult, version } = adapterEntry
                ? await runMetricAdapter({
                    targetDir,
                    baselineDir,
                    rulepackDir,
                    ruleDef,
                    adapterEntry,
                    adapterRegistry,
                    constraintsLayer,
                })
                : await (async () => {
                    const { run, version } = await loadMetricRun(rulepackDir, ruleDef);
                    const execResult = await run({
                        targetDir,
                        baselineDir,
                        constraintsLayer,
                        rule: ruleDef,
                    });

                    return { execResult, version };
                })();
            const threshold = readThreshold(ruleDef.rule_id, thresholds);
            const judged = judgeMetric(execResult.score, threshold, execResult.findings || []);

            results.push(makeMetricResult(ruleDef, execResult, judged.status, judged.findings, version));
        } catch (error) {
            results.push({
                name: ruleDef.rule_id || path.basename(ruleDef.rule_path ?? 'unknown', '.yaml'),
                version: ruleDef.version || 'unknown',
                status: 'error',
                score: null,
                delta_vs_baseline: null,
                findings: [`Runner crashed: ${error.message}`],
                raw_artifact_path: `artifacts/metrics/${path.basename(ruleDef.rule_path ?? 'unknown', '.yaml')}.json`,
            });
        }
    }

    return results;
}