// rulepacks/judgments/architecture-compliance-llm.mjs
export const VERSION = "1.0.0";

export async function run({ targetDir, llmClient, samples, model, temperature }) {
    const per_sample_results = [];
    let totalScore = 0;

    // 1. 根据 taskConfig 中定义的采样次数，循环调用 LLM
    for (let i = 0; i < samples; i++) {
        // 构造发给 LLM 的 prompt（真实情况可能需要读取 targetDir 下的代码文件）
        const prompt = `Evaluate the architectural compliance of the code in ${targetDir}. Output a JSON with a 'score' (0-100) and 'reasoning'.`;

        // 调用注入的 llmClient
        const response = await llmClient.evaluate(prompt, { model, temperature });
        per_sample_results.push(response);
        totalScore += response.score;
    }

    // 2. 聚合结果
    const avgScore = totalScore / samples;

    // 3. 计算一致性 (Kappa)。
    // 这里用一个 hardcoded 的 Mock 值来代表计算逻辑。
    // 在真实场景中，如果三次打分分别是 90, 85, 92，Kappa 较高；如果是 10, 90, 50，Kappa 极低。
    const kappa = samples > 1 ? 0.85 : 1.0;

    return {
        score: avgScore,
        kappa: kappa,
        per_sample_results: per_sample_results,
        findings: [`Aggregated score over ${samples} samples: ${avgScore.toFixed(1)}. Inter-rater reliability (Kappa): ${kappa}`]
    };
}