// harness/core/layers/constraints_runner.mjs
// Input: target workspace path, rulepack directory, enabled constraint selection,
// and an optional adapter registry built by the orchestrator.
// Output: one normalized constraints layer result with findings, findings_by_rule,
// adapter_meta, and a final layer status.
import fs from 'node:fs';
import path from 'node:path';
import { load } from 'js-yaml';

// Fill rule message placeholders from normalized adapter event payloads.
function fillMsg(template, payload = {}) {
    if (!template) {
        return 'Architecture violation detected.';
    }

    return template.replace(/\{([^}]+)\}/g, (_, key) => payload[key] ?? `{${key}}`).trim();
}

// Read the rulepack manifest needed to select constraint rules and adapters.
function readManifest(rulepackDir) {
    const manifestPath = path.join(rulepackDir, 'manifest.yaml');

    if (!fs.existsSync(manifestPath)) {
        throw new Error(`[Harness Error] Rulepack manifest not found at ${manifestPath}`);
    }

    return load(fs.readFileSync(manifestPath, 'utf8'));
}

// Select only manifest rule files explicitly enabled for this scope.
function pickRulePaths(manifest, taskConfig) {
    const allPaths = manifest.rules?.constraints ?? [];
    const enabled = taskConfig.enabled?.constraints ?? [];

    if (!enabled.length) {
        return [];
    }

    return allPaths.filter((rulePath) => {
        const name = path.basename(rulePath, '.yaml');
        return enabled.some((ruleId) => name === ruleId || name.startsWith(`${ruleId}-`));
    });
}

// Load selected YAML rule declarations while tolerating missing optional files.
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

// Run only adapters referenced by the selected rules.
function pickAdapters(adapters = {}, rules = []) {
    const required = new Set(
        rules.flatMap((rule) => (rule.evidence_sources ?? []).map((source) => source.adapter)),
    );
    return Object.entries(adapters).filter(([adapterId, adapter]) =>
        required.has(adapterId) && adapter.emits?.includes('constraints')
    );
}

/**
 * Execute constraint adapters independently and merge their normalized events.
 * Adapter failures are captured in metadata so one tool cannot discard results
 * already produced by other adapters in the same scope.
 */
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

// Match normalized events against one rule's declared evidence sources.
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

// Convert matched adapter events into stable architecture findings.
function makeFindings(rule, events) {
    return events.map((event) => ({
        rule_id: rule.rule_id,
        rule_version: rule.version ?? null,
        tier: null,
        location: event.location ?? null,
        message: fillMsg(rule.agent_facing_message, event.payload),
        evidence: {
            source_tool: event.source_tool,
            source_rule_id: event.source_rule_id,
            payload: event.payload,
        },
    }));
}

// Report adapter reliability; findings alone represent constraint violations.
function sumResult(rules, findings, findingsByRule, meta) {
    const hasError = Object.values(meta).some((entry) => entry?.status === 'error');

    return {
        layer: 'constraints',
        status: hasError ? 'error' : 'ok',
        rules_evaluated: rules.length,
        findings,
        findings_by_rule: findingsByRule,
        background_findings: [],
        background_by_rule: {},
        adapter_meta: meta,
    };
}

/**
 * Run the complete constraint layer for one scope.
 * An empty enabled list disables the layer; otherwise adapters emit evidence
 * that selected rule declarations translate into normalized findings.
 */
export async function runConstraints({ targetDir, rulepackDir, taskConfig, adapterRegistry, runtimeContext = {} }) {
    const manifest = readManifest(rulepackDir);
    const rulePaths = pickRulePaths(manifest, taskConfig);
    const rules = loadRules(rulepackDir, rulePaths);

    if (rules.length === 0) {
        return sumResult([], [], {}, {});
    }

    const adapters = pickAdapters(manifest.adapters, rules);
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
