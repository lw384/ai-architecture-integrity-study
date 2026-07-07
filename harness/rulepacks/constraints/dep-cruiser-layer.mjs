// rulepacks/js-ts-react/constraints/dep-cruiser-layer.mjs
import { exec } from 'node:child_process';
import util from 'node:util';
import fs from 'node:fs';
import path from 'node:path';

const execAsync = util.promisify(exec);

export const VERSION = "1.0.0";

export async function run({ targetDir }) {
    const srcPath = path.join(targetDir, 'src');

    // 边界情况 1: 目标 workspace 连 src 目录都没有，直接跳过
    if (!fs.existsSync(srcPath)) {
        return {
            status: 'skipped',
            findings: [{ rule: 'dep-cruiser-layer', severity: 'warn', message: 'No src/ directory found, skipping evaluation.' }]
        };
    }

    try {
        // 使用 npx 执行 dependency-cruiser。
        // 参数说明：
        // -y: 如果本地 node_modules 没装，自动临时下载，防止 CLI 交互式卡死
        // src: 扫描目标
        // --output-type json: 强制输出 JSON 依赖树
        const command = `npx -y dependency-cruiser src --no-config --output-type json`;

        let stdout;
        try {
            // 分配 10MB 的 Buffer 防止大型项目的 JSON 撑爆内存
            const result = await execAsync(command, { cwd: targetDir, maxBuffer: 1024 * 1024 * 10 });
            stdout = result.stdout;
        } catch (execError) {
            // 边界情况 2: dep-cruiser 若自身规则报错，exit code 会是 1，但 stdout 依然有合法的 JSON
            if (execError.stdout) {
                stdout = execError.stdout;
            } else {
                // 真的是工具崩溃了（比如 npx 找不到，或者 OOM）
                throw execError;
            }
        }

        const report = JSON.parse(stdout);
        const findings = [];

        // 手动解析依赖关系，寻找 controller 直接依赖 repository 的边
        // 手动解析依赖关系，寻找 controller 直接依赖 repository 的边
        const modules = report.modules || [];
        for (const mod of modules) {
            // 只要文件名包含 controller 即可
            if (mod.source.includes('controller')) {
                for (const dep of mod.dependencies || []) {
                    // dep.module 是代码里写的原始字符串 (如 './user.repository')
                    // dep.resolved 是工具解析出的物理路径
                    const targetStr = (dep.module || '') + (dep.resolved || '');

                    if (targetStr.includes('repository')) {
                        findings.push({
                            rule: 'no-controller-to-repository',
                            severity: 'fatal',
                            message: `Architecture Violation: [${mod.source}] directly imports [${dep.module || dep.resolved}]`
                        });
                    }
                }
            }
        }

        return {
            status: findings.length > 0 ? 'fail' : 'pass',
            findings: findings
        };

    } catch (error) {
        // 边界情况 3: JSON 解析失败、或者 spawn 进程级别失败
        return {
            status: 'error',
            findings: [{
                rule: 'dep-cruiser-layer',
                severity: 'fatal',
                message: `Execution or parsing failed: ${error.message}`
            }]
        };
    }
}