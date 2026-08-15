// Input: raw CLI argv and an optional current working directory.
// Output: normalized paths, commit identities, and comparison artifacts.
import path from 'node:path';
import { parseArgs } from 'node:util';

const COMPARISON_MODES = new Set(['self', 'trajectory']);

const cliOptions = {
  target: { type: 'string' },
  manifest: { type: 'string' },
  'task-config': { type: 'string' },
  rulepack: { type: 'string' },
  output: { type: 'string' },
  baseline: { type: 'string' },
  'pre-commit': { type: 'string' },
  'post-commit': { type: 'string' },
  'run-id': { type: 'string' },
  'trajectory-id': { type: 'string' },
  mode: { type: 'string', default: 'full' },
  'comparison-mode': { type: 'string' },
  'baseline-evaluation': { type: 'string' },
  'pre-evaluation': { type: 'string' },
};

// Resolve an optional CLI path relative to the invocation directory.
function resolveOptionalPath(cwd, value) {
  return value ? path.resolve(cwd, value) : null;
}

// Return one required CLI value or fail with its user-facing option name.
function requireOption(values, optionName) {
  const value = values[optionName];
  if (!value) {
    throw new Error(`[Harness Error] Missing required CLI option: --${optionName}`);
  }
  return value;
}

// Enforce mutually exclusive self and trajectory artifact requirements.
function parseComparisonOptions(values, cwd) {
  const comparisonMode = requireOption(values, 'comparison-mode');
  if (!COMPARISON_MODES.has(comparisonMode)) {
    throw new Error(
      `[Harness Error] Unsupported --comparison-mode: ${comparisonMode}`,
    );
  }

  const baselineEvaluationPath = resolveOptionalPath(
    cwd,
    values['baseline-evaluation'],
  );
  const preEvaluationPath = resolveOptionalPath(cwd, values['pre-evaluation']);

  if (comparisonMode === 'self') {
    if (baselineEvaluationPath || preEvaluationPath) {
      throw new Error(
        '[Harness Error] self comparison must not receive evaluation artifacts',
      );
    }
  } else if (!baselineEvaluationPath || !preEvaluationPath) {
    throw new Error(
      '[Harness Error] trajectory comparison requires both ' +
        '--baseline-evaluation and --pre-evaluation',
    );
  }

  return {
    comparisonMode,
    baselineEvaluationPath,
    preEvaluationPath,
  };
}

/**
 * Strictly parse the Node CLI boundary and normalize every filesystem path.
 * The returned object is the only runtime-options shape consumed by evaluate.mjs.
 */
export function parseRuntimeOptions(argv, cwd = process.cwd()) {
  const { values } = parseArgs({
    args: argv,
    options: cliOptions,
    strict: true,
    allowPositionals: false,
  });

  const targetPath = path.resolve(cwd, requireOption(values, 'target'));
  const taskConfigPath = path.resolve(
    cwd,
    requireOption(values, 'task-config'),
  );
  const rulepacksRoot = path.resolve(cwd, requireOption(values, 'rulepack'));
  const preCommit = requireOption(values, 'pre-commit');
  const postCommit = requireOption(values, 'post-commit');
  const comparison = parseComparisonOptions(values, cwd);

  return {
    mode: values.mode, // Reserved for future layer-selective execution.
    targetPath,
    manifestPath:
      resolveOptionalPath(cwd, values.manifest) ??
      path.join(targetPath, 'manifest.json'),
    taskConfigPath,
    rulepacksRoot,
    outputPath:
      resolveOptionalPath(cwd, values.output) ??
      path.join(targetPath, 'evaluation.json'),
    baselinePath: resolveOptionalPath(cwd, values.baseline),
    preCommit,
    postCommit,
    runId: values['run-id'] ?? null,
    trajectoryId: values['trajectory-id'] ?? null,
    ...comparison,
  };
}
