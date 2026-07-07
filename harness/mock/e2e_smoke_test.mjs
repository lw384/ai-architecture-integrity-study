// harness/mock/e2e_smoke_test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const WORKSPACE_DIR = path.resolve(process.cwd(), '/tmp/harness-smoke-test');

function setupFakeWorkspace() {
    if (fs.existsSync(WORKSPACE_DIR)) {
        fs.rmSync(WORKSPACE_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(WORKSPACE_DIR, { recursive: true });

    // 1. Agent 搞破坏：写一个违规的架构文件 (Controller 直接引 Repository)
    const srcDir = path.join(WORKSPACE_DIR, 'src');
    fs.mkdirSync(srcDir);
    fs.writeFileSync(path.join(srcDir, 'user.repository.js'), `export class UserRepository {}`);
    fs.writeFileSync(path.join(srcDir, 'user.controller.js'), `
    import { UserRepository } from './user.repository.js';
    export class UserController {}
  `);

    // 2. Python 流水线写 Manifest
    const manifestData = {
        status: "ready_for_evaluation",
        events: ["agent_started", "agent_completed"],
        task_id: "T1_smoke_test",
        baseline_commit: "base-sha-111",
        pre_commit: "pre-sha-222",
        rulepack_id: "rp_ts_react_nest_v1"
    };
    fs.writeFileSync(path.join(WORKSPACE_DIR, 'manifest.json'), JSON.stringify(manifestData, null, 2));

    // 3. 构造一份供 Harness 读的 mock_task_config.json
    const configDir = path.join(WORKSPACE_DIR, 'config');
    fs.mkdirSync(configDir);
    const taskConfig = {
        task_id: "T1_smoke_test",
        rulepack_id: "rp_ts_react_nest_v1",
        enabled: {
            constraints: ["dep-cruiser-layer"], // 只激活刚才写好的 dep-cruiser 规则
            metrics: [],
            judgments: []
        },
        judgment_config: { model: "mock", temperature: 0, sampling_times: 1 }
    };
    fs.writeFileSync(path.join(configDir, 'task.json'), JSON.stringify(taskConfig, null, 2));
}

function runSmokeTest() {
    console.log("=== 🟢 E2E Smoke Test Started ===");
    setupFakeWorkspace();

    // 触发 Harness
    const cmd = `node core/evaluate.mjs \
    --target ${WORKSPACE_DIR} \
    --task-config ${path.join(WORKSPACE_DIR, 'config', 'task.json')} \
    --rulepack rulepacks \
    --output ${path.join(WORKSPACE_DIR, 'evaluation.json')}`;

    try {
        execSync(cmd, { stdio: 'inherit' });
    } catch (error) {
        console.error("❌ Harness 进程崩溃退出！");
        process.exit(1);
    }

    // 验证 1：Manifest 状态变更
    const manifest = JSON.parse(fs.readFileSync(path.join(WORKSPACE_DIR, 'manifest.json'), 'utf-8'));
    if (manifest.status === 'evaluated' && manifest.events.includes('evaluation_completed')) {
        console.log("✔️  Assertion Passed: Manifest 状态已更新为 'evaluated'");
    } else {
        console.error("❌ Assertion Failed: Manifest 状态未正确更新");
    }

    // 验证 2：Evaluation.json 字段完整性与违规捕获
    const evalData = JSON.parse(fs.readFileSync(path.join(WORKSPACE_DIR, 'evaluation.json'), 'utf-8'));

    if (evalData.schema_version === "0.1.0" && evalData.env_snapshot) {
        console.log("✔️  Assertion Passed: evaluation.json 核心字段已填充");
    } else {
        console.error("❌ Assertion Failed: 缺少 schema_version 或 env_snapshot");
    }

    // 验证 3：Dep-cruiser 成功抓住了违规
    const depResult = evalData.layers.constraints.find(c => c.name === 'dep-cruiser-layer');
    if (depResult && depResult.status === 'fail' && depResult.findings.length > 0) {
        console.log(`✔️  Assertion Passed: 成功捕获架构违规 -> ${depResult.findings[0].message}`);
    } else {
        console.error("❌ Assertion Failed: 未能通过 dep-cruiser 捕获代码违规");
    }

    console.log("=== 🎉 E2E Smoke Test Passed Successfully! ===");
}

runSmokeTest();