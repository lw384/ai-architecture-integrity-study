// Convert shared backend analysis results into the harness event contract.
import fs from 'node:fs';
import { buildProject } from './project.mjs';
import { analyzeBackendRules } from './rules/index.mjs';

function readConfig(configPath) {
    if (!configPath || !fs.existsSync(configPath)) {
        return {};
    }

    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

export async function runAdapter({ targetDir, adapterConfig = {}, toolVersion = 'unknown' }) {
    const startedAt = Date.now();
    const config = readConfig(adapterConfig.configPath);
    const project = buildProject(targetDir);
    const violations = analyzeBackendRules(project, config);
    const normalized_events = violations.map((item) => ({
        event_type: 'backend_architecture_violation',
        source_tool: 'backend-static',
        source_tool_version: toolVersion,
        source_rule_id: item.ruleId,
        location: item.location,
        payload: item.payload,
    }));

    return {
        normalized_events,
        execution_meta: {
            status: project.parseErrors.length > 0 ? 'error' : 'ok',
            duration_ms: Date.now() - startedAt,
            files_scanned: project.files.length,
            parse_errors: project.parseErrors,
        },
    };
}
