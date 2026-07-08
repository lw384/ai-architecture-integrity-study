// harness/core/layers/constraints_runner.mjs
import fs from 'node:fs';
import path from 'node:path';
import { load } from 'js-yaml';

/**
 * 模板字符串替换：生成面向 Agent 的反馈信息
 */
function templateMessage(template, payload) {
    if (!template) return 'Architecture violation detected.';
    let msg = template;
    if (payload.from_module) msg = msg.replace('{from_module}', payload.from_module);
    if (payload.to_module) msg = msg.replace('{to_module}', payload.to_module);
    return msg.trim();
}

export async function runConstraints({ targetDir, rulepackDir, taskConfig }) {
    const manifestPath = path.join(rulepackDir, 'manifest.yaml');
    if (!fs.existsSync(manifestPath)) {
        throw new Error(`[Harness Error] Rulepack manifest not found at ${manifestPath}`);
    }

    const manifest = load(fs.readFileSync(manifestPath, 'utf8'));
    const activeRules = [];
    const ruleDeclarations = {};

    // 1. 加载所有层级的规则
    const loadRules = (rulePaths, tier) => {
        for (const relativePath of (rulePaths || [])) {
            const fullPath = path.join(rulepackDir, relativePath);
            if (fs.existsSync(fullPath)) {
                const ruleDef = load(fs.readFileSync(fullPath, 'utf8'));
                ruleDef._tier = tier;
                activeRules.push(ruleDef);
                ruleDeclarations[ruleDef.rule_id] = ruleDef;
            } else {
                console.warn(`[Harness Warning] Rule declaration missing at ${fullPath}`);
            }
        }
    };

    loadRules(manifest.rules?.constraints?.tier_1, 1);
    loadRules(manifest.rules?.constraints?.tier_2, 2);
    loadRules(manifest.rules?.background?.tier_3, 3);

    // 2. 动态并行执行所有适配器
    const all_events = [];
    const adapter_meta = {};

    for (const [toolName, adapterManifest] of Object.entries(manifest.adapters || {})) {
        try {
            const adapterPath = path.resolve(rulepackDir, adapterManifest.entry_point);
            const module = await import(adapterPath);

            if (typeof module.runAdapter !== 'function') {
                throw new Error(`[Harness Error] Adapter at ${adapterPath} does not export runAdapter function.`);
            }

            const { normalized_events, execution_meta } = await module.runAdapter({
                targetDir,
                adapterConfig: {
                    configPath: path.join(rulepackDir, adapterManifest.config),
                    ...adapterManifest
                },
                toolVersion: adapterManifest.version || 'unknown',
                tierMapping: adapterManifest.tier_mapping
            });

            all_events.push(...(normalized_events || []));
            adapter_meta[toolName] = execution_meta;
        } catch (err) {
            console.error(`[Harness Error] Adapter ${toolName} failed: ${err.message}`);
            adapter_meta[toolName] = { status: 'error', error: err.message };
        }
    }

    // 3. 证据分流与 Findings 组装
    const findings = [];
    const findings_by_rule = {};
    const background_findings = [];
    const background_by_rule = {};

    for (const event of all_events) {
        if (event.tier === 3) {
            background_findings.push(event);
            if (!background_by_rule[event.source_rule_id]) background_by_rule[event.source_rule_id] = [];
            background_by_rule[event.source_rule_id].push(event);
            continue;
        }

        for (const rule of activeRules) {
            for (const source of (rule.evidence_sources || [])) {
                if (source.adapter === event.source_tool && source.tool_rule_ids.includes(event.source_rule_id)) {
                    const finding = {
                        rule_id: rule.rule_id,
                        rule_version: rule.version,
                        tier: rule._tier,
                        severity: rule.severity,
                        location: event.location,
                        message: templateMessage(rule.agent_facing_message, event.payload),
                        evidence: {
                            source_tool: event.source_tool,
                            source_rule_id: event.source_rule_id,
                            payload: event.payload
                        }
                    };
                    findings.push(finding);
                    if (!findings_by_rule[rule.rule_id]) findings_by_rule[rule.rule_id] = [];
                    findings_by_rule[rule.rule_id].push(finding);
                }
            }
        }
    }

    return {
        layer: 'constraints',
        status: findings.length > 0 ? 'fail' : 'ok',
        rules_evaluated: activeRules.length,
        findings,
        findings_by_rule,
        background_findings,
        background_by_rule,
        adapter_meta
    };
}