import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { runCommand, perKLOC } from './util.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HARNESS_DIR = path.resolve(__dirname, '../..');
const CONFIG_PATH = path.resolve(__dirname, '../dependency-cruiser.config.cjs');

/**
 * Run dependency-cruiser on targetDir and derive architecture metrics.
 * Returns the metrics object; rawData is attached for the caller to persist separately.
 */
export async function runArchitectureMetrics(targetDir, loc) {
  const tsConfigPath = path.join(targetDir, 'tsconfig.json');
  const tsConfigArg = existsSync(tsConfigPath)
    ? `--ts-config "${tsConfigPath}"`
    : '';

  const { stdout, stderr, code } = await runCommand(
    `npx depcruise ${tsConfigArg} --config "${CONFIG_PATH}" --output-type json "${targetDir}"`,
    HARNESS_DIR,
    { ignoreError: true }
  );

  if (!stdout.trim()) {
    return {
      error: `dependency-cruiser produced no output (exit ${code}): ${stderr.slice(0, 300)}`,
      violations: 0, violationsPerKLOC: 0,
      cycles: 0, cyclesPerKLOC: 0,
      moduleCount: 0, dependencyCount: 0, graphDensity: 0
    };
  }

  let data;
  try {
    data = JSON.parse(stdout);
  } catch {
    return {
      error: 'Failed to parse dependency-cruiser JSON output',
      violations: 0, violationsPerKLOC: 0,
      cycles: 0, cyclesPerKLOC: 0,
      moduleCount: 0, dependencyCount: 0, graphDensity: 0
    };
  }

  // summary.violations is the authoritative list of rule hits
  const allViolations = data.summary?.violations ?? [];
  const violations = allViolations.filter(
    v => v.rule?.severity === 'error' || v.rule?.severity === 'warn'
  ).length;
  const cycles = allViolations.filter(v => v.rule?.name === 'no-circular').length;

  // Graph-level stats from the modules array
  const modules = data.modules ?? [];
  const moduleCount = modules.length;
  const dependencyCount = modules.reduce(
    (sum, m) => sum + (m.dependencies?.length ?? 0), 0
  );
  const maxPossibleEdges = moduleCount * (moduleCount - 1);
  const graphDensity = maxPossibleEdges > 0
    ? parseFloat((dependencyCount / maxPossibleEdges).toFixed(4))
    : 0;

  return {
    violations,
    violationsPerKLOC: perKLOC(violations, loc),
    cycles,
    cyclesPerKLOC: perKLOC(cycles, loc),
    moduleCount,
    dependencyCount,
    graphDensity,
    rawData: data   // caller strips this before writing report.json
  };
}
