// harness/core/io/evaluation_writer.mjs
import fs from 'node:fs';
import path from 'node:path';

/**
 * 辅助函数：原子性写入 JSON 文件
 * 机制：先写一个随机后缀的 temp 文件，写完后瞬间 rename 覆盖目标文件。
 */
function writeAtomically(filePath, dataObj) {
    const tempPath = `${filePath}.tmp.${Date.now()}`;
    const dir = path.dirname(filePath);

    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    // 1. 完整写入临时文件
    fs.writeFileSync(tempPath, JSON.stringify(dataObj, null, 2), 'utf-8');

    // 2. 操作系统级别的原子重命名 (覆盖原文件)
    fs.renameSync(tempPath, filePath);
}

/**
 * 写入评估结果并更新 Manifest
 *
 * @param {Object} params
 * @param {string} params.evaluationPath - 目标 evaluation.json 路径
 * @param {Object} params.evaluationData - 准备写入的评估结果对象
 * @param {string} params.manifestPath - 对应的 manifest.json 路径
 */
export function writeEvaluation({ evaluationPath, evaluationData, manifestPath }) {
    // --- 1. 处理 Re-evaluation (覆盖写入) 逻辑 ---
    if (fs.existsSync(evaluationPath)) {
        try {
            const oldStat = fs.statSync(evaluationPath);
            // 打上重评测标记，记录旧文件的修改时间戳，捍卫实验数据的可追溯性
            evaluationData.re_evaluated_from = oldStat.mtime.toISOString();
            console.log(`[Harness] Overwriting existing evaluation. Marking re_evaluated_from: ${evaluationData.re_evaluated_from}`);
        } catch (err) {
            console.warn(`[Harness Warning] Failed to read old evaluation for re-eval mark: ${err.message}`);
        }
    }

    // --- 2. 原子写入 evaluation.json ---
    try {
        writeAtomically(evaluationPath, evaluationData);
        console.log(`[Harness] Successfully wrote evaluation report to ${evaluationPath}`);
    } catch (err) {
        console.error(`[Harness Error] Failed to write evaluation atomically: ${err.message}`);
        process.exit(1);
    }

    // --- 3. 原子更新 Manifest 状态 ---
    if (manifestPath && fs.existsSync(manifestPath)) {
        try {
            const manifestRaw = fs.readFileSync(manifestPath, 'utf-8');
            const manifest = JSON.parse(manifestRaw);

            // 状态扭转
            manifest.status = 'evaluated';

            // 幂等追加事件
            manifest.events = manifest.events || [];
            if (!manifest.events.includes('evaluation_completed')) {
                manifest.events.push('evaluation_completed');
            }

            writeAtomically(manifestPath, manifest);
            console.log(`[Harness] Successfully updated manifest status to 'evaluated' at ${manifestPath}`);

        } catch (err) {
            console.error(`[Harness Error] Failed to update manifest atomically: ${err.message}`);
            process.exit(1);
        }
    } else {
        console.warn(`[Harness Warning] Manifest not found at ${manifestPath}, skipping manifest update.`);
    }
}