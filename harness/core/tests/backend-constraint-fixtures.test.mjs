import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { runAdapter as runBackendStatic } from '../../adapters/backend-static/adapter.mjs';
import { runAdapter as runContractDiff } from '../../adapters/contract-diff/adapter.mjs';
import { runAdapter as runDepCruiser } from '../../adapters/dep-cruiser/adapter.mjs';
import { runAdapter as runEslint } from '../../adapters/eslint/adapter.mjs';
import { runConstraints } from '../layers/constraints_runner.mjs';
import { readTaskConfig } from '../io/task_config_reader.mjs';
import { isProductionSourcePath } from '../../adapters/_shared/production-files.mjs';
import { backendConstraintFixtures } from '../../rulepacks/ts-nestjs-backend/fixtures/backend-constraint-protocol.fixtures.mjs';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const harnessRoot = path.resolve(testDir, '../..');
const rulepackDir = path.join(harnessRoot, 'rulepacks/ts-nestjs-backend');
const canonicalRuleIds = [
    'BE-STRUCT-C-001',
    'BE-DEP-C-001',
    'BE-DEP-C-002',
    'BE-DEP-C-003',
    'BE-DEP-C-004',
    'BE-DOM-C-001',
    'BE-DOM-C-002',
    'BE-ERR-C-001',
    'BE-ERR-C-002',
    'BE-ERR-C-003',
    'BE-CONTRACT-C-001',
    'BE-CONTRACT-C-002',
    'BE-CONTRACT-C-003',
    'BE-CONTRACT-C-004',
    'BE-TEST-C-001',
    'BE-ROUTE-C-001',
    'BE-SIZE-C-001',
    'BE-DUP-C-001',
    'BE-DUP-C-002',
    'BE-DUP-C-003',
];
const adapterConfigs = {
    'backend-static': path.join(rulepackDir, 'tool-configs/backend-static.config.json'),
    'contract-diff': path.join(rulepackDir, 'tool-configs/contract-diff.config.json'),
    'dep-cruiser': path.join(rulepackDir, 'tool-configs/dep-cruiser.config.cjs'),
    eslint: path.join(rulepackDir, 'tool-configs/eslint.config.js'),
};
const adapterRuns = {
    'backend-static': runBackendStatic,
    'contract-diff': runContractDiff,
    'dep-cruiser': runDepCruiser,
    eslint: runEslint,
};

function writeFiles(rootDir, files = {}) {
    for (const [relativePath, content] of Object.entries(files)) {
        const filePath = path.join(rootDir, relativePath);
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, content, 'utf8');
    }
}

function runGit(rootDir, args) {
    const result = spawnSync('git', args, { cwd: rootDir, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
}

function initializeDiffFixture(rootDir, fixtureCase) {
    runGit(rootDir, ['init', '--quiet']);
    runGit(rootDir, ['config', 'user.email', 'fixtures@example.test']);
    runGit(rootDir, ['config', 'user.name', 'Backend Fixture']);
    writeFiles(rootDir, fixtureCase.before);
    runGit(rootDir, ['add', '.']);
    runGit(rootDir, ['commit', '--quiet', '-m', 'before']);
    const preCommit = runGit(rootDir, ['rev-parse', 'HEAD']);
    writeFiles(rootDir, fixtureCase.files);
    runGit(rootDir, ['add', '.']);
    runGit(rootDir, ['commit', '--quiet', '-m', 'after']);
    const postCommit = runGit(rootDir, ['rev-parse', 'HEAD']);
    return { workspaceRoot: rootDir, preCommit, postCommit };
}

function registryFor(activeAdapter) {
    const registry = new Map();

    for (const [adapterId, configPath] of Object.entries(adapterConfigs)) {
        registry.set(adapterId, {
            configPath,
            run: adapterId === activeAdapter
                ? adapterRuns[adapterId]
                : async () => ({ normalized_events: [], execution_meta: { status: 'ok', skipped_by_fixture: true } }),
        });
    }

    return registry;
}

function normalizeFinding(rootDir, finding) {
    const locationFile = finding.location?.file;
    const normalizedFile = locationFile && path.isAbsolute(locationFile)
        ? path.relative(fs.realpathSync(rootDir), fs.realpathSync(locationFile)).split(path.sep).join('/')
        : locationFile;
    return {
        rule_id: finding.rule_id,
        location: {
            file: normalizedFile,
            line: finding.location?.line ?? null,
            column: finding.location?.column ?? null,
        },
        evidence: finding.evidence,
    };
}

async function evaluateFixture(fixture, fixtureCase) {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), `backend-${fixture.ruleId.toLowerCase()}-`));

    try {
        let runtimeContext = {};

        if (fixture.adapter === 'contract-diff') {
            runtimeContext = initializeDiffFixture(rootDir, fixtureCase);
        } else {
            writeFiles(rootDir, {
                'tsconfig.json': JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'commonjs' } }),
                ...fixtureCase.files,
            });
        }

        const result = await runConstraints({
            targetDir: rootDir,
            rulepackDir,
            taskConfig: { enabled: { constraints: [fixture.ruleId] } },
            adapterRegistry: registryFor(fixture.adapter),
            runtimeContext,
        });
        assert.equal(result.status, 'ok', JSON.stringify(result.adapter_meta));
        return result.findings.map((finding) => normalizeFinding(rootDir, finding));
    } finally {
        fs.rmSync(rootDir, { recursive: true, force: true });
    }
}

