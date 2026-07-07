// core/env/env_snapshot.mjs
import { execSync } from 'node:child_process';
import os from 'node:os';

/**
 * 安全执行 Shell 命令，失败时不抛出异常，而是返回 fallback 字符串
 */
function safeExec(command, fallback = 'unknown') {
    try {
        // stdio: 'pipe' 确保错误信息不会打印到主控台干扰日志
        return execSync(command, { encoding: 'utf-8', stdio: 'pipe' }).trim();
    } catch (error) {
        return fallback;
    }
}

/**
 * 抓取当前评估环境的元数据快照
 *
 * @param {Object} params
 * @param {Object} params.rulepack - Rulepack 的 manifest 对象 (包含期望的 tool_versions)
 * @returns {Object} 符合 evaluation.schema.json 中 env_snapshot 结构的完整对象
 */
export function getEnvSnapshot({ rulepack = {} }) {
    // 提取 rulepack 中声明的依赖工具版本
    const expectedToolVersions = rulepack.tool_versions || {};

    return {
        node_version: process.version,
        pnpm_version: safeExec('pnpm --version'),
        harness_commit: safeExec('git rev-parse HEAD'), // 获取当前 Harness 代码库的 Git 提交哈希
        os: `${os.type()} ${os.release()} (${os.arch()})`,
        tool_versions: expectedToolVersions
    };
}