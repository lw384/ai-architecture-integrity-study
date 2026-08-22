import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { runAdapter } from '../../adapters/test-coverage/adapter.mjs';

const RULE_ID = 'BE-COVERAGE-M-001-test-coverage';

// This adapter really spawns a child process (the target project's own coverage command).
// To keep the test fast and deterministic (no real Jest/test suite involved), the "command"
// under test is a tiny inline Node script that plays the role of a coverage run: it writes a
// coverage-summary.json (or simulates failure) and exits, exercising the adapter's real
// spawn/parse/error-handling code path without depending on any actual test framework.
function writeConfig(rootDir, metricConfig) {
    const configPath = path.join(rootDir, 'metrics.config.json');
    fs.writeFileSync(configPath, JSON.stringify({ metrics: { [RULE_ID]: metricConfig } }), 'utf8');
    return configPath;
}

function summaryWriterCommand(pct) {
    return [
        process.execPath,
        '-e',
        `require('fs').mkdirSync('coverage',{recursive:true});` +
        `require('fs').writeFileSync('coverage/coverage-summary.json', JSON.stringify({total:{lines:{pct:${pct}}}}));`,
    ];
}

async function withTempDir(fn) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'be-coverage-m-001-'));
    try {
        return await fn(dir);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

test('reads total.lines.pct from the coverage-summary.json the command produces', async () => {
    await withTempDir(async (dir) => {
        const configPath = writeConfig(dir, { command: summaryWriterCommand(87.5) });
        const result = await runAdapter({
            targetDir: dir,
            baselineDir: null,
            rule: { rule_id: RULE_ID },
            adapterConfig: { configPath },
            toolVersion: 'test',
        });

        assert.equal(result.metric_result.score.value, 87.5);
        assert.equal(result.metric_result.score.unit, 'percent');
        assert.equal(result.execution_meta.status, 'ok');
    });
});

test('a command reporting "No tests found" is treated as 0% coverage, not an error', async () => {
    await withTempDir(async (dir) => {
        const configPath = writeConfig(dir, {
            command: [process.execPath, '-e', `console.log('No tests found'); process.exit(1);`],
        });
        const result = await runAdapter({
            targetDir: dir,
            baselineDir: null,
            rule: { rule_id: RULE_ID },
            adapterConfig: { configPath },
            toolVersion: 'test',
        });

        assert.equal(result.metric_result.score.value, 0);
        assert.ok(result.metric_result.details.target.noTestsFound);
    });
});

test('a genuinely failing command (non-zero exit, not "no tests found") rejects rather than silently reporting 0%', async () => {
    await withTempDir(async (dir) => {
        const configPath = writeConfig(dir, {
            command: [process.execPath, '-e', `console.error('boom'); process.exit(1);`],
        });

        await assert.rejects(() =>
            runAdapter({
                targetDir: dir,
                baselineDir: null,
                rule: { rule_id: RULE_ID },
                adapterConfig: { configPath },
                toolVersion: 'test',
            })
        );
    });
});

// runAdapter() reads ONE config (and therefore one `command`) and runs it twice, once with
// cwd=targetDir and once with cwd=baselineDir — so target/baseline cannot each carry their own
// hardcoded command. This command instead behaves according to marker files already sitting in
// whichever directory it's invoked in, letting one shared command produce different outcomes.
function conditionalCommand() {
    return [
        process.execPath,
        '-e',
        `const fs=require('fs');` +
        `if (fs.existsSync('should-fail.marker')) { console.error('boom'); process.exit(1); }` +
        `const pct = fs.existsSync('pct-source.json') ? JSON.parse(fs.readFileSync('pct-source.json','utf8')).pct : 100;` +
        `fs.mkdirSync('coverage',{recursive:true});` +
        `fs.writeFileSync('coverage/coverage-summary.json', JSON.stringify({total:{lines:{pct}}}));`,
    ];
}

test('baseline coverage is read separately and a delta is computed against it', async () => {
    await withTempDir(async (targetDir) => {
        await withTempDir(async (baselineDir) => {
            const configPath = writeConfig(targetDir, { command: conditionalCommand() });
            fs.writeFileSync(path.join(targetDir, 'pct-source.json'), JSON.stringify({ pct: 90 }));
            fs.writeFileSync(path.join(baselineDir, 'pct-source.json'), JSON.stringify({ pct: 80 }));

            const result = await runAdapter({
                targetDir,
                baselineDir,
                rule: { rule_id: RULE_ID },
                adapterConfig: { configPath },
                toolVersion: 'test',
            });

            assert.equal(result.metric_result.score.value, 90);
            assert.equal(result.metric_result.delta_vs_baseline, 10);
        });
    });
});

test('a failing baseline run does not fail the whole adapter — it is captured as an error and the delta is null', async () => {
    await withTempDir(async (targetDir) => {
        await withTempDir(async (baselineDir) => {
            const configPath = writeConfig(targetDir, { command: conditionalCommand() });
            fs.writeFileSync(path.join(targetDir, 'pct-source.json'), JSON.stringify({ pct: 90 }));
            fs.writeFileSync(path.join(baselineDir, 'should-fail.marker'), '');

            const result = await runAdapter({
                targetDir,
                baselineDir,
                rule: { rule_id: RULE_ID },
                adapterConfig: { configPath },
                toolVersion: 'test',
            });

            assert.equal(result.metric_result.score.value, 90);
            assert.equal(result.metric_result.delta_vs_baseline, null);
        });
    });
});
