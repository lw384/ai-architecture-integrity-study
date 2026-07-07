// mock/test_judgments.mjs
import path from 'node:path';
import { runJudgments } from '../core/layers/judgments_runner.mjs';

async function main() {
    const taskConfig = {
        enabled: {
            judgments: ['architecture-compliance-llm']
        },
        judgment_config: {
            model: 'gpt-4-0125-preview',
            temperature: 0.2,
            sampling_times: 3  // 强制采样 3 次
        }
    };

    const targetDir = '/tmp/harness-target';
    const baselineDir = '/tmp/harness-baseline';
    const rulepackDir = path.resolve(process.cwd(), 'rulepacks');

    // ============================================================
    // Mock LLM Client (模拟真实的大模型 API 客户端)
    // ============================================================
    const mockLlmClient = {
        async evaluate(prompt, options) {
            // 模拟网络延迟
            await new Promise(res => setTimeout(res, 150));

            // 模拟带有微小波动的非确定性输出
            const baseScore = 85;
            const jitter = Math.floor(Math.random() * 5) - 2; // -2 到 +2 的波动

            return {
                score: baseScore + jitter,
                reasoning: `Code appears compliant based on ${options.model} at temp ${options.temperature}.`
            };
        }
    };

    console.log('--- Starting Judgments Runner ---');

    const results = await runJudgments({
        targetDir,
        baselineDir,
        rulepackDir,
        taskConfig,
        llmClient: mockLlmClient
    });

    console.log(JSON.stringify(results, null, 2));
}

main();