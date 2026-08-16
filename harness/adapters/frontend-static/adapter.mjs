// Convert shared frontend inventory findings into the harness event contract.
import fs from 'node:fs';
import { buildFrontendInventory } from './inventory.mjs';
import { analyzeFrontendRules } from './rules.mjs';

function readConfig(configPath) {
    if (!configPath || !fs.existsSync(configPath)) return {};
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

export async function runAdapter({ targetDir, adapterConfig = {}, toolVersion = 'unknown' }) {
    const startedAt = Date.now();
    const config = readConfig(adapterConfig.configPath);
    const inventory = buildFrontendInventory(targetDir, config);
    const violations = analyzeFrontendRules(inventory, config);

    return {
        normalized_events: violations.map((item) => ({
            event_type: 'frontend_architecture_violation',
            source_tool: 'frontend-static',
            source_tool_version: toolVersion,
            source_rule_id: item.ruleId,
            location: item.location,
            payload: item.payload,
        })),
        execution_meta: {
            status: inventory.parseErrors.length > 0 ? 'error' : 'ok',
            duration_ms: Date.now() - startedAt,
            files_scanned: inventory.files.length,
            parse_errors: inventory.parseErrors,
        },
    };
}
