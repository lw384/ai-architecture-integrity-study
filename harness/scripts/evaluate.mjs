#!/usr/bin/env node
/**
 * Usage: node harness/scripts/evaluate.mjs <path-to-code-dir>
 *
 * Evaluates a CRM backend directory and writes:
 *   reports/<dir-name>/report.json
 *   reports/<dir-name>/report.md
 *   reports/<dir-name>/depcruise-raw.json
 *   reports/summary.csv  (appended)
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { mkdir, writeFile, appendFile, access } from 'fs/promises';
import { existsSync } from 'fs';
import { countLOC } from './metrics/util.mjs';
import { runArchitectureMetrics } from './metrics/architecture.mjs';
import { runQualityMetrics } from './metrics/quality.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HARNESS_DIR  = path.resolve(__dirname, '..');
const REPORTS_DIR  = path.join(HARNESS_DIR, 'reports');
const SUMMARY_CSV  = path.join(REPORTS_DIR, 'summary.csv');
const CSV_HEADER   =
  'timestamp,name,targetDir,loc,' +
  'arch_violations,arch_violationsPerKLOC,arch_cycles,arch_cyclesPerKLOC,' +
  'arch_moduleCount,arch_dependencyCount,arch_graphDensity,' +
  'lint_errors,lint_errorsPerKLOC,lint_warnings,lint_warningsPerKLOC,' +
  'test_total,test_passed,test_failed,test_passRate,' +
  'security_findings,security_findingsPerKLOC,security_skipped\n';

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const targetArg = process.argv[2];
  if (!targetArg) {
    console.error('Usage: node harness/scripts/evaluate.mjs <path-to-code-dir>');
    process.exit(1);
  }

  const targetDir = path.resolve(targetArg);
  try {
    await access(targetDir);
  } catch {
    console.error(`Error: directory not found: ${targetDir}`);
    process.exit(1);
  }

  const dirName   = path.basename(targetDir);
  const reportDir = path.join(REPORTS_DIR, dirName);
  await mkdir(reportDir, { recursive: true });

  console.log(`\nEvaluating: ${targetDir}`);

  // --- LOC ---
  process.stdout.write('  [1/4] Counting LOC ...');
  const loc = await countLOC(targetDir);
  console.log(` ${loc} lines`);

  // --- Architecture ---
  process.stdout.write('  [2/4] Architecture (dependency-cruiser) ...');
  const archRaw = await runArchitectureMetrics(targetDir, loc);
  const { rawData, ...arch } = archRaw;
  console.log(
    arch.error
      ? ` ERROR: ${arch.error}`
      : ` ${arch.violations} violations, ${arch.cycles} cycles`
  );

  if (rawData) {
    await writeFile(
      path.join(reportDir, 'depcruise-raw.json'),
      JSON.stringify(rawData, null, 2)
    );
  }

  // --- Quality (lint + tests + semgrep, all parallel) ---
  process.stdout.write('  [3/4] Quality (eslint + vitest + semgrep) ...');
  const quality = await runQualityMetrics(targetDir, loc);
  console.log(
    ` lint:${quality.lint.errors ?? '?'}err  tests:${quality.tests.passRate ?? 'N/A'}%  semgrep:${
      quality.security.skipped ? 'skipped' : (quality.security.findings ?? '?') + ' findings'
    }`
  );

  // --- Assemble report ---
  const report = {
    meta: {
      targetDir,
      name: dirName,
      timestamp: new Date().toISOString(),
      loc
    },
    architecture: arch,
    quality
  };

  process.stdout.write('  [4/4] Writing reports ...');

  await Promise.all([
    writeFile(path.join(reportDir, 'report.json'), JSON.stringify(report, null, 2)),
    writeFile(path.join(reportDir, 'report.md'), generateMarkdown(report)),
    appendSummaryCSV(report)
  ]);

  console.log(' done\n');
  console.log(`  reports/${dirName}/report.json`);
  console.log(`  reports/${dirName}/report.md`);
  if (rawData) console.log(`  reports/${dirName}/depcruise-raw.json`);
  console.log(`  reports/summary.csv  (appended)`);
  console.log();
}

// ---------------------------------------------------------------------------
// Markdown renderer
// ---------------------------------------------------------------------------

function generateMarkdown(report) {
  const { meta, architecture: arch, quality } = report;
  const { lint, tests, security } = quality;

  const archTable = arch.error
    ? `> ⚠️ Analysis error: ${arch.error}\n`
    : `| Metric | Raw | Per KLOC |
|--------|----:|---------:|
| Violations | ${arch.violations} | ${arch.violationsPerKLOC} |
| Cycles | ${arch.cycles} | ${arch.cyclesPerKLOC} |
| Modules | ${arch.moduleCount} | — |
| Dependencies | ${arch.dependencyCount} | — |
| Graph Density | ${arch.graphDensity} | — |
`;

  const lintTable = lint.error
    ? `> ⚠️ ${lint.error}\n`
    : `| Metric | Raw | Per KLOC |
|--------|----:|---------:|
| Errors | ${lint.errors} | ${lint.errorsPerKLOC} |
| Warnings | ${lint.warnings} | ${lint.warningsPerKLOC} |
`;

  const testTable = tests.error
    ? `> ⚠️ ${tests.error}\n`
    : `| Metric | Value |
|--------|------:|
| Total | ${tests.total} |
| Passed | ${tests.passed} |
| Failed | ${tests.failed} |
| Pass Rate | ${tests.passRate !== null ? tests.passRate + '%' : 'N/A'} |
`;

  const semgrepTable = security.skipped
    ? `> ℹ️ Skipped: ${security.reason}\n`
    : security.error
      ? `> ⚠️ ${security.error}\n`
      : `| Metric | Raw | Per KLOC |
|--------|----:|---------:|
| Findings | ${security.findings} | ${security.findingsPerKLOC} |
`;

  return `# Evaluation Report: ${meta.name}

**Target:** \`${meta.targetDir}\`
**Timestamp:** ${meta.timestamp}
**LOC:** ${meta.loc.toLocaleString()}

---

## Architecture Metrics

${archTable}
---

## Quality Metrics

### Lint (ESLint)

${lintTable}
### Tests (Vitest)

${testTable}
### Security (Semgrep)

${semgrepTable}
`;
}

// ---------------------------------------------------------------------------
// CSV summary
// ---------------------------------------------------------------------------

async function appendSummaryCSV(report) {
  if (!existsSync(SUMMARY_CSV)) {
    await writeFile(SUMMARY_CSV, CSV_HEADER);
  }

  const { meta, architecture: arch, quality } = report;
  const { lint, tests, security } = quality;

  const row = [
    meta.timestamp,
    meta.name,
    meta.targetDir,
    meta.loc,
    arch.violations        ?? '',
    arch.violationsPerKLOC ?? '',
    arch.cycles            ?? '',
    arch.cyclesPerKLOC     ?? '',
    arch.moduleCount       ?? '',
    arch.dependencyCount   ?? '',
    arch.graphDensity      ?? '',
    lint.errors            ?? '',
    lint.errorsPerKLOC     ?? '',
    lint.warnings          ?? '',
    lint.warningsPerKLOC   ?? '',
    tests.total            ?? '',
    tests.passed           ?? '',
    tests.failed           ?? '',
    tests.passRate         ?? '',
    security.findings      ?? '',
    security.findingsPerKLOC ?? '',
    security.skipped       ?? ''
  ].join(',');

  await appendFile(SUMMARY_CSV, row + '\n');
}

main().catch(err => {
  console.error('\nFatal error:', err);
  process.exit(1);
});
