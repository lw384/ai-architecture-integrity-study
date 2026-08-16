import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { runAdapter as runFrontendStatic } from '../../adapters/frontend-static/adapter.mjs';
import { isProductionSourcePath } from '../../adapters/_shared/production-files.mjs';
import { runConstraints } from '../layers/constraints_runner.mjs';
import { readTaskConfig } from '../io/task_config_reader.mjs';
import {
    frontendConstraintFixtures,
    frontendDuplicationReasonFixtures,
} from '../../rulepacks/js-react-frontend/fixtures/frontend-constraint-protocol.fixtures.mjs';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const harnessRoot = path.resolve(testDir, '../..');
const rulepackDir = path.join(harnessRoot, 'rulepacks/js-react-frontend');
const canonicalRuleIds = [
    'FE-COM-C-001', 'FE-COM-C-002',
    'FE-STATE-C-001', 'FE-STATE-C-002',
    'FE-ROUTE-C-001', 'FE-ROUTE-C-002',
    'FE-STYLE-C-001', 'FE-STYLE-C-002',
    'FE-DATA-C-001', 'FE-DATA-C-002',
    'FE-COMM-C-001', 'FE-DUP-C-001', 'FE-DUP-C-002',
];
const configPath = path.join(rulepackDir, 'tool-configs/frontend-static.config.json');

function writeFiles(rootDir, files) {
    for (const [relativePath, content] of Object.entries(files)) {
        const filePath = path.join(rootDir, relativePath);
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, content, 'utf8');
    }
}

function normalizeFinding(finding) {
    return {
        rule_id: finding.rule_id,
        location: {
            file: finding.location?.file ?? null,
            line: finding.location?.line ?? null,
            column: finding.location?.column ?? null,
        },
        evidence: finding.evidence,
    };
}

async function evaluateFixture(fixture, fixtureCase) {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), `frontend-${fixture.ruleId.toLowerCase()}-`));
    try {
        writeFiles(rootDir, {
            'tsconfig.json': JSON.stringify({ compilerOptions: { target: 'ES2022', jsx: 'react-jsx' } }),
            ...fixtureCase.files,
        });
        const registry = new Map([['frontend-static', { configPath, run: runFrontendStatic }]]);
        const result = await runConstraints({
            targetDir: rootDir,
            rulepackDir,
            taskConfig: { enabled: { constraints: [fixture.ruleId] } },
            adapterRegistry: registry,
        });
        assert.equal(result.status, 'ok', JSON.stringify(result.adapter_meta));
        return result.findings.map(normalizeFinding);
    } finally {
        fs.rmSync(rootDir, { recursive: true, force: true });
    }
}

test('frontend constraint protocol covers every registered rule exactly once', () => {
    assert.deepEqual(frontendConstraintFixtures.map((fixture) => fixture.ruleId).sort(), [...canonicalRuleIds].sort());
    assert.equal(new Set(frontendConstraintFixtures.map((fixture) => fixture.ruleId)).size, canonicalRuleIds.length);
    for (const fixture of frontendConstraintFixtures) {
        assert.deepEqual(Object.keys(fixture.cases).sort(), ['ignored', 'nearMiss', 'negative', 'positive']);
        assert.equal(fixture.cases.negative.expected?.length, 1, `${fixture.ruleId} negative`);
        assert.deepEqual(fixture.cases.positive.expected, [], `${fixture.ruleId} positive`);
        assert.deepEqual(fixture.cases.nearMiss.expected, [], `${fixture.ruleId} nearMiss`);
        assert.deepEqual(fixture.cases.ignored.expected, [], `${fixture.ruleId} ignored`);
        assert.ok(Object.keys(fixture.cases.ignored.files).some((file) => !isProductionSourcePath(file)));
    }
});

test('every evaluation task enables the complete canonical frontend constraint set', () => {
    for (const taskName of ['Base', 'T1', 'T2', 'T3']) {
        const task = readTaskConfig(path.join(harnessRoot, `tasks/${taskName}.eval.yaml`));
        const frontend = task.evaluation_scopes.find((scope) => scope.scope_id === 'frontend');
        assert.deepEqual([...frontend.enabled.constraints].sort(), [...canonicalRuleIds].sort(), taskName);
    }
});

for (const reasonFixture of frontendDuplicationReasonFixtures) {
    test(`FE-DUP-C-002 emits ${reasonFixture.reason} evidence`, async () => {
        const actual = await evaluateFixture(
            { ruleId: 'FE-DUP-C-002' },
            { files: reasonFixture.files },
        );
        assert.equal(actual.length, 1, reasonFixture.reason);
        assert.equal(actual[0].rule_id, 'FE-DUP-C-002-single-authoritative-implementation');
        assert.equal(actual[0].evidence.source_tool, 'frontend-static');
        assert.equal(actual[0].evidence.source_rule_id, 'FE-DUP-C-002');
        assert.equal(actual[0].evidence.payload.reason, reasonFixture.reason);
        assert.equal(actual[0].evidence.payload.implementations.length, 2);
    });
}

for (const fixture of frontendConstraintFixtures) {
    for (const [caseName, fixtureCase] of Object.entries(fixture.cases)) {
        test(`${fixture.ruleId} ${caseName}`, async () => {
            const actual = await evaluateFixture(fixture, fixtureCase);
            if (process.env.FRONTEND_FIXTURE_SNAPSHOT === '1' && caseName === 'negative') {
                process.stdout.write(`${fixture.ruleId}=${JSON.stringify(actual)}\n`);
                assert.equal(actual.length, 1, `${fixture.ruleId} negative must be a minimal single violation`);
                return;
            }
            assert.deepEqual(actual, fixtureCase.expected ?? [], `${fixture.ruleId} ${caseName}`);
        });
    }
}
