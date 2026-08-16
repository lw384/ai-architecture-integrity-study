import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { load } from 'js-yaml';

import { readTaskConfig } from '../io/task_config_reader.mjs';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const harnessRoot = path.resolve(testDir, '../..');
const computedAdapterRoot = path.join(harnessRoot, 'adapters/computed-metrics');
const implementationsRoot = path.join(harnessRoot, 'adapters/computed-metrics/implementations');

function readYaml(filePath) {
    return load(fs.readFileSync(filePath, 'utf8'));
}

function listFiles(rootDir, predicate) {
    const files = [];

    for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
        const entryPath = path.join(rootDir, entry.name);
        if (entry.isDirectory()) {
            files.push(...listFiles(entryPath, predicate));
        } else if (predicate(entryPath)) {
            files.push(entryPath);
        }
    }

    return files;
}

test('every ID-named computed metric implementation ends in M-001', () => {
    const implementationFiles = ['backend', 'frontend', 'cross'].flatMap((scope) =>
        listFiles(
            path.join(implementationsRoot, scope),
            (filePath) => /\b(?:BE|FE|CROSS)-[A-Z]+-M-\d{3}\.mjs$/.test(filePath),
        )
    );

    assert.ok(implementationFiles.length > 0);
    for (const filePath of implementationFiles) {
        assert.match(path.basename(filePath), /-M-001\.mjs$/, filePath);
    }
});

test('every computed-metrics YAML rule uses an M-001 rule and implementation ID', () => {
    for (const rulepackId of ['ts-nestjs-backend', 'js-react-frontend', 'cross']) {
        const rulepackDir = path.join(harnessRoot, 'rulepacks', rulepackId);
        const manifest = readYaml(path.join(rulepackDir, 'manifest.yaml'));

        for (const rulePath of manifest.rules.metrics) {
            const rule = readYaml(path.join(rulepackDir, rulePath));
            if (rule.adapter !== 'computed-metrics') {
                continue;
            }

            assert.match(rule.rule_id, /-M-001(?:-|$)/, rule.rule_id);
            assert.match(rule.implementation, /-M-001$/, rule.rule_id);
        }
    }
});

test('every task metric selector resolves exactly one manifest rule after renaming', () => {
    const scopes = {
        backend: 'ts-nestjs-backend',
        frontend: 'js-react-frontend',
        'cross-stack': 'cross',
    };

    for (const taskName of ['Base', 'T1', 'T2', 'T3']) {
        const task = readTaskConfig(path.join(harnessRoot, `tasks/${taskName}.eval.yaml`));

        for (const [scopeId, rulepackId] of Object.entries(scopes)) {
            const scope = task.evaluation_scopes.find((candidate) => candidate.scope_id === scopeId);
            const manifest = readYaml(path.join(harnessRoot, 'rulepacks', rulepackId, 'manifest.yaml'));

            for (const enabledId of scope.enabled.metrics) {
                const matches = manifest.rules.metrics.filter((rulePath) => {
                    const name = path.basename(rulePath, '.yaml');
                    return name === enabledId || name.startsWith(`${enabledId}-`);
                });
                assert.equal(matches.length, 1, `${taskName}/${scopeId}/${enabledId}`);
            }
        }
    }
});

test('every implementation file is reachable from a registered computed metric', () => {
    const entryPoints = [];

    for (const rulepackId of ['ts-nestjs-backend', 'js-react-frontend', 'cross']) {
        const rulepackDir = path.join(harnessRoot, 'rulepacks', rulepackId);
        const manifest = readYaml(path.join(rulepackDir, 'manifest.yaml'));
        const adapter = manifest.adapters['computed-metrics'];
        const implementationRoot = path.resolve(
            computedAdapterRoot,
            adapter.options?.implementations_root ?? 'implementations',
        );

        for (const rulePath of manifest.rules.metrics) {
            const rule = readYaml(path.join(rulepackDir, rulePath));
            if (rule.adapter === 'computed-metrics') {
                entryPoints.push(path.join(implementationRoot, `${rule.implementation}.mjs`));
            }
        }
    }

    const reachable = new Set();
    const visit = (filePath) => {
        const normalizedPath = path.resolve(filePath);
        if (reachable.has(normalizedPath)) {
            return;
        }

        assert.ok(fs.existsSync(normalizedPath), `missing implementation dependency: ${normalizedPath}`);
        reachable.add(normalizedPath);

        const source = fs.readFileSync(normalizedPath, 'utf8');
        const importPattern = /\bfrom\s*['"]([^'"]+)['"]/g;
        for (const match of source.matchAll(importPattern)) {
            if (!match[1].startsWith('.')) {
                continue;
            }

            const importedPath = path.resolve(path.dirname(normalizedPath), match[1]);
            const resolvedImport = path.extname(importedPath) ? importedPath : `${importedPath}.mjs`;
            if (resolvedImport.startsWith(`${implementationsRoot}${path.sep}`)) {
                visit(resolvedImport);
            }
        }
    };

    entryPoints.forEach(visit);
    const implementationFiles = listFiles(implementationsRoot, (filePath) => filePath.endsWith('.mjs'))
        .map((filePath) => path.resolve(filePath))
        .sort();

    assert.deepEqual([...reachable].sort(), implementationFiles);
});
