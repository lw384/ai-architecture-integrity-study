// core/layers/metrics_runner.mjs
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * 执行 metrics 层面的评估 (v2)
 */
export async function runMetrics({ targetDir, baselineDir, rulepackDir, taskConfig }) {
    const enabledRules = taskConfig.enabled?.metrics || [];
    const thresholds = taskConfig.thresholds || {};
    const results = [];

    for (const ruleName of enabledRules) {
        const ruleModulePath = path.resolve(rulepackDir, 'metrics', `${ruleName}.mjs`);
        const ruleThresholds = thresholds[ruleName] || {};

        const resultTemplate = {
            name: ruleName,
            version: 'unknown',
            status: 'error',
            score: null,
            delta_vs_baseline: null,
            findings: [],
            raw_artifact_path: `artifacts/metrics/${ruleName}.json`
        };

        try {
            const moduleUrl = pathToFileURL(ruleModulePath).href;
            const ruleModule = await import(moduleUrl);

            if (typeof ruleModule.run !== 'function') {
                throw new Error(`Rule module ${ruleName} does not export an async 'run' function.`);
            }

            resultTemplate.version = ruleModule.VERSION || '1.0.0';

            // 【核心改动 1】向底层模块同时注入 targetDir 和 baselineDir
            const executionResult = await ruleModule.run({ targetDir, baselineDir });

            // 【核心改动 2】解析富结构的 score 对象和 delta
            const scoreObj = executionResult.score || { value: 0, unit: 'none', direction: 'lower_is_better' };
            const scoreValue = scoreObj.value;
            const delta = executionResult.delta_vs_baseline;

            let status = 'pass';
            let findings = executionResult.findings || [];

            // 【核心改动 3】根据 direction 动态判定阈值逻辑
            if (scoreObj.direction === 'lower_is_better') {
                if (ruleThresholds.fail !== undefined && scoreValue >= ruleThresholds.fail) {
                    status = 'fail';
                    findings.push(`Value ${scoreValue} exceeded FAIL threshold of ${ruleThresholds.fail}`);
                } else if (ruleThresholds.warn !== undefined && scoreValue >= ruleThresholds.warn) {
                    findings.push(`Value ${scoreValue} exceeded WARN threshold of ${ruleThresholds.warn}`);
                }
            } else if (scoreObj.direction === 'higher_is_better') {
                if (ruleThresholds.fail !== undefined && scoreValue <= ruleThresholds.fail) {
                    status = 'fail';
                    findings.push(`Value ${scoreValue} dropped below FAIL threshold of ${ruleThresholds.fail}`);
                } else if (ruleThresholds.warn !== undefined && scoreValue <= ruleThresholds.warn) {
                    findings.push(`Value ${scoreValue} dropped below WARN threshold of ${ruleThresholds.warn}`);
                }
            }

            results.push({
                ...resultTemplate,
                status: status,
                score: scoreObj, // 直接存储完整的富对象
                delta_vs_baseline: delta,
                findings: findings,
                raw_artifact_path: executionResult.raw_artifact_path || resultTemplate.raw_artifact_path
            });

        } catch (error) {
            results.push({
                ...resultTemplate,
                status: 'error',
                findings: [`Runner crashed: ${error.message}`]
            });
        }
    }

    return results;
}