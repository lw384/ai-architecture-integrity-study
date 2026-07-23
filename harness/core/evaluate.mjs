/**
 * harness/core/evaluate.mjs
 *
 * Thin orchestrator for the evaluation pipeline.
 * It converts task and rulepack configuration into execution plans,
 * delegates execution to layer runners, and persists the final artifact.
 */
import { getEnvSnapshot } from './env/env_snapshot.mjs';
import { calculateDeltas } from './aggregators/delta_aggregator.mjs';
import { readTaskConfig } from './io/task_config_reader.mjs';
import { readManifest } from './io/manifest_reader.mjs';
import { writeEvaluation } from './io/evaluation_writer.mjs';
import { runConstraints } from './layers/constraints_runner.mjs';
import { runMetrics } from './layers/metrics_runner.mjs';
import {
  buildCrossStackExecutionPlan,
  buildSubjectExecutionPlans,
} from './planning/subject_planner.mjs';
import { buildAdapterRegistry } from './runtime/adapter_registry.mjs';
import {
  resolveCrossStackRulepack,
  resolveSubjectRulepacks,
} from './runtime/rulepack_resolver.mjs';
import { parseRuntimeOptions } from './runtime/runtime_options.mjs';

function buildLegacyTaskConfig(subjectPlan, taskConfig) {
  return {
    enabled: subjectPlan.enabled,
    thresholds: subjectPlan.thresholds,
  };
}

function collectToolVersions(resolvedSubjectRulepacks, resolvedCrossStackRulepack) {
  const toolVersions = {};

  for (const resolvedRulepack of [...resolvedSubjectRulepacks, resolvedCrossStackRulepack].filter(Boolean)) {
    const adapters = resolvedRulepack.manifest.adapters ?? {};

    for (const [adapterId, adapterDeclaration] of Object.entries(adapters)) {
      toolVersions[adapterId] = adapterDeclaration.version ?? 'unknown';
    }
  }

  return toolVersions;
}

function toConstraintLayerEntry(subjectResult) {
  const statusMap = {
    ok: 'pass',
    fail: 'fail',
    error: 'error',
  };

  return {
    name: `${subjectResult.subject_id}:constraints`,
    version: subjectResult.rulepack_version,
    status: statusMap[subjectResult.layers.constraints.status] ?? 'error',
    findings: subjectResult.layers.constraints.findings.map((finding) => finding.message),
    raw_artifact_path: `subjects/${subjectResult.subject_id}/constraints.json`,
  };
}

function aggregateLayers(subjectResults) {
  return {
    constraints: subjectResults.map(toConstraintLayerEntry),
    metrics: subjectResults.flatMap((subjectResult) =>
      subjectResult.layers.metrics.map((metricResult) => ({
        ...metricResult,
        name: `${subjectResult.subject_id}:${metricResult.name}`,
      })),
    ),
    judgments: subjectResults.flatMap((subjectResult) =>
      subjectResult.layers.judgments.map((judgmentResult) => ({
        ...judgmentResult,
        name: `${subjectResult.subject_id}:${judgmentResult.name}`,
      })),
    ),
  };
}

function deriveEvaluationStatus(subjectResults, crossStackResult) {
  const allStatuses = [
    ...subjectResults.map((subjectResult) => subjectResult.status),
    crossStackResult?.status,
  ].filter(Boolean);

  if (allStatuses.includes('error') || allStatuses.includes('failed')) {
    return 'partial';
  }

  return 'completed';
}

function buildFinalEvaluation({
  manifestContext,
  runtimeOptions,
  taskConfig,
  envSnapshot,
  subjectResults,
  crossStackResult,
  deltas,
  durationMs,
}) {
  return {
    schema_version: '0.1.0',
    run_id: runtimeOptions.runId ?? `run_${Date.now()}`,
    trajectory_id: runtimeOptions.trajectoryId ?? 'traj_pending',
    task_id: manifestContext.task_id,
    rulepack_id: manifestContext.rulepack_id,
    target: {
      workspace_path: runtimeOptions.targetPath,
      pre_commit: runtimeOptions.preCommit ?? manifestContext.pre_commit,
      post_commit: runtimeOptions.postCommit ?? 'unknown',
      baseline_commit: manifestContext.baseline_commit,
    },
    env_snapshot: envSnapshot,
    layers: aggregateLayers(subjectResults),
    subjects: subjectResults,
    cross_stack: crossStackResult,
    task_summary: {
      subject_count: subjectResults.length,
      cross_stack_enabled: Boolean(crossStackResult),
      execution: taskConfig.execution,
    },
    deltas,
    duration_ms: durationMs,
    status: deriveEvaluationStatus(subjectResults, crossStackResult),
    errors: [],
  };
}

