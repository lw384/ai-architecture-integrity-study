/**
 * Harness evaluation orchestrator.
 *
 * Order: validate inputs, resolve plans, evaluate post, compare snapshots,
 * validate the final contract, then write the artifact atomically.
 */
import path from 'node:path';

import { calculateDeltas } from './aggregators/delta_aggregator.mjs';
import {
  describeArtifact,
  loadComparisonArtifacts,
} from './comparison/comparison_validator.mjs';
import { buildEvaluationProfile } from './comparison/evaluation_profile.mjs';
import { buildEvaluationSnapshot } from './comparison/evaluation_snapshot.mjs';
import { getEnvSnapshot } from './env/env_snapshot.mjs';
import { readManifest } from './io/manifest_reader.mjs';
import { readTaskConfig } from './io/task_config_reader.mjs';
import { writeEvaluation } from './io/evaluation_writer.mjs';
import { runConstraints } from './layers/constraints_runner.mjs';
import { runJudgments } from './layers/judgments_runner.mjs';
import { runMetrics } from './layers/metrics_runner.mjs';
import { buildExecutionPlans } from './planning/scope_planner.mjs';
import { buildAdapterRegistry } from './runtime/adapter_registry.mjs';
import { resolveEvaluationScopes } from './runtime/rulepack_resolver.mjs';
import { parseRuntimeOptions } from './runtime/runtime_options.mjs';

// Present the task-wide judgment settings in the shape expected by every layer.
function buildLayerTaskConfig(executionPlan, taskConfig) {
  return {
    enabled: executionPlan.enabled,
    thresholds: executionPlan.thresholds,
    judgment_config: taskConfig.judgment_config,
  };
}

// Collect adapter versions once for reproducibility metadata in the final artifact.
function collectToolVersions(resolvedRulepacks) {
  const toolVersions = {};

  for (const resolvedRulepack of resolvedRulepacks) {
    for (const [adapterId, declaration] of Object.entries(
      resolvedRulepack.manifest.adapters ?? {},
    )) {
      toolVersions[adapterId] = declaration.version ?? 'unknown';
    }
  }

  return toolVersions;
}

// Convert a scope's detailed constraint result into the flattened layer view.
function toConstraintLayerEntry(scope, rulepackVersion, constraints) {
  return {
    name: `${scope}:constraints`,
    version: rulepackVersion,
    status: constraints.status,
    findings: constraints.findings.map((finding) => finding.message),
    raw_artifact_path: `scopes/${scope}/constraints.json`,
  };
}

// Flatten scope-local results while prefixing names to preserve scope identity.
function aggregateLayers(scopeResults) {
  return {
    constraints: scopeResults.map((scope) =>
      toConstraintLayerEntry(
        scope.scope_id,
        scope.rulepack_version,
        scope.layers.constraints,
      ),
    ),
    metrics: scopeResults.flatMap((scope) =>
      scope.layers.metrics.map((metric) => ({
        ...metric,
        name: `${scope.scope_id}:${metric.name}`,
      })),
    ),
    judgments: scopeResults.flatMap((scope) =>
      scope.layers.judgments.map((judgment) => ({
        ...judgment,
        name: `${scope.scope_id}:${judgment.name}`,
      })),
    ),
  };
}

// Count evaluated scopes by kind for the task summary.
function countScopeTypes(scopeResults) {
  return scopeResults.reduce((counts, scope) => {
    counts[scope.scope_type] = (counts[scope.scope_type] ?? 0) + 1;
    return counts;
  }, {});
}

// Derive analyzer reliability without interpreting findings as execution errors.
function deriveExecutionStatus(scopeResults) {
  const statuses = scopeResults.map((scope) => scope.status);
  const hasExecutionError = statuses.includes('error');
  return hasExecutionError ? 'partial' : 'completed';
}

// Convert layer-level execution errors into the Evaluation Schema error list.
function collectErrors(scopeResults) {
  const errors = [];

  for (const scope of scopeResults) {
    if (scope.layers.constraints.status === 'error') {
      errors.push({
        layer: 'constraints',
        name: scope.scope_id,
        message: 'One or more constraint adapters failed.',
      });
    }
    for (const layerName of ['metrics', 'judgments']) {
      for (const result of scope.layers[layerName]) {
        if (result.status === 'error') {
          errors.push({
            layer: layerName,
            name: `${scope.scope_id}:${result.name}`,
            message: result.findings.join('; ') || 'Layer execution failed.',
          });
        }
      }
    }
  }

  return errors;
}

// Copy cumulative metric deltas back into each detailed scope metric result.
function applyBaselineMetricDeltas(scopeResults, cumulativeDeltas) {
  const deltasByKey = new Map(
    cumulativeDeltas.metrics.map((metric) => [metric.key, metric.delta]),
  );

  for (const scope of scopeResults) {
    for (const metric of scope.layers.metrics) {
      metric.delta_vs_baseline =
        deltasByKey.get(`${scope.scope_id}:${metric.name}`) ?? null;
    }
  }
}

// Derive one scope's execution reliability without interpreting layer findings.
function deriveScopeStatus({ constraints, metrics, judgments }) {
  const layerStatuses = [
    constraints.status,
    ...metrics.map((metric) => metric.status),
    ...judgments.map((judgment) => judgment.status),
  ];

  if (layerStatuses.includes('error')) {
    return 'error';
  }
  return 'completed';
}

/**
 * Evaluate every execution plan in declaration order.
 * Each scope receives an isolated target root and the matching baseline root,
 * but all scopes share the run-level commit context and judgment settings.
 */
async function runScopeEvaluations({ executionPlans, taskConfig, runtimeOptions }) {
  const scopeResults = [];

  for (const executionPlan of executionPlans) {
    console.log(`[Harness Engine] Evaluating scope: ${executionPlan.scopeId}`);

    const adapterRegistry = await buildAdapterRegistry({
      rulepackDir: executionPlan.rulepackDir,
      adaptersDeclaration: executionPlan.rulepackManifest.adapters,
    });
    const layerTaskConfig = buildLayerTaskConfig(executionPlan, taskConfig);
    const baselineRoot = runtimeOptions.baselinePath
      ? path.resolve(runtimeOptions.baselinePath, executionPlan.relativeRoot)
      : executionPlan.targetRoot;
    const constraints = await runConstraints({
      targetDir: executionPlan.targetRoot,
      rulepackDir: executionPlan.rulepackDir,
      taskConfig: layerTaskConfig,
      adapterRegistry,
      runtimeContext: {
        workspaceRoot: runtimeOptions.targetPath,
        baselinePath: runtimeOptions.baselinePath,
        preCommit: runtimeOptions.preCommit,
        postCommit: runtimeOptions.postCommit,
      },
    });
    const metrics = await runMetrics({
      targetDir: executionPlan.targetRoot,
      baselineDir: baselineRoot,
      rulepackDir: executionPlan.rulepackDir,
      taskConfig: layerTaskConfig,
      adapterRegistry,
      constraintsLayer: constraints,
    });
    const judgments = await runJudgments({
      targetDir: executionPlan.targetRoot,
      baselineDir: baselineRoot,
      rulepackDir: executionPlan.rulepackDir,
      taskConfig: layerTaskConfig,
      llmClient: null,
    });

    scopeResults.push({
      scope_id: executionPlan.scopeId,
      scope_type: executionPlan.scopeType,
      scope_root: executionPlan.targetRoot,
      rulepack_id: executionPlan.rulepackId,
      rulepack_version: executionPlan.rulepackManifest.version,
      adapters: Array.from(adapterRegistry.keys()),
      status: deriveScopeStatus({ constraints, metrics, judgments }),
      layers: { constraints, metrics, judgments },
    });
  }

  return scopeResults;
}

// Build immutable artifact references for self or trajectory comparison mode.
function buildComparison({ runtimeOptions, artifacts, postReference }) {
  if (runtimeOptions.comparisonMode === 'self') {
    return {
      mode: 'self',
      baseline: postReference,
      pre: postReference,
      post: postReference,
    };
  }

  return {
    mode: 'trajectory',
    baseline: describeArtifact(artifacts.baseline),
    pre: describeArtifact(artifacts.pre),
    post: postReference,
  };
}

/**
 * Run the complete deterministic evaluation pipeline.
 * Validation and profile checks happen before analyzers; schema validation and
 * atomic persistence happen only after snapshots and deltas are complete.
 */
async function runEvaluation(runtimeOptions) {
  const startedAt = Date.now();
  console.log(
    `\n[Harness Engine] Starting evaluation for target: ${runtimeOptions.targetPath}`,
  );

  // Read contracts before resolving any executable resources.
  const manifestContext = readManifest(runtimeOptions.manifestPath);
  const taskConfig = readTaskConfig(runtimeOptions.taskConfigPath);

  const resolvedRulepacks = resolveEvaluationScopes({
    scopes: taskConfig.evaluation_scopes,
    rulepacksRoot: runtimeOptions.rulepacksRoot,
  });
  const executionPlans = buildExecutionPlans({
    workspaceRoot: runtimeOptions.targetPath,
    taskConfig,
    resolvedRulepacks,
  });
  const evaluationProfile = buildEvaluationProfile({
    taskConfig,
    resolvedRulepacks,
  });
  const comparisonArtifacts = loadComparisonArtifacts(
    runtimeOptions,
    evaluationProfile.hash,
  );
  const envSnapshot = getEnvSnapshot({
    rulepack: {
      tool_versions: collectToolVersions(resolvedRulepacks),
    },
  });

  const scopeResults = await runScopeEvaluations({
    executionPlans,
    taskConfig,
    runtimeOptions,
  });
  const postEvaluation = {
    target: { workspace_path: runtimeOptions.targetPath },
    scopes: scopeResults,
  };
  const postSnapshot = buildEvaluationSnapshot(postEvaluation);
  const baselineSnapshot = buildEvaluationSnapshot(
    comparisonArtifacts.baseline?.evaluation ?? postEvaluation,
  );
  const preSnapshot = buildEvaluationSnapshot(
    comparisonArtifacts.pre?.evaluation ?? postEvaluation,
  );
  const deltas = calculateDeltas({
    baselineSnapshot,
    preSnapshot,
    postSnapshot,
  });
  applyBaselineMetricDeltas(scopeResults, deltas.trajectory_cumulative);

  const runId = runtimeOptions.runId ?? `run_${Date.now()}`;
  const postReference = {
    path: null,
    sha256: null,
    run_id: runId,
    post_commit: runtimeOptions.postCommit,
  };
  const evaluationResult = {
    schema_version: '0.3.0',
    evaluation_profile_hash: evaluationProfile.hash,
    run_id: runId,
    trajectory_id: runtimeOptions.trajectoryId ?? 'traj_pending',
    task_id: manifestContext.task_id,
    rulepack_id: manifestContext.rulepack_id,
    target: {
      workspace_path: runtimeOptions.targetPath,
      pre_commit: runtimeOptions.preCommit,
      post_commit: runtimeOptions.postCommit,
      baseline_commit: manifestContext.baseline_commit,
    },
    comparison: buildComparison({
      runtimeOptions,
      artifacts: comparisonArtifacts,
      postReference,
    }),
    env_snapshot: envSnapshot,
    layers: aggregateLayers(scopeResults),
    scopes: scopeResults,
    task_summary: {
      scope_count: scopeResults.length,
      scope_types: countScopeTypes(scopeResults),
      execution: taskConfig.execution,
    },
    deltas,
    duration_ms: Date.now() - startedAt,
    execution_status: deriveExecutionStatus(scopeResults),
    comparison_status: 'valid',
    errors: collectErrors(scopeResults),
  };

  writeEvaluation({
    evaluationPath: runtimeOptions.outputPath,
    evaluationData: evaluationResult,
    manifestPath: runtimeOptions.manifestPath,
  });

  return evaluationResult;
}


// Parse CLI options, execute one evaluation, and expose failures as a nonzero exit.
async function main() {
  const runtimeOptions = parseRuntimeOptions(process.argv.slice(2));
  await runEvaluation(runtimeOptions);
  console.log('[Harness Engine] Evaluation pipeline completed successfully.');
}

main().catch((error) => {
  console.error(`[Harness Fatal] ${error.stack}`);
  process.exit(1);
});
