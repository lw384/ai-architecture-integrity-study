// harness/rulepacks/js-ts-react/adapters/dep-cruiser/adapter.mjs
import { spawn } from 'node:child_process';
import path from 'node:path';

/**
 * 将 Child Process 包装为 Promise，以便更好地处理超时和流式输出
 */
function runCommand(command, args, cwd, timeoutMs) {
    return new Promise((resolve) => {
        const child = spawn(command, args, { cwd, shell: true });
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

/**
 * 根据 manifest 传入的正则映射，判定当前 rule_id 属于哪个 Tier
 */
function determineTier(ruleId, tierMapping = []) {
    for (const mapping of tierMapping) {
        const regex = new RegExp(mapping.pattern);
        if (regex.test(ruleId)) {
            return mapping.tier;
        }
    }
    return 'unknown';
}

/**
 * 执行 dep-cruiser 并输出标准化事件 (Normalized Events)
 */
export async function runAdapter({ targetDir, adapterConfig, toolVersion, tierMapping = [] }) {
    const startTime = Date.now();
    const timeout = adapterConfig.timeout_ms || 60000;

    // 确保 configPath 是绝对路径
    const configPath = path.resolve(adapterConfig.configPath);

    // 构造执行参数
    const cmdArgs = [
        '-y', 'dependency-cruiser',
        'src',
        '--config', configPath,
        '--output-type', 'json'
    ];

    const result = await runCommand('npx', cmdArgs, targetDir, timeout);
    const duration_ms = Date.now() - startTime;

    const events_by_tier = { 1: 0, 2: 0, 3: 0, unknown: 0 };
    const execution_meta = { duration_ms, warnings: [], events_by_tier };
    const normalized_events = [];

    // 1. 处理异常退出状态
    if (result.isTimeout) {
        execution_meta.exit_code = 'timeout';
        execution_meta.warnings.push(`dep-cruiser execution timed out after ${timeout}ms.`);
        return { raw_output: null, normalized_events, execution_meta };
    }

    // CLI 报错但并未输出有效 JSON 时
    if (result.code !== 0 && !result.stdout.trim().startsWith('{')) {
        execution_meta.exit_code = result.code;
        execution_meta.warnings.push(`Command failed with code ${result.code}: ${result.stderr}`);
        return { raw_output: null, normalized_events, execution_meta };
    }

    // 2. 解析原始 JSON 输出
    let raw_output;
    try {
        raw_output = JSON.parse(result.stdout);
    } catch (err) {
        execution_meta.exit_code = 'parse_error';
        execution_meta.warnings.push(`Failed to parse dep-cruiser JSON output: ${err.message}`);
        return { raw_output: null, normalized_events, execution_meta };
    }

    execution_meta.exit_code = 0;

    // 3. 规范化并注入 Tier 信息
    const modules = raw_output.modules || [];
    for (const mod of modules) {
        for (const dep of (mod.dependencies || [])) {
            if (dep.rules && dep.rules.length > 0) {
                for (const rule of dep.rules) {
                    const ruleTier = determineTier(rule.name, tierMapping);

                    // 累加 Tier 统计
                    if (events_by_tier[ruleTier] !== undefined) {
                        events_by_tier[ruleTier]++;
                    } else {
                        events_by_tier.unknown++;
                    }

                    normalized_events.push({
                        event_type: 'dependency_edge_violation',
                        source_tool: 'dep-cruiser',
                        source_tool_version: toolVersion,
                        source_rule_id: rule.name,
                        tier: ruleTier, // 注入 Tier 字段
                        location: {
                            file: mod.source,
                            line: dep.line || null,
                            column: null
                        },
                        payload: {
                            from_module: mod.source,
                            to_module: dep.resolved,
                            dependency_type: dep.dependencyTypes ? dep.dependencyTypes.join(',') : 'unknown',
                            severity: rule.severity
                        }
                    });
                }
            }
        }
    }

    return { raw_output, normalized_events, execution_meta };
}