test('backend constraint fixture protocol covers every registered backend rule exactly once', () => {
    assert.deepEqual(backendConstraintFixtures.map((fixture) => fixture.ruleId).sort(), [...canonicalRuleIds].sort());
    assert.equal(new Set(backendConstraintFixtures.map((fixture) => fixture.ruleId)).size, canonicalRuleIds.length);

    for (const fixture of backendConstraintFixtures) {
        assert.deepEqual(Object.keys(fixture.cases).sort(), ['ignored', 'nearMiss', 'negative', 'positive']);
        assert.ok(Object.keys(fixture.cases.ignored.files ?? {}).some((file) => !isProductionSourcePath(file)));
    }
});

test('every evaluation task enables the complete canonical backend constraint set', () => {
    for (const taskName of ['Base', 'T1', 'T2', 'T3']) {
        const task = readTaskConfig(path.join(harnessRoot, `tasks/${taskName}.eval.yaml`));
        const backend = task.evaluation_scopes.find((scope) => scope.scope_id === 'backend');
        assert.deepEqual([...backend.enabled.constraints].sort(), [...canonicalRuleIds].sort(), taskName);
    }
});

test('dep-cruiser reports timeout and parse failures as adapter errors', async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'backend-dep-errors-'));

    try {
        writeFiles(rootDir, {
            'tsconfig.json': JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'commonjs' } }),
            'src/index.ts': 'export const value = 1;\n',
        });
        const baseConfig = { configPath: adapterConfigs['dep-cruiser'] };
        const timeout = await runDepCruiser({
            targetDir: rootDir,
            adapterConfig: { ...baseConfig, timeout_ms: 1 },
            toolVersion: 'fixture',
        });
        const parseFailure = await runDepCruiser({
            targetDir: rootDir,
            adapterConfig: { ...baseConfig, args: ['--output-type', 'text'] },
            toolVersion: 'fixture',
        });
        assert.equal(timeout.execution_meta.status, 'error');
        assert.equal(parseFailure.execution_meta.status, 'error');
    } finally {
        fs.rmSync(rootDir, { recursive: true, force: true });
    }
});

for (const fixture of backendConstraintFixtures) {
    for (const [caseName, fixtureCase] of Object.entries(fixture.cases)) {
        test(`${fixture.ruleId} ${caseName}`, async () => {
            const actual = await evaluateFixture(fixture, fixtureCase);

            if (process.env.BACKEND_FIXTURE_SNAPSHOT === '1' && caseName === 'negative') {
                process.stdout.write(`${fixture.ruleId}=${JSON.stringify(actual)}\n`);
                assert.equal(actual.length, 1, `${fixture.ruleId} negative must be a minimal single violation`);
                return;
            }

            assert.deepEqual(actual, fixtureCase.expected ?? [], `${fixture.ruleId} ${caseName}`);
        });
    }
}
