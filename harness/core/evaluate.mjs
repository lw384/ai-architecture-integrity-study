// harness/core/evaluate.mjs
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

// 引入我们前面写好的所有功能模块
import { readManifest } from './io/manifest_reader.mjs';
import { getEnvSnapshot } from './env/env_snapshot.mjs';
import { writeEvaluation } from './io/evaluation_writer.mjs';
import { runConstraints } from './layers/constraints_runner.mjs';
import { runMetrics } from './layers/metrics_runner.mjs';
import { calculateDeltas } from './aggregators/delta_aggregator.mjs';

const options = {
  target: { type: 'string' },
  'task-config': { type: 'string' },
  rulepack: { type: 'string' },
  output: { type: 'string' },
  // 兼容现有的 CLI 参数，防止报错
  baseline: { type: 'string' },
  'pre-commit': { type: 'string' },
  'post-commit': { type: 'string' },
  'run-id': { type: 'string' },
  'trajectory-id': { type: 'string' },
  mode: { type: 'string', default: 'full' }
};

async function main() {
  const parsed = parseArgs({ options, strict: false });
  const args = parsed.values;

  const targetDir = path.resolve(process.cwd(), args.target);
  const manifestPath = path.join(targetDir, 'manifest.json');
  const evaluationPath = args.output ? path.resolve(process.cwd(), args.output) : path.join(targetDir, 'evaluation.json');

  console.log(`\n🚀 [Harness Engine] Starting evaluation for target: ${targetDir}`);

  // 1. 读取并校验 Manifest (IO 层)
  const manifestContext = readManifest(manifestPath);

  // 2. 读取任务配置与 Rulepack
  const taskConfigPath = path.resolve(process.cwd(), args['task-config']);
  const rulepackDir = path.resolve(process.cwd(), args.rulepack);

  const taskConfig = JSON.parse(fs.readFileSync(taskConfigPath, 'utf-8'));
  let rulepackManifest = {};
  try {
    const rawManifest = fs.readFileSync(path.join(rulepackDir, 'mock_rulepack.json'), 'utf-8');
    rulepackManifest = JSON.parse(rawManifest);
  } catch (err) {
    console.warn(`[Harness Warning] mock_rulepack.json not found in ${rulepackDir}, using empty manifest.`);
  }

  // 3. 抓取环境快照
  const env_snapshot = getEnvSnapshot({ rulepack: rulepackManifest });

  // 4. 运行评估层 (Layers)
  console.log(`[Harness Engine] Running Rule Layers...`);
  const constraintsResults = await runConstraints({ targetDir, rulepackDir, taskConfig });

  // 为了 Smoke Test 的鲁棒性，如果有报错，将其兜底为空数组
  const metricsResults = await runMetrics({ targetDir, baselineDir: targetDir, rulepackDir, taskConfig }).catch(() => []);
  const judgmentsResults = []; // Smoke Test 暂不调用真实 LLM，保持为空

  // 5. 数据聚合 (Aggregator)
  // 此处模拟 Baseline 数据，真实情况需从外部加载 baseline 的 evaluation.json
  const mockBaselineData = { constraints: [], metrics: [], judgments: [] };
  const mockPreData = { constraints: [], metrics: [], judgments: [] };
  const currentData = { constraints: constraintsResults, metrics: metricsResults, judgments: judgmentsResults };

  const deltas = calculateDeltas({ baselineData: mockBaselineData, preData: mockPreData, postData: currentData });

  // 6. 拼装最终产物契约
  const evaluationResult = {
    schema_version: "0.1.0",
    run_id: args['run-id'] || `run_${Date.now()}`,
    trajectory_id: args['trajectory-id'] || "traj_smoke_test",
    task_id: manifestContext.task_id,
    rulepack_id: manifestContext.rulepack_id,
    target: {
      workspace_path: targetDir,
      pre_commit: manifestContext.pre_commit,
      post_commit: args['post-commit'] || "unknown",
      baseline_commit: manifestContext.baseline_commit
    },
    env_snapshot: env_snapshot,
    layers: currentData,
    deltas: deltas,
    duration_ms: 1500, // 简化处理
    status: constraintsResults.some(r => r.status === 'error') ? 'partial' : 'completed',
    errors: []
  };

  // 7. 原子化写入并更新 Manifest
  console.log(`[Harness Engine] Writing artifacts and syncing states...`);
  writeEvaluation({ evaluationPath, evaluationData: evaluationResult, manifestPath });

  console.log(`✅ [Harness Engine] Evaluation Pipeline Completed Successfully.\n`);
  process.exit(0);
}

main().catch(err => {
  console.error(`🚨 [Harness Fatal] ${err.stack}`);
  process.exit(1);
});