async function runSubjectEvaluations({ subjectPlans, taskConfig, runtimeOptions }) {
  const subjectResults = [];

  for (const subjectPlan of subjectPlans) {
    console.log(`[Harness Engine] Evaluating subject: ${subjectPlan.subjectId}`);

    const adapterRegistry = await buildAdapterRegistry({
      rulepackDir: subjectPlan.rulepackDir,
      adaptersDeclaration: subjectPlan.rulepackManifest.adapters,
    });

    const legacyTaskConfig = buildLegacyTaskConfig(subjectPlan, taskConfig);
    const constraints = await runConstraints({
      targetDir: subjectPlan.subjectRoot,
      rulepackDir: subjectPlan.rulepackDir,
      taskConfig: legacyTaskConfig,
      adapterRegistry,
    });

    const metrics = await runMetrics({
      targetDir: subjectPlan.subjectRoot,
      baselineDir: runtimeOptions.baselinePath ?? subjectPlan.subjectRoot,
      rulepackDir: subjectPlan.rulepackDir,
      taskConfig: legacyTaskConfig,
      adapterRegistry,
      constraintsLayer: constraints,
    }).catch(() => []);

    // Judgments are temporarily disabled at the orchestrator level.
    const judgments = [];

    const subjectStatus = [
      constraints.status,
      ...metrics.map((metric) => metric.status),
      ...judgments.map((judgment) => judgment.status),
    ].includes('error')
      ? 'error'
      : constraints.status === 'fail' || metrics.some((metric) => metric.status === 'fail')
        ? 'failed'
        : 'completed';

    subjectResults.push({
      subject_id: subjectPlan.subjectId,
      subject_root: subjectPlan.subjectRoot,
      rulepack_id: subjectPlan.rulepackId,
      rulepack_version: subjectPlan.rulepackManifest.version,
      adapters: Array.from(adapterRegistry.keys()),
      status: subjectStatus,
      layers: {
        constraints,
        metrics,
        judgments,
      },
    });
  }

  return subjectResults;
}

async function runCrossStackEvaluation({ crossStackPlan }) {
  if (!crossStackPlan) {
    return null;
  }

  return {
    plan_id: crossStackPlan.planId,
    rulepack_id: crossStackPlan.rulepackId,
    status: 'skipped',
    reason: 'Cross-stack runner is not wired into the orchestrator yet.',
  };
}

async function runEvaluation(runtimeOptions) {
  const startedAt = Date.now();

  console.log(`\n[Harness Engine] Starting evaluation for target: ${runtimeOptions.targetPath}`);

  const manifestContext = readManifest(runtimeOptions.manifestPath);
  const taskConfig = readTaskConfig(runtimeOptions.taskConfigPath);

  const resolvedSubjectRulepacks = resolveSubjectRulepacks({
    subjects: taskConfig.subjects,
    rulepacksRoot: runtimeOptions.rulepacksRoot,
  });

  const resolvedCrossStackRulepack = resolveCrossStackRulepack({
    crossStackConfig: taskConfig.cross_stack,
    rulepacksRoot: runtimeOptions.rulepacksRoot,
  });

  const subjectPlans = buildSubjectExecutionPlans({
    workspaceRoot: runtimeOptions.targetPath,
    taskConfig,
    resolvedRulepacks: resolvedSubjectRulepacks,
  });

  const crossStackPlan = buildCrossStackExecutionPlan({
    workspaceRoot: runtimeOptions.targetPath,
    taskConfig,
    resolvedRulepack: resolvedCrossStackRulepack,
  });

  const envSnapshot = getEnvSnapshot({
    rulepack: {
      tool_versions: collectToolVersions(resolvedSubjectRulepacks, resolvedCrossStackRulepack),
    },
  });

  const subjectResults = await runSubjectEvaluations({
    subjectPlans,
    taskConfig,
    runtimeOptions,
  });

  const crossStackResult = await runCrossStackEvaluation({
    crossStackPlan,
  });

  const currentData = aggregateLayers(subjectResults);
  const deltas = calculateDeltas({
    baselineData: { constraints: [], metrics: [], judgments: [] },
    preData: { constraints: [], metrics: [], judgments: [] },
    postData: currentData,
  });

  const evaluationResult = buildFinalEvaluation({
    manifestContext,
    runtimeOptions,
    taskConfig,
    envSnapshot,
    subjectResults,
    crossStackResult,
    deltas,
    durationMs: Date.now() - startedAt,
  });

  writeEvaluation({
    evaluationPath: runtimeOptions.outputPath,
    evaluationData: evaluationResult,
    manifestPath: runtimeOptions.manifestPath,
  });

  return evaluationResult;
}

function mapFatalErrorToExitCode() {
  return 1;
}

async function main() {
  const runtimeOptions = parseRuntimeOptions(process.argv.slice(2));
  await runEvaluation(runtimeOptions);
  console.log('[Harness Engine] Evaluation pipeline completed successfully.');
}

main().catch((error) => {
  console.error(`[Harness Fatal] ${error.stack}`);
  process.exit(mapFatalErrorToExitCode(error));
});