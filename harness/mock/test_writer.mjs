// harness/mock/test_writer.mjs
import fs from 'node:fs';
import path from 'node:path';
import { writeEvaluation } from '../core/io/evaluation_writer.mjs';

async function main() {
    const testDir = path.resolve(process.cwd(), 'mock/writer_workspace');
    if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true, force: true });
    }
    fs.mkdirSync(testDir, { recursive: true });

    const manifestPath = path.join(testDir, 'manifest.json');
    const evaluationPath = path.join(testDir, 'evaluation.json');

    // 初始化一个 "准备被评估" 的 Manifest
    fs.writeFileSync(manifestPath, JSON.stringify({
        status: "ready_for_evaluation",
        events: ["agent_started"],
        task_id: "T0_test"
    }, null, 2));

    console.log('--- 1. First Run: New Evaluation ---');
    const evalData1 = { score: 90, findings: ["Initial run"] };
    writeEvaluation({ evaluationPath, evaluationData: evalData1, manifestPath });

    // 验证第一次执行结果
    const manifestAfter1 = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    console.log(`Manifest Status: ${manifestAfter1.status}`);
    console.log(`Manifest Events: ${manifestAfter1.events.join(', ')}`);

    console.log('\n--- Waiting 1 second to simulate time passing... ---');
    await new Promise(resolve => setTimeout(resolve, 1000));

    console.log('\n--- 2. Second Run: Re-Evaluation (Overwrite) ---');
    const evalData2 = { score: 95, findings: ["Re-evaluated with new rules"] };
    writeEvaluation({ evaluationPath, evaluationData: evalData2, manifestPath });

    // 验证第二次执行结果
    const finalEval = JSON.parse(fs.readFileSync(evaluationPath, 'utf-8'));
    console.log(`Final Evaluation Data:`, finalEval);
}

main();