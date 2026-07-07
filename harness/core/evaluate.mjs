import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

// ==========================================
// 退出码约定 (严格固定)
// ==========================================
const EXIT_CODES = {
  SUCCESS: 0,
  INTERNAL_ERROR: 1,
  INVALID_TARGET: 2,
  RULEPACK_ERROR: 3,
  TASK_CONFIG_ERROR: 4,
};

// ==========================================
// CLI 参数签名定义
// ==========================================
const options = {
  target: { type: 'string' },
  'task-config': { type: 'string' },
  rulepack: { type: 'string' },
  baseline: { type: 'string' },
  'pre-commit': { type: 'string' },
  'post-commit': { type: 'string' },
  'run-id': { type: 'string' },
  'trajectory-id': { type: 'string' },
  output: { type: 'string' },
  mode: { type: 'string', default: 'full' }, // full | constraints-only | metrics-only | judgments-only
};

function main() {
  let args;
  try {
    const parsed = parseArgs({ options, strict: false });
    args = parsed.values;
  } catch (err) {
    console.error(`[Harness Error] Failed to parse CLI arguments: ${err.message}`);
    process.exit(EXIT_CODES.INTERNAL_ERROR);
  }

  // 简单校验必填参数（这里只做基础判断，后续可以增强）
  const required = [
    'target', 'task-config', 'rulepack', 'baseline',
    'pre-commit', 'post-commit', 'run-id', 'trajectory-id', 'output'
  ];
  const missing = required.filter(k => !args[k]);
  if (missing.length > 0) {
    console.error(`[Harness Error] Missing required arguments: ${missing.join(', ')}`);
    // 在真实逻辑中，可以根据缺失的具体参数返回对应的 EXIT_CODES
    process.exit(EXIT_CODES.INTERNAL_ERROR);
  }

  console.log(`[Harness] Starting evaluation for Run: ${args['run-id']}, Trajectory: ${args['trajectory-id']}`);
  console.log(`[Harness] Mode: ${args.mode}`);

  // ==========================================
  // 生成 Stub Evaluation 数据 (严格符合 Schema)
  // ==========================================
  const mockEvaluation = {
    schema_version: "0.1.0",
    run_id: args['run-id'],
    trajectory_id: args['trajectory-id'],
    task_id: "T1_auth_refactor", // 真实场景下应从 args['task-config'] 解析
    rulepack_id: "rp_ts_react_nest_v1", // 真实场景下应从 args.rulepack 解析
    target: {
      workspace_path: args.target,
      pre_commit: args['pre-commit'],
      post_commit: args['post-commit'],
      baseline_commit: args.baseline
    },
    env_snapshot: {
      node_version: process.version,
      pnpm_version: "8.15.4", // Stub
      harness_commit: "stub_commit_sha",
      os: process.platform,
      tool_versions: {}
    },
    layers: {
      constraints: [
        { name: "stub-constraint", version: "1.0", status: "pass", findings: [], raw_artifact_path: "logs/c.log" }
      ],
      metrics: [
        { name: "stub-metric", version: "1.0", status: "pass", score: 100, raw_artifact_path: "logs/m.json" }
      ],
      judgments: [
        { name: "stub-judgment", version: "1.0", status: "pass", score: 95, findings: ["Looks good"], raw_artifact_path: "logs/j.json" }
      ]
    },
    deltas: {
      run_local: { "stub_metric_delta": 2.5 },
      trajectory_cumulative: { "stub_metric_delta": 5.0 }
    },
    duration_ms: 1250,
    status: "completed",
    errors: []
  };

  // 写入输出文件
  try {
    const outPath = path.resolve(process.cwd(), args.output);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(mockEvaluation, null, 2), 'utf-8');
    console.log(`[Harness] Evaluation complete. Report written to ${outPath}`);
    process.exit(EXIT_CODES.SUCCESS);
  } catch (err) {
    console.error(`[Harness Error] Failed to write output file: ${err.message}`);
    process.exit(EXIT_CODES.INTERNAL_ERROR);
  }
}

main();