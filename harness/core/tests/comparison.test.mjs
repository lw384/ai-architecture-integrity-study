import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { calculateDeltas } from '../aggregators/delta_aggregator.mjs';
import { buildEvaluationProfile } from '../comparison/evaluation_profile.mjs';
import { readTaskConfig } from '../io/task_config_reader.mjs';
import { resolveEvaluationScopes } from '../runtime/rulepack_resolver.mjs';
import { parseRuntimeOptions } from '../runtime/runtime_options.mjs';

const HARNESS_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);

// Build the minimal normalized snapshot shape used by delta unit tests.
function snapshot({ constraints = [], metrics = [] } = {}) {
  return { constraints, metrics, judgments: [] };
}

// Build a stable synthetic constraint finding for multiset comparison tests.
function finding(fingerprint, message = fingerprint) {
  return {
    fingerprint,
    scope: 'backend',
    rule_id: 'BE-TEST-C-001',
    source_rule_id: null,
    location: null,
    message,
  };
}

// Resolve one task exactly as production does and return its semantic profile hash.
function profileForTask(taskId) {
  const taskConfig = readTaskConfig(
    path.join(HARNESS_ROOT, 'tasks', `${taskId}.eval.yaml`),
  );
  const rulepacksRoot = path.join(HARNESS_ROOT, 'rulepacks');
  const resolvedRulepacks = resolveEvaluationScopes({
    scopes: taskConfig.evaluation_scopes,
    rulepacksRoot,
  });

  return buildEvaluationProfile({
    taskConfig,
    resolvedRulepacks,
  }).hash;
}

test('task config exposes subject and cross-stack checks as uniform scopes', () => {
  const taskConfig = readTaskConfig(
    path.join(HARNESS_ROOT, 'tasks', 'Base.eval.yaml'),
  );

  assert.deepEqual(
    taskConfig.evaluation_scopes.map((scope) => [
      scope.scope_id,
      scope.scope_type,
      scope.root_path,
    ]),
    [
      ['backend', 'subject', 'backend/'],
      ['frontend', 'subject', 'frontend/'],
      ['cross-stack', 'cross-stack', '.'],
    ],
  );
});

test('self comparison produces zero deltas', () => {
  const current = snapshot({
    constraints: [finding('same')],
    metrics: [
      {
        key: 'backend:metric',
        name: 'metric',
        scope: 'backend',
        value: 12,
        direction: 'lower_is_better',
      },
    ],
  });
  const deltas = calculateDeltas({
    baselineSnapshot: current,
    preSnapshot: current,
    postSnapshot: current,
  });

  assert.equal(deltas.run_local.constraints.net_change, 0);
  assert.equal(deltas.run_local.constraints.unchanged_count, 1);
  assert.equal(deltas.run_local.metrics[0].delta, 0);
  assert.deepEqual(deltas.run_local, deltas.trajectory_cumulative);
});

test('constraint comparison preserves duplicate finding multiplicity', () => {
  const baseline = snapshot({ constraints: [finding('old'), finding('same')] });
  const pre = snapshot({
    constraints: [finding('same'), finding('duplicate'), finding('duplicate')],
  });
  const post = snapshot({
    constraints: [finding('same'), finding('duplicate'), finding('new')],
  });
  const deltas = calculateDeltas({
    baselineSnapshot: baseline,
    preSnapshot: pre,
    postSnapshot: post,
  });

  assert.equal(deltas.run_local.constraints.introduced_count, 1);
  assert.equal(deltas.run_local.constraints.resolved_count, 1);
  assert.equal(deltas.run_local.constraints.unchanged_count, 2);
  assert.equal(deltas.trajectory_cumulative.constraints.introduced_count, 2);
  assert.equal(deltas.trajectory_cumulative.constraints.resolved_count, 1);
});

test('a missing source metric is unavailable instead of NaN', () => {
  const post = snapshot({
    metrics: [
      {
        key: 'frontend:new-metric',
        name: 'new-metric',
        scope: 'frontend',
        value: 4,
        direction: 'lower_is_better',
      },
    ],
  });
  const deltas = calculateDeltas({
    baselineSnapshot: snapshot(),
    preSnapshot: snapshot(),
    postSnapshot: post,
  });

  assert.equal(deltas.run_local.metrics[0].status, 'unavailable');
  assert.equal(deltas.run_local.metrics[0].delta, null);
});

test('Base, T0, and trajectory tasks share one semantic evaluation profile', () => {
  const hashes = ['Base', 'T0', 'T1', 'T2', 'T3'].map(profileForTask);
  assert.equal(new Set(hashes).size, 1);
});

test('comparison CLI modes enforce artifact invariants', () => {
  const common = [
    '--target',
    'target',
    '--task-config',
    'task.yaml',
    '--rulepack',
    'rulepacks',
    '--pre-commit',
    'pre',
    '--post-commit',
    'post',
  ];

  const selfOptions = parseRuntimeOptions(
    [...common, '--comparison-mode', 'self'],
    '/tmp',
  );
  assert.equal(selfOptions.comparisonMode, 'self');
  assert.throws(
    () =>
      parseRuntimeOptions(
        [
          ...common,
          '--comparison-mode',
          'trajectory',
          '--baseline-evaluation',
          'baseline.json',
        ],
        '/tmp',
      ),
    /requires both/,
  );
});
