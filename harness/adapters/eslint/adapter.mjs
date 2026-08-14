// Input: a target project directory plus adapter config that describes
// which paths to lint, which config to load, and optional CLI overrides.
// Output: normalized lint events and execution metadata.
import { spawn } from 'node:child_process';
import path from 'node:path';

const eslintBin = new URL('../../node_modules/eslint/bin/eslint.js', import.meta.url);
const ARCH_RULE_ID_RE = /\b((?:BE|FE|CROSS)-[A-Z]+-[CMJ]-\d{3}(?:-[a-z0-9-]+)?)\b/;

function runTool(binPath, args, cwd, timeoutMs) {
    return new Promise((resolve) => {
        const child = spawn(process.execPath, [binPath, ...args], { cwd });
        let stdout = '';
        let stderr = '';
        let isTimeout = false;

        const timer = setTimeout(() => {
            isTimeout = true;
            child.kill();
        }, timeoutMs);

        child.stdout.on('data', (data) => (stdout += data.toString()));
        child.stderr.on('data', (data) => (stderr += data.toString()));

        child.on('close', (code) => {
            clearTimeout(timer);
            resolve({ code, stdout, stderr, isTimeout });
        });
    });
}

function pickCwd(targetDir, adapterConfig = {}) {
    return path.resolve(targetDir, adapterConfig.cwd || '.');
}

function pickTargets(adapterConfig = {}) {
    const targets = adapterConfig.targets ?? adapterConfig.paths ?? ['src'];
    return Array.isArray(targets) && targets.length > 0 ? targets : ['src'];
}

function pickExt(adapterConfig = {}) {
    const ext = adapterConfig.ext ?? ['.js', '.jsx', '.ts', '.tsx'];
    return Array.isArray(ext) && ext.length > 0 ? ext : ['.js', '.jsx', '.ts', '.tsx'];
}

function buildArgs(adapterConfig = {}) {
    const configPath = path.resolve(adapterConfig.configPath);
    const targets = pickTargets(adapterConfig);
    const ext = pickExt(adapterConfig);
    const extraArgs = Array.isArray(adapterConfig.args) ? adapterConfig.args : [];
    const noConfigLookup = adapterConfig.no_config_lookup ?? true;
    const args = [
        ...targets,
        '--format', 'json',
        '--ext', ext.join(','),
        '--config', configPath,
        ...extraArgs,
    ];

    if (noConfigLookup) {
        args.push('--no-config-lookup');
    }

    return args;
}

export async function runAdapter({ targetDir, adapterConfig, toolVersion }) {
    const timeout = adapterConfig.timeout_ms || 60000;
    const cwd = pickCwd(targetDir, adapterConfig);
    const args = buildArgs(adapterConfig);
    const result = await runTool(eslintBin.pathname, args, cwd, timeout);
    const execution_meta = {
        status: 'ok',
        exit_code: result.code,
        cwd,
        targets: pickTargets(adapterConfig),
    };

    if (result.isTimeout) {
        return {
            normalized_events: [],
            execution_meta: {
                ...execution_meta,
                status: 'error',
                exit_code: 'timeout',
                error: `eslint execution timed out after ${timeout}ms.`,
            },
        };
    }

    let results;

    try {
        results = JSON.parse(result.stdout || '[]');
    } catch (error) {
        return {
            normalized_events: [],
            execution_meta: {
                ...execution_meta,
                status: 'error',
                error: `Failed to parse eslint JSON output: ${error.message}`,
                stderr: result.stderr,
            },
        };
    }

    if (result.code !== 0 && result.code !== 1 && result.code !== null) {
        return {
            normalized_events: [],
            execution_meta: {
                ...execution_meta,
                status: 'error',
                stderr: result.stderr,
            },
        };
    }

    const normalized_events = [];

    results.forEach((file) => {
        file.messages.forEach((msg) => {
            const matchedRuleId = typeof msg.message === 'string'
                ? msg.message.match(ARCH_RULE_ID_RE)?.[1] ?? null
                : null;
            normalized_events.push({
                event_type: 'file_structure_violation',
                source_tool: 'eslint',
                source_tool_version: toolVersion,
                source_rule_id: matchedRuleId || msg.ruleId,
                location: { file: file.filePath, line: msg.line, column: msg.column ?? null },
                payload: {
                    message: msg.message,
                    severity: msg.severity,
                    eslint_rule_id: msg.ruleId,
                    architecture_rule_id: matchedRuleId,
                },
            });
        });
    });

    return { normalized_events, execution_meta };
}
