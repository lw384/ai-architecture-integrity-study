// Input: normalized task config, workspace root, and resolved rulepack contexts.
// Output: one executable plan per evaluation scope.
import path from 'node:path';

// Copy enabled lists so execution plans cannot mutate normalized task configuration.
function copyRuleSelection(enabled) {
  return {
    constraints: [...enabled.constraints],
    metrics: [...enabled.metrics],
    judgments: [...enabled.judgments],
  };
}

// Index resolver output by scope ID for deterministic plan assembly.
function indexRulepacksByScopeId(resolvedRulepacks) {
  return new Map(resolvedRulepacks.map((entry) => [entry.scopeId, entry]));
}

/**
 * Join each normalized scope with its resolved rulepack and absolute target root.
 * The resulting plans contain only data required by layer execution.
 */
export function buildExecutionPlans({
  workspaceRoot,
  taskConfig,
  resolvedRulepacks,
}) {
  const rulepackByScopeId = indexRulepacksByScopeId(resolvedRulepacks);

  return taskConfig.evaluation_scopes.map((scope) => {
    const resolvedRulepack = rulepackByScopeId.get(scope.scope_id);

    if (!resolvedRulepack) {
      throw new Error(
        `[Harness Error] No resolved rulepack found for scope ${scope.scope_id}.`,
      );
    }

    return {
      scopeId: scope.scope_id,
      scopeType: scope.scope_type,
      relativeRoot: scope.root_path,
      targetRoot: path.resolve(workspaceRoot, scope.root_path),
      rulepackId: resolvedRulepack.rulepackId,
      rulepackDir: resolvedRulepack.rulepackDir,
      rulepackManifest: resolvedRulepack.manifest,
      enabled: copyRuleSelection(scope.enabled),
      thresholds: scope.thresholds ?? {},
    };
  });
}
