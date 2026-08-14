// harness/core/layers/constraints_runner.mjs
// Input: target workspace path, rulepack directory, enabled constraint selection,
// and an optional adapter registry built by the orchestrator.
// Output: one normalized constraints layer result with findings, findings_by_rule,
// adapter_meta, and a final layer status.
import fs from 'node:fs';
import path from 'node:path';
import { load } from 'js-yaml';

function fillMsg(template, payload = {}) {
    if (!template) {
        return 'Architecture violation detected.';
    }

    return template.replace(/\{([^}]+)\}/g, (_, key) => payload[key] ?? `{${key}}`).trim();
}

function readManifest(rulepackDir) {
    const manifestPath = path.join(rulepackDir, 'manifest.yaml');

    if (!fs.existsSync(manifestPath)) {
        throw new Error(`[Harness Error] Rulepack manifest not found at ${manifestPath}`);
    }

    return load(fs.readFileSync(manifestPath, 'utf8'));
}

function pickRulePaths(manifest, taskConfig) {
    const allPaths = manifest.rules?.constraints ?? [];
    const enabled = taskConfig.enabled?.constraints ?? [];

    if (!enabled.length) {
        return allPaths;
    }

    return allPaths.filter((rulePath) => {
        const name = path.basename(rulePath, '.yaml');
        return enabled.some((ruleId) => name === ruleId || name.startsWith(`${ruleId}-`));
    });
}

function loadRules(rulepackDir, rulePaths) {
    return rulePaths.flatMap((rulePath) => {
        const fullPath = path.resolve(rulepackDir, rulePath);

        if (!fs.existsSync(fullPath)) {
            console.warn(`[Harness Warning] Rule declaration missing at ${fullPath}`);
            return [];
        }

        return [{ ...load(fs.readFileSync(fullPath, 'utf8')), rule_path: rulePath }];
    });
}

function pickAdapters(adapters = {}) {
    return Object.entries(adapters).filter(([, adapter]) => adapter.emits?.includes('constraints'));
}

async function runAdapters({ targetDir, rulepackDir, adapters, adapterRegistry, runtimeContext }) {
    const events = [];
    const meta = {};

    for (const [adapterId, adapter] of adapters) {
        try {
            const reg = adapterRegistry?.get(adapterId);
            let run = reg?.run;
            let configPath = reg?.configPath;

            if (!run) {
                const modulePath = adapter.source.includes('/')
                    ? path.resolve(rulepackDir, adapter.source)
                    : path.resolve(rulepackDir, '..', '..', 'adapters', adapter.source || adapterId, 'adapter.mjs');
                const mod = await import(modulePath);
                run = mod.runAdapter || mod.run;
                configPath = path.resolve(rulepackDir, adapter.config);
            }

            if (typeof run !== 'function') {
                throw new Error(`Adapter ${adapterId} does not export runAdapter or run.`);
            }

            const result = await run({
                targetDir,
                runtimeContext,
                adapterConfig: {
                    configPath,
                    ...(adapter.options ?? {}),
                },
                toolVersion: adapter.version ?? 'unknown',
            });

            events.push(...(result.normalized_events ?? []));
            meta[adapterId] = result.execution_meta ?? { status: 'ok' };
        } catch (error) {
            console.error(`[Harness Error] Adapter ${adapterId} failed: ${error.message}`);
            meta[adapterId] = { status: 'error', error: error.message };
        }
    }

    return { events, meta };
}

function hitRule(rule, events) {
    return (rule.evidence_sources ?? []).flatMap((source) =>
        events.filter((event) => {
            const sameAdapter = source.adapter === event.source_tool;
            const sameRule = (source.tool_rule_ids ?? []).includes(event.source_rule_id);
            const sameType = !source.match_condition?.event_type
                || source.match_condition.event_type === event.event_type;

            return sameAdapter && sameRule && sameType;
        }),
    );
}

function makeFindings(rule, events) {
    return events.map((event) => ({
        rule_id: rule.rule_id,
        rule_version: rule.version ?? null,
        tier: null,
        severity: rule.severity ?? null,
        location: event.location ?? null,
        message: fillMsg(rule.agent_facing_message, event.payload),
        evidence: {
            source_tool: event.source_tool,
            source_rule_id: event.source_rule_id,
            payload: event.payload,
        },
    }));
}

function sumResult(rules, findings, findingsByRule, meta) {
    const hasError = Object.values(meta).some((entry) => entry?.status === 'error');

    return {
        layer: 'constraints',
        status: hasError ? 'error' : findings.length > 0 ? 'fail' : 'ok',
        rules_evaluated: rules.length,
        findings,
        findings_by_rule: findingsByRule,
        background_findings: [],
        background_by_rule: {},
        adapter_meta: meta,
    };
}

export async function runConstraints({ targetDir, rulepackDir, taskConfig, adapterRegistry, runtimeContext = {} }) {
    const manifest = readManifest(rulepackDir);
    const rulePaths = pickRulePaths(manifest, taskConfig);
    const rules = loadRules(rulepackDir, rulePaths);
    const adapters = pickAdapters(manifest.adapters);
    const { events, meta } = await runAdapters({
        targetDir,
        rulepackDir,
        adapters,
        adapterRegistry,
        runtimeContext,
    });
    const findings = [];
    const findingsByRule = {};

    for (const rule of rules) {
        const hits = hitRule(rule, events);
        const ruleFindings = makeFindings(rule, hits);

        findings.push(...ruleFindings);
        findingsByRule[rule.rule_id] = ruleFindings;
    }

    return sumResult(rules, findings, findingsByRule, meta);
}
