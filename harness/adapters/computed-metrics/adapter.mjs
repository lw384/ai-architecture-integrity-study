import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function readConfig(configPath) {
    if (!configPath || !fs.existsSync(configPath)) {
        return {};
    }

    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

function pickRuleConfig(config, rule) {
    return config.metrics?.[rule.rule_id] ?? {};
}

function resolveImplementationModule(rule, adapterConfig = {}) {
    const implementationId = rule.implementation;

    if (!implementationId) {
        throw new Error(`Metric rule ${rule.rule_id} is missing implementation.`);
    }

    const implementationsRoot = path.resolve(
        path.dirname(new URL(import.meta.url).pathname),
        adapterConfig.implementations_root ?? 'implementations',
    );

    if (implementationId.includes('/')) {
        return path.resolve(implementationsRoot, implementationId);
    }

    return path.join(implementationsRoot, `${implementationId}.mjs`);
}

async function loadImplementation(rule, adapterConfig) {
    const modulePath = resolveImplementationModule(rule, adapterConfig);

    if (!fs.existsSync(modulePath)) {
        throw new Error(`Metric implementation not found at ${modulePath}`);
    }

    const moduleUrl = pathToFileURL(modulePath).href;
    const mod = await import(moduleUrl);
    const run = mod.run;

    if (typeof run !== 'function') {
        throw new Error(`Metric implementation ${modulePath} does not export run.`);
    }

    return {
        run,
        version: mod.VERSION ?? rule.version ?? '0.1.0',
        modulePath,
    };
}

function normalizeMetricResult(result = {}) {
    if (result.score || result.delta_vs_baseline !== undefined) {
        return {
            score: result.score ?? null,
            delta_vs_baseline: result.delta_vs_baseline ?? null,
            findings: result.findings ?? [],
            raw_artifact_path: result.raw_artifact_path,
        };
    }

    return {
        score: result.value === undefined
            ? null
            : {
                value: result.value,
                unit: result.unit ?? 'count',
                direction: result.direction ?? 'lower_is_better',
            },
        delta_vs_baseline: result.delta ?? null,
        findings: result.findings ?? [],
        raw_artifact_path: result.raw_artifact_path,
    };
}

export async function runAdapter({
    targetDir,
    baselineDir,
    constraintsLayer,
    rule,
    adapterConfig,
    toolVersion,
}) {
    const startedAt = Date.now();
    const config = readConfig(adapterConfig?.configPath);
    const ruleConfig = pickRuleConfig(config, rule);
    const { run, version, modulePath } = await loadImplementation(rule, adapterConfig ?? {});
    const result = await run({
        targetDir,
        baselineDir,
        constraintsLayer,
        rule,
        config: ruleConfig,
    });

    return {
        metric_result: normalizeMetricResult(result),
        execution_meta: {
            status: 'ok',
            duration_ms: Date.now() - startedAt,
            implementation: rule.implementation,
            implementation_version: version,
            module_path: modulePath,
            config_path: adapterConfig?.configPath ?? null,
            rule_config: ruleConfig,
            tool_version: toolVersion,
        },
    };
}