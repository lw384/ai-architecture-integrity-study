import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Create a complete error-first result template for one judgment rule.
function createResult(ruleName) {
  return {
    name: ruleName,
    version: 'unknown',
    status: 'error',
    score: null,
    kappa: null,
    findings: [],
    raw_artifact_path: `artifacts/judgments/${ruleName}.json`,
  };
}

// Fail otherwise successful judgments when sample agreement is below policy.
function judgeAgreement(executionResult, minimumKappa) {
  if (
    typeof executionResult.kappa === 'number' &&
    executionResult.kappa < minimumKappa
  ) {
    return {
      status: 'fail',
      finding: `Kappa ${executionResult.kappa} is below ${minimumKappa}`,
    };
  }
  return { status: 'pass', finding: null };
}

/**
 * Execute enabled LLM judgment modules and normalize score, agreement, and samples.
 * Rule failures are isolated so one judgment does not abort the remaining rules.
 */
export async function runJudgments({
  targetDir,
  baselineDir,
  rulepackDir,
  taskConfig,
  llmClient,
}) {
  const enabledRules = taskConfig.enabled?.judgments ?? [];
  const judgmentConfig = taskConfig.judgment_config ?? {};
  const results = [];

  for (const ruleName of enabledRules) {
    const resultTemplate = createResult(ruleName);

    try {
      const modulePath = path.resolve(
        rulepackDir,
        'judgments',
        `${ruleName}.mjs`,
      );
      const ruleModule = await import(pathToFileURL(modulePath).href);
      if (typeof ruleModule.run !== 'function') {
        throw new Error(`Rule module ${ruleName} does not export run`);
      }

      const executionResult = await ruleModule.run({
        targetDir,
        baselineDir,
        llmClient,
        samples: judgmentConfig.samples_per_rubric ?? 1,
        model: judgmentConfig.model,
        temperature: judgmentConfig.temperature ?? 0,
      });
      const agreement = judgeAgreement(
        executionResult,
        judgmentConfig.min_kappa ?? 0,
      );
      const findings = [...(executionResult.findings ?? [])];
      if (agreement.finding) {
        findings.push(agreement.finding);
      }

      results.push({
        ...resultTemplate,
        version: ruleModule.VERSION ?? '1.0.0',
        status: agreement.status,
        score: executionResult.score ?? null,
        kappa: executionResult.kappa ?? null,
        per_sample_results: executionResult.per_sample_results ?? [],
        findings,
        raw_artifact_path:
          executionResult.raw_artifact_path ??
          resultTemplate.raw_artifact_path,
      });
    } catch (error) {
      results.push({
        ...resultTemplate,
        findings: [`LLM judgment runner crashed: ${error.message}`],
      });
    }
  }

  return results;
}
