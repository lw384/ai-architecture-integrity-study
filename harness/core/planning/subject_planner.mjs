/*
 * Retired planner retained as commented migration history.
 * scope_planner.mjs now handles subject and cross-stack scopes uniformly.
 *
 * Copy enabled rule selections into a planning-safe object.
 *
 * function buildRuleSelection(enabled) {
 *   return {
 *     constraints: [...enabled.constraints],
 *     metrics: [...enabled.metrics],
 *     judgments: [...enabled.judgments],
 *   };
 * }
 *
 * Index resolved rulepacks by the former subject identifier.
 *
 * function indexBySubjectId(resolvedRulepacks) {
 *   return new Map(
 *     resolvedRulepacks.map((entry) => [entry.subjectId, entry]),
 *   );
 * }
 *
 * Build execution plans for the former subjects collection.
 *
 * export function buildSubjectExecutionPlans({
 *   workspaceRoot,
 *   taskConfig,
 *   resolvedRulepacks,
 * }) {
 *   const rulepackBySubjectId = indexBySubjectId(resolvedRulepacks);
 *
 *   return taskConfig.subjects.map((subject) => {
 *     const resolvedRulepack = rulepackBySubjectId.get(subject.subject_id);
 *     if (!resolvedRulepack) {
 *       throw new Error(
 *         `[Harness Error] No resolved rulepack found for subject ${subject.subject_id}.`,
 *       );
 *     }
 *
 *     return {
 *       subjectId: subject.subject_id,
 *       subjectRoot: path.resolve(workspaceRoot, subject.root_path),
 *       rulepackId: resolvedRulepack.rulepackId,
 *       rulepackDir: resolvedRulepack.rulepackDir,
 *       rulepackManifest: resolvedRulepack.manifest,
 *       enabled: buildRuleSelection(subject.enabled),
 *       thresholds: subject.thresholds ?? {},
 *       expectedDiffScope: subject.expected_diff_scope ?? [],
 *       metadata: subject.metadata ?? {},
 *     };
 *   });
 * }
 *
 * Build the former optional cross-stack execution plan.
 *
 * export function buildCrossStackExecutionPlan({
 *   workspaceRoot,
 *   taskConfig,
 *   resolvedRulepack,
 * }) {
 *   if (!taskConfig.cross_stack || !resolvedRulepack) {
 *     return null;
 *   }
 *
 *   return {
 *     planId: 'cross-stack',
 *     workspaceRoot,
 *     rulepackId: resolvedRulepack.rulepackId,
 *     rulepackDir: resolvedRulepack.rulepackDir,
 *     rulepackManifest: resolvedRulepack.manifest,
 *     enabled: buildRuleSelection(taskConfig.cross_stack.enabled),
 *     thresholds: taskConfig.cross_stack.thresholds ?? {},
 *     expectedDiffScope: taskConfig.cross_stack.expected_diff_scope ?? [],
 *     metadata: taskConfig.cross_stack.metadata ?? {},
 *   };
 * }
 */
