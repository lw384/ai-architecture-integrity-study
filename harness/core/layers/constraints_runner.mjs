import path from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * 执行 constraints 层面的评估
 * @param {Object} params
 * @param {string} params.targetDir - 待评估的 workspace 路径
 * @param {string} params.rulepackDir - rulepack 的物理路径
 * @param {Object} params.taskConfig - 任务配置 (包含 enabled.constraints)
 * @returns {Promise<Array>} 符合契约的 layer findings
 */
export async function runConstraints({ targetDir, rulepackDir, taskConfig }) {
    const enabledRules = taskConfig.enabled?.constraints || [];
    const results = [];

    for (const ruleName of enabledRules) {
        const ruleModulePath = path.resolve(rulepackDir, 'constraints', `${ruleName}.mjs`);

        // 默认的 fallback 结果结构
        const resultTemplate = {
            name: ruleName,
            version: 'unknown',
            status: 'error',
            findings: [],
            raw_artifact_path: `artifacts/constraints/${ruleName}.log`
        };

        try {
            // 动态导入规则模块 (使用 pathToFileURL 兼容 Windows 环境的绝对路径)
            const moduleUrl = pathToFileURL(ruleModulePath).href;
            const ruleModule = await import(moduleUrl);

            if (typeof ruleModule.run !== 'function') {
                throw new Error(`Rule module ${ruleName} does not export an async 'run' function.`);
            }

            // 获取规则模块自带的版本号，如果未提供则默认为 1.0.0
            resultTemplate.version = ruleModule.VERSION || '1.0.0';

            // 执行实际的验证逻辑
            const executionResult = await ruleModule.run({ targetDir });

            results.push({
                ...resultTemplate,
                status: executionResult.status,
                findings: executionResult.findings || [],
            });

        } catch (error) {
            // 错误隔离：捕获异常，记录状态为 error，但不阻断其他 rule 的运行
            results.push({
                ...resultTemplate,
                status: 'error',
                findings: [{
                    rule: ruleName,
                    severity: 'fatal',
                    message: `Runner crashed while executing rule: ${error.message}`
                }]
            });
        }
    }

    return results;
}