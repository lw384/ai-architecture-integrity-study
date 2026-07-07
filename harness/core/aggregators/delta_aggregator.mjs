// core/aggregators/delta_aggregator.mjs

/**
 * 从规则结果中提取数值
 * 对于 Metrics (v2 格式)，提取 score.value
 * 对于 Judgments，直接提取 score
 */
function extractScore(ruleResult) {
    if (!ruleResult) return null;
    if (typeof ruleResult.score === 'object' && ruleResult.score !== null) {
        return ruleResult.score.value; // Metrics v2
    }
    return typeof ruleResult.score === 'number' ? ruleResult.score : null; // Judgments
}

/**
 * 提取 Constraints 的违规数量
 */
function extractFindingsCount(ruleResult) {
    if (!ruleResult || !ruleResult.findings) return 0;
    return ruleResult.findings.length;
}

/**
 * 聚合三层数据，计算 run_local 和 trajectory_cumulative 两个维度的 delta
 *
 * @param {Object} params
 * @param {Object} params.baselineData - 原始基线 target 的 evaluation results
 * @param {Object} params.preData - 本次 run 之前的 evaluation results
 * @param {Object} params.postData - 本次 run 生成的 target 的 evaluation results
 * @returns {Object} { run_local, trajectory_cumulative }
 */
export function calculateDeltas({ baselineData, preData, postData }) {
    const run_local = {};
    const trajectory_cumulative = {};

    // 通用的层级处理函数 (针对有数值评分的 Metrics 和 Judgments)
    const processScoredLayer = (layerName) => {
        if (!postData[layerName]) return;

        for (const postRule of postData[layerName]) {
            if (postRule.status === 'error') continue;

            const ruleName = postRule.name;
            const postScore = extractScore(postRule);

            const preRule = (preData[layerName] || []).find(r => r.name === ruleName);
            const preScore = extractScore(preRule);

            const baselineRule = (baselineData[layerName] || []).find(r => r.name === ruleName);
            const baselineScore = extractScore(baselineRule);

            if (postScore !== null && preScore !== null) {
                // Run Local: post - pre
                // 例如：pre_commit 复杂度 10，post_commit 复杂度 12 -> delta = +2 (局部恶化)
                run_local[`${ruleName}_delta`] = postScore - preScore;
            }

            if (postScore !== null && baselineScore !== null) {
                // Trajectory Cumulative: post - baseline
                // 例如：baseline 复杂度 8，post_commit 复杂度 12 -> delta = +4 (全局恶化)
                trajectory_cumulative[`${ruleName}_delta`] = postScore - baselineScore;
            }
        }
    };

    processScoredLayer('metrics');
    processScoredLayer('judgments');

    // 特殊处理 Constraints 层（通过统计 findings 的数量增减来计算 Delta）
    if (postData.constraints) {
        for (const postRule of postData.constraints) {
            if (postRule.status === 'error') continue;

            const ruleName = postRule.name;
            const postCount = extractFindingsCount(postRule);

            const preRule = (preData.constraints || []).find(r => r.name === ruleName);
            const preCount = extractFindingsCount(preRule);

            const baseRule = (baselineData.constraints || []).find(r => r.name === ruleName);
            const baseCount = extractFindingsCount(baseRule);

            run_local[`${ruleName}_issues_delta`] = postCount - preCount;
            trajectory_cumulative[`${ruleName}_issues_delta`] = postCount - baseCount;
        }
    }

    return { run_local, trajectory_cumulative };
}