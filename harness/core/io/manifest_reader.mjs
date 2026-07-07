// harness/core/io/manifest_reader.mjs
import fs from 'node:fs';

export function readManifest(manifestPath) {
    if (!fs.existsSync(manifestPath)) {
        console.error(`[Harness Error] Manifest file not found at ${manifestPath}`);
        // 退出码 2：target 目录/状态不合法
        process.exit(2);
    }

    let manifest;
    try {
        const raw = fs.readFileSync(manifestPath, 'utf-8');
        manifest = JSON.parse(raw);
    } catch (error) {
        console.error(`[Harness Error] Failed to parse manifest JSON: ${error.message}`);
        process.exit(2);
    }

    // 1. 严格检查状态机：只有 ready_for_evaluation 才能被评估
    if (manifest.status !== 'ready_for_evaluation') {
        console.error(`[Harness Error] Refusing to evaluate. Manifest status is '${manifest.status}', expected 'ready_for_evaluation'.`);
        process.exit(2);
    }

    // 2. 幂等性检查：如果 events 已经包含 evaluation_completed，警告但继续执行
    if (Array.isArray(manifest.events) && manifest.events.includes('evaluation_completed')) {
        console.warn(`[Harness Warning] Evaluation was already completed for this trajectory. Re-running evaluation idempotently.`);
    }

    // 3. 提取核心上下文
    const { task_id, pre_commit, baseline_commit, rulepack_id } = manifest;

    if (!task_id || !baseline_commit || !rulepack_id) {
        console.error(`[Harness Error] Manifest missing required fields: task_id, baseline_commit, or rulepack_id.`);
        process.exit(2);
    }

    return {
        task_id,
        pre_commit: pre_commit || 'unknown', // 第一轮可能没有 pre_commit
        baseline_commit,
        rulepack_id
    };
}