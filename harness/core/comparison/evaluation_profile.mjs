import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CORE_DIRECTORY = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const ADAPTERS_DIRECTORY = path.resolve(CORE_DIRECTORY, '..', 'adapters');

// Recursively sort object keys so equivalent profiles serialize identically.
function stableValue(value) {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stableValue(child)]),
    );
  }
  return value;
}

// Return the lowercase hexadecimal SHA-256 digest of a buffer or string.
function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

// Hash one file as raw bytes to capture any implementation change.
function hashFile(filePath) {
  return sha256(fs.readFileSync(filePath));
}

// Recursively list all regular files below a directory.
function listFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? listFiles(entryPath) : [entryPath];
  });
}

// Build a stable relative-path and content-hash inventory for a directory.
function hashDirectory(directory, includeFile = () => true) {
  return listFiles(directory)
    .filter(includeFile)
    .sort()
    .map((filePath) => ({
      path: path.relative(directory, filePath),
      sha256: hashFile(filePath),
    }));
}

// Sort enabled rule IDs within each layer before profile serialization.
function normalizeSelection(enabled) {
  return Object.fromEntries(
    Object.entries(enabled).map(([layer, ruleIds]) => [layer, [...ruleIds].sort()]),
  );
}

// Retain only scope fields that can change evaluation semantics.
function normalizeScope(scope) {
  return {
    scope_id: scope.scope_id,
    scope_type: scope.scope_type,
    root_path: scope.root_path,
    rulepack_id: scope.rulepack_id,
    rulepack_version: scope.rulepack_version ?? null,
    enabled: normalizeSelection(scope.enabled),
    thresholds: scope.thresholds,
  };
}

// Avoid hashing inactive judgment settings when no scope enables judgments.
function hasEnabledJudgments(taskConfig) {
  return taskConfig.evaluation_scopes.some(
    (scope) => scope.enabled.judgments.length > 0,
  );
}

/**
 * Hash the complete measurement definition used by an evaluation.
 * The profile covers normalized scopes, rulepacks, Core code, schemas, and
 * adapters so incompatible artifacts cannot participate in one comparison.
 */
export function buildEvaluationProfile({
  taskConfig,
  resolvedRulepacks,
}) {
  const rulepacks = resolvedRulepacks
    .map((rulepack) => rulepack.rulepackDir)
    .filter(
      (directory, index, directories) =>
        directories.indexOf(directory) === index,
    )
    .sort()
    .map((directory) => ({
      rulepack_id: path.basename(directory),
      files: hashDirectory(directory),
    }));

  const profile = stableValue({
    schema_version: '1.0.0',
    evaluation_scopes: taskConfig.evaluation_scopes.map(normalizeScope),
    judgment_config: hasEnabledJudgments(taskConfig)
      ? taskConfig.judgment_config
      : null,
    rulepacks,
    engine_files: hashDirectory(CORE_DIRECTORY, (filePath) =>
      ['.mjs', '.json'].includes(path.extname(filePath)) &&
      !filePath.includes(`${path.sep}tests${path.sep}`),
    ),
    adapter_files: hashDirectory(ADAPTERS_DIRECTORY, (filePath) =>
      ['.mjs', '.json'].includes(path.extname(filePath)),
    ),
  });

  return {
    // profile, // The serialized profile is redundant in the result artifact.
    hash: `sha256:${sha256(JSON.stringify(profile))}`,
  };
}
