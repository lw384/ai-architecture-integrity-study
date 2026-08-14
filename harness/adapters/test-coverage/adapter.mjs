import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
    appendBaselineDeltaFinding,
    buildMetricResult,
    computeDelta,
} from '../computed-metrics/implementations/_shared/metric-result.mjs';

function readConfig(configPath) {
    if (!configPath || !fs.existsSync(configPath)) {
        return {};
    }

    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

function pickRuleConfig(config, rule) {
    return config.metrics?.[rule.rule_id] ?? {};
}

function runCommand(command, cwd, timeoutMs) {
    return new Promise((resolve) => {
        const [bin, ...args] = command;
        const child = spawn(bin, args, {
            cwd,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        let stdout = '';
        let stderr = '';
        let timedOut = false;
        const timer = setTimeout(() => {
            timedOut = true;
            child.kill();
        }, timeoutMs);

        child.stdout.on('data', (data) => (stdout += data.toString()));
        child.stderr.on('data', (data) => (stderr += data.toString()));

        child.on('close', (code) => {
            clearTimeout(timer);
            resolve({ code, stdout, stderr, timedOut });
        });
    });
}

function resolveCoverageCwd(baseDir, workingDirectory) {
    return path.resolve(baseDir, workingDirectory ?? '.');
}

function isNoTestsFoundOutput(text) {
    return /No tests found/i.test(text);
}

function readCoverageSummary(cwd, coverageSummaryPath) {
    const summaryPath = path.resolve(cwd, coverageSummaryPath);

    if (!fs.existsSync(summaryPath)) {
        throw new Error(`Coverage summary not found at ${summaryPath}`);
    }

    const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
    const pct = summary?.total?.lines?.pct;

    if (typeof pct !== 'number') {
        throw new Error(`Coverage summary ${summaryPath} is missing total.lines.pct`);
    }

    return {
        summaryPath,
        pct,
    };
}

async function executeCoverageRun(baseDir, config, workingDirectoryKey = 'working_directory') {
    const command = config.command;

    if (!Array.isArray(command) || command.length === 0) {
        throw new Error('Coverage metric command must be a non-empty string array.');
    }

    const cwd = resolveCoverageCwd(baseDir, config[workingDirectoryKey] ?? '.');
    const result = await runCommand(command, cwd, config.timeout_ms ?? 600000);

    if (result.timedOut) {
        throw new Error(`Coverage command timed out after ${config.timeout_ms ?? 600000}ms`);
    }

    if (result.code !== 0) {
        const combinedOutput = `${result.stdout}\n${result.stderr}`;

        if (isNoTestsFoundOutput(combinedOutput)) {
            return {
                cwd,
                stdout: result.stdout,
                stderr: result.stderr,
                summaryPath: null,
                pct: 0,
                noTestsFound: true,
            };
        }

        throw new Error(`Coverage command failed with code ${result.code}: ${result.stderr.trim() || result.stdout.trim()}`);
    }

    const summary = readCoverageSummary(cwd, config.coverage_summary_path ?? 'coverage/coverage-summary.json');

    return {
        cwd,
        stdout: result.stdout,
        stderr: result.stderr,
        ...summary,
    };
}

export async function runAdapter({
    targetDir,
    baselineDir,
    rule,
    adapterConfig,
    toolVersion,
}) {
    const config = pickRuleConfig(readConfig(adapterConfig?.configPath), rule);
    const targetRun = await executeCoverageRun(targetDir, config, 'working_directory');
    let baselineRun = null;

    if (baselineDir) {
        try {
            baselineRun = await executeCoverageRun(
                baselineDir,
                config,
                config.baseline_working_directory ? 'baseline_working_directory' : 'working_directory',
            );
        } catch (error) {
            baselineRun = { error: error.message };
        }
    }

    const delta = baselineRun?.pct !== undefined
        ? computeDelta(targetRun.pct, baselineRun.pct, 2)
        : null;
    const findings = appendBaselineDeltaFinding([
        `Backend line coverage: ${targetRun.pct}%`,
        ...(targetRun.noTestsFound ? ['Coverage command found no matching tests; treating coverage as 0%.'] : []),
    ], delta, {
        missingBaselineMessage: baselineRun?.error
            ? `Baseline coverage unavailable: ${baselineRun.error}`
            : 'Baseline coverage unavailable; delta_vs_baseline is set to null.',
        formatDelta: (value) => `${value > 0 ? '+' : ''}${value} percentage points`,
    });

    return {
        metric_result: buildMetricResult({
            value: targetRun.pct,
            unit: 'percent',
            direction: 'higher_is_better',
            delta,
            findings,
            rawArtifactPath: config.raw_artifact_path,
            details: {
                target: targetRun,
                baseline: baselineRun,
            },
        }),
        execution_meta: {
            status: 'ok',
            duration_ms: 0,
            config_path: adapterConfig?.configPath ?? null,
            tool_version: toolVersion,
        },
    };
}
