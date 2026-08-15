import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { load } from 'js-yaml';

const HARNESS_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const RULEPACKS_ROOT = path.join(HARNESS_ROOT, 'rulepacks');

// Recursively collect rule declarations below one rulepack's rules directory.
function collectRuleFiles(directory) {
  if (!fs.existsSync(directory)) {
    return [];
  }

  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return collectRuleFiles(entryPath);
    }
    return entry.isFile() && entry.name.endsWith('.yaml') ? [entryPath] : [];
  });
}

// Flatten either manifest layout while retaining each rule's declared layer.
function collectRegisteredRulePaths(manifest) {
  const registered = {
    constraints: [],
    metrics: [],
    judgments: [],
  };

  if (manifest.rules_matrix) {
    for (const entry of Object.values(manifest.rules_matrix)) {
      for (const layer of Object.keys(registered)) {
        registered[layer].push(...(entry[layer] ?? []));
      }
    }
  } else {
    for (const layer of Object.keys(registered)) {
      registered[layer].push(...(manifest.rules?.[layer] ?? []));
    }
  }

  return Object.fromEntries(
    Object.entries(registered).map(([layer, paths]) => [layer, new Set(paths)]),
  );
}

// Report every YAML that exists below rules/ but is absent from its manifest.
function findUnregisteredRules() {
  return fs
    .readdirSync(RULEPACKS_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const rulepackDir = path.join(RULEPACKS_ROOT, entry.name);
      const manifestPath = path.join(rulepackDir, 'manifest.yaml');
      if (!fs.existsSync(manifestPath)) {
        return [];
      }

      const manifest = load(fs.readFileSync(manifestPath, 'utf8'));
      const registered = collectRegisteredRulePaths(manifest);

      return collectRuleFiles(path.join(rulepackDir, 'rules'))
        .map((filePath) => ({
          filePath,
          relativePath: path.relative(rulepackDir, filePath),
          layer: load(fs.readFileSync(filePath, 'utf8'))?.layer ?? 'unknown',
        }))
        .filter(
          ({ relativePath, layer }) => !registered[layer]?.has(relativePath),
        )
        .map(
          ({ relativePath, layer }) =>
            `${entry.name}/${relativePath} (layer: ${layer})`,
        );
    })
    .sort();
}

test('all rule YAML files are registered in their rulepack manifest', () => {
  const unregistered = findUnregisteredRules();

  assert.deepEqual(
    unregistered,
    [],
    `Unregistered rule YAML files are silently excluded:\n${unregistered
      .map((rulePath) => `- ${rulePath}`)
      .join('\n')}`,
  );
});
