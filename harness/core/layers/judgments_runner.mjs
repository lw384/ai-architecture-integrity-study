// core/layers/judgments_runner.mjs
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * 执行 judgments 层面的评估 (LLM 裁判)
 */
export async function runJudgments({ targetDir, baselineDir, rulepackDir, taskConfig, llmClient }) {
    const enabledRules = taskConfig.enabled?.judgments || [];
    const judgmentConfig = taskConfig.judgment_config || { sampling_times: 1, temperature: 0.0, model: 'mock-model' };
    const results = [];

    for (const ruleName of enabledRules) {
        const ruleModulePath = path.resolve(rulepackDir, 'judgments', `${ruleName}.mjs`);

        const resultTemplate = {
            name: ruleName,
            version: 'unknown',
            status: 'error',
            score: null,
            kappa: null, // 样本间一致性系数
            findings: [],
            raw_artifact_path: `artifacts/judgments/${ruleName}.json`
        };

        try {
            const moduleUrl = pathToFileURL(ruleModulePath).href;
            const ruleModule = await import(moduleUrl);

            if (typeof ruleModule.run !== 'function') {
                throw new Error(`Rule module ${ruleName} does not export an async 'run' function.`);
            }

            resultTemplate.version = ruleModule.VERSION || '1.0.0';

            // 将 LLM 客户端、采样配置一并注入给规则模块
            const executionResult = await ruleModule.run({
                targetDir,
                baselineDir,
                llmClient,
                samples: judgmentConfig.sampling_times,
                model: judgmentConfig.model,
                temperature: judgmentConfig.temperature
            });

            results.push({
                ...resultTemplate,
                status: 'pass', // 只要 LLM 成功返回且没有抛出异常，执行状态即为 pass
                score: executionResult.score,
                kappa: executionResult.kappa,
                per_sample_results: executionResult.per_sample_results,
                findings: executionResult.findings || [],
                raw_artifact_path: executionResult.raw_artifact_path || resultTemplate.raw_artifact_path
            });

        } catch (error) {
            results.push({
                ...resultTemplate,
                status: 'error',
                findings: [`LLM Judgment Runner crashed: ${error.message}`]
            });
        }
    }

    return results;
}