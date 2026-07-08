import { spawn } from 'node:child_process';
import path from 'node:path';

export async function runAdapter({ targetDir, adapterConfig, toolVersion }) {
    const configPath = path.resolve(adapterConfig.configPath);

    return new Promise((resolve) => {
        const child = spawn('npx', ['eslint', 'src', '--format', 'json', '--config', configPath], {
            cwd: targetDir
        });

        let stdout = '';
        child.stdout.on('data', (d) => stdout += d);

        child.on('close', () => {
            const results = JSON.parse(stdout || '[]');
            const normalized_events = [];

            results.forEach(file => {
                file.messages.forEach(msg => {
                    normalized_events.push({
                        event_type: 'file_structure_violation',
                        source_tool: 'eslint',
                        source_tool_version: toolVersion,
                        source_rule_id: msg.ruleId, // 例如: import/no-restricted-paths
                        tier: 2, // 归入 Tier 2
                        location: { file: file.filePath, line: msg.line },
                        payload: { message: msg.message }
                    });
                });
            });

            resolve({ normalized_events, execution_meta: { status: 'ok' } });
        });
    });
}