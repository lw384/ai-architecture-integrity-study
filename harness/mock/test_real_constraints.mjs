// harness/mock/test_real_constraints.mjs
import path from 'node:path';
import { runConstraints } from '../core/layers/constraints_runner.mjs';

async function main() {
    // 确保在 harness 根目录下执行此脚本
    const rulepackDir = path.resolve(process.cwd(), 'rulepacks/js-ts-react');

    // 指向我们在 3.1.1 创建的两个 fixture 目录
    const cleanTarget = path.resolve(rulepackDir, 'fixtures/baseline-clean');
    const violationTarget = path.resolve(rulepackDir, 'fixtures/violation-controller-to-repo');

    console.log('=== 🧪 测试 1: 扫描 Baseline Clean (预期: 0 违规) ===');
    const cleanResult = await runConstraints({
        targetDir: cleanTarget,
        rulepackDir,
        taskConfig: {} // 暂不需要额外任务配置
    });
    console.log(`评估状态: ${cleanResult.status}`);
    console.log(`Tier 1/2 Findings 数量: ${cleanResult.findings.length}`);
    console.log(`Tier 3 Background 数量: ${cleanResult.background_findings.length}\n`);

    console.log('=== 💥 测试 2: 扫描 Violation (预期: 捕获 ARCH-001) ===');
    const failResult = await runConstraints({
        targetDir: violationTarget,
        rulepackDir,
        taskConfig: {}
    });
    console.log(`评估状态: ${failResult.status}`);
    console.log(`Tier 1/2 Findings 数量: ${failResult.findings.length}`);

    if (failResult.findings.length > 0) {
        const firstFinding = failResult.findings[0];
        console.log(`\n🔍 成功捕获违规!`);
        console.log(`命中的研究规则: ${firstFinding.rule_id} (Tier ${firstFinding.tier})`);
        console.log(`底层工具规则: ${firstFinding.evidence.source_rule_id}`);
        console.log(`准备反馈给 Agent 的信息: \n"${firstFinding.message}"`);
    }
}

main().catch(err => {
    console.error('🚨 测试脚本崩溃:', err);
});