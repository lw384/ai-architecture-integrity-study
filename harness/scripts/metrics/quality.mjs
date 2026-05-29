import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { runCommand, perKLOC } from './util.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HARNESS_DIR = path.resolve(__dirname, '../..');
const ESLINT_FALLBACK = path.resolve(__dirname, '../.eslintrc-fallback.json');

export async function runQualityMetrics(targetDir, loc) {
  const [lint, tests, security] = await Promise.all([
    runLint(targetDir, loc),
    runTests(targetDir, loc),
    runSemgrep(targetDir, loc)
  ]);
  return { lint, tests, security };
}

// ---------------------------------------------------------------------------
// ESLint
// ---------------------------------------------------------------------------

async function runLint(targetDir, loc) {
  // Detect which eslint config style the target uses
  const v9Files = ['eslint.config.js', 'eslint.config.mjs', 'eslint.config.cjs'];
  const v8Files = ['.eslintrc', '.eslintrc.js', '.eslintrc.cjs', '.eslintrc.json',
                   '.eslintrc.yaml', '.eslintrc.yml'];

  const hasV9Config = v9Files.some(f => existsSync(path.join(targetDir, f)));
  const hasV8Config = v8Files.some(f => existsSync(path.join(targetDir, f)));

  // Also check package.json#eslintConfig
  let hasPkgConfig = false;
  try {
    const pkg = JSON.parse(await readFile(path.join(targetDir, 'package.json'), 'utf8'));
    hasPkgConfig = !!pkg.eslintConfig;
  } catch { /* no package.json */ }

  let result;

  if (hasV9Config) {
    // Target uses flat config — run from target dir with whatever eslint it has
    result = await runCommand(
      `npx eslint --format json .`,
      targetDir,
      { ignoreError: true }
    );
  } else if (hasV8Config || hasPkgConfig) {
    // Target has a legacy config; run from harness (our eslint) pointing at target
    result = await runCommand(
      `npx eslint --format json --ext .ts,.tsx,.js,.jsx,.mjs,.cjs "${targetDir}"`,
      HARNESS_DIR,
      { ignoreError: true }
    );
  } else {
    // No config found — use harness fallback
    result = await runCommand(
      `npx eslint --no-eslintrc -c "${ESLINT_FALLBACK}" --format json --ext .ts,.tsx,.js,.jsx,.mjs,.cjs "${targetDir}"`,
      HARNESS_DIR,
      { ignoreError: true }
    );
  }

  return parseLintOutput(result, loc);
}

function parseLintOutput(result, loc) {
  try {
    const data = JSON.parse(result.stdout);
    let errors = 0, warnings = 0;
    for (const file of data) {
      errors   += file.errorCount   ?? 0;
      warnings += file.warningCount ?? 0;
    }
    return { errors, warnings, errorsPerKLOC: perKLOC(errors, loc), warningsPerKLOC: perKLOC(warnings, loc) };
  } catch {
    const msg = result.stderr ? result.stderr.slice(0, 300) : 'no JSON output';
    return { error: `ESLint failed: ${msg}`, errors: 0, warnings: 0, errorsPerKLOC: 0, warningsPerKLOC: 0 };
  }
}

// ---------------------------------------------------------------------------
// Vitest
// ---------------------------------------------------------------------------

async function runTests(targetDir, loc) {
  // Run vitest from target dir; it will use local install if present, else npx downloads it
  const result = await runCommand(
    `npx vitest run --reporter=json --outputFile=/dev/stdout 2>/dev/null`,
    targetDir,
    { ignoreError: true }
  );

  // Vitest JSON reporter can also write to stdout directly (>=1.0)
  // Try parsing stdout; fall back to stderr scan for summary line
  try {
    const data = JSON.parse(result.stdout);
    const numTotal  = data.numTotalTests  ?? 0;
    const numPassed = data.numPassedTests ?? 0;
    const numFailed = data.numFailedTests ?? 0;
    return {
      total:    numTotal,
      passed:   numPassed,
      failed:   numFailed,
      passRate: numTotal > 0 ? parseFloat((numPassed / numTotal * 100).toFixed(1)) : null
    };
  } catch {
    // Vitest not installed or no test files
    return { error: 'vitest unavailable or no tests found', total: 0, passed: 0, failed: 0, passRate: null };
  }
}

// ---------------------------------------------------------------------------
// Semgrep
// ---------------------------------------------------------------------------

async function runSemgrep(targetDir, loc) {
  const available = await runCommand('which semgrep', process.cwd(), { ignoreError: true });
  if (available.code !== 0) {
    return { skipped: true, reason: 'semgrep not installed' };
  }

  const result = await runCommand(
    `semgrep --config=auto --json "${targetDir}"`,
    process.cwd(),
    { ignoreError: true }
  );

  try {
    const data = JSON.parse(result.stdout);
    const findings = (data.results ?? []).length;
    return { findings, findingsPerKLOC: perKLOC(findings, loc), skipped: false };
  } catch {
    return { error: 'semgrep produced unparseable output', findings: 0, findingsPerKLOC: 0, skipped: false };
  }
}
