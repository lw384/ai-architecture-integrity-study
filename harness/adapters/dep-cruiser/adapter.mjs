// Input: a target project directory plus adapter config that describes
// which paths to scan and which dep-cruiser config to use.
// Output: normalized dependency events and execution metadata.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const depCruiseBin = new URL('../../node_modules/dependency-cruiser/bin/dependency-cruise.mjs', import.meta.url);
const require = createRequire(import.meta.url);

function runTool(binPath, args, cwd, timeoutMs) {
    return new Promise((resolve) => {
        const child = spawn(process.execPath, [binPath, ...args], { cwd });
        let stdout = '';
        let stderr = '';
        let isTimeout = false;

        const timer = setTimeout(() => {
            isTimeout = true;
            child.kill();
        }, timeoutMs);

        child.stdout.on('data', (data) => (stdout += data.toString()));
        child.stderr.on('data', (data) => (stderr += data.toString()));

        child.on('close', (code) => {
            clearTimeout(timer);
            resolve({ code, stdout, stderr, isTimeout });
        });
    });
}

function pickCwd(targetDir, adapterConfig = {}) {
    return path.resolve(targetDir, adapterConfig.cwd || '.');
}

function pickTargets(adapterConfig = {}) {
    const targets = adapterConfig.targets ?? adapterConfig.paths ?? ['src'];
    return Array.isArray(targets) && targets.length > 0 ? targets : ['src'];
}

function loadConfig(configPath) {
    const resolvedPath = path.resolve(configPath);

    delete require.cache[resolvedPath];

    return require(resolvedPath);
}

function findTsconfig({ targetDir, cwd, adapterConfig = {} }) {
    const explicit = adapterConfig.tsconfig_path;

    if (explicit) {
        const filePath = path.resolve(cwd, explicit);

        if (fs.existsSync(filePath)) {
            return { filePath, source: 'explicit' };
        }

        return { filePath: null, source: 'explicit-missing' };
    }

    const names = adapterConfig.tsconfig_candidates ?? [
        'tsconfig.json',
        'tsconfig.app.json',
        'tsconfig.build.json',
    ];
    const floor = path.resolve(targetDir);
    let cur = cwd;

    while (cur.startsWith(floor)) {
        for (const name of names) {
            const filePath = path.join(cur, name);

            if (fs.existsSync(filePath)) {
                return { filePath, source: 'auto' };
            }
        }

        if (cur === floor) {
            break;
        }

        cur = path.dirname(cur);
    }

    return { filePath: null, source: 'none' };
}

function pickTsMode(adapterConfig = {}, tsconfig) {
    const mode = adapterConfig.ts_precompilation_deps ?? 'auto';

    if (mode === true || mode === false) {
        return mode;
    }

    return Boolean(tsconfig.filePath);
}

function pickExclude(baseOptions = {}, adapterConfig = {}) {
    if (adapterConfig.exclude === undefined) {
        return baseOptions.exclude;
    }

    if (typeof adapterConfig.exclude === 'string') {
        return { path: adapterConfig.exclude };
    }

    return adapterConfig.exclude;
}

function buildConfig({ configPath, targetDir, cwd, adapterConfig }) {
    const baseConfig = loadConfig(configPath);
    const nextConfig = structuredClone(baseConfig);
    const nextOptions = { ...(nextConfig.options ?? {}) };
    const tsconfig = findTsconfig({ targetDir, cwd, adapterConfig });
    const useTs = pickTsMode(adapterConfig, tsconfig);
    const exclude = pickExclude(nextOptions, adapterConfig);

    nextOptions.tsPreCompilationDeps = useTs;

    if (useTs && tsconfig.filePath) {
        nextOptions.tsConfig = { fileName: tsconfig.filePath };
    } else {
        delete nextOptions.tsConfig;
    }

    if (exclude) {
        nextOptions.exclude = exclude;
    } else {
        delete nextOptions.exclude;
    }

    if (adapterConfig.do_not_follow !== undefined) {
        nextOptions.doNotFollow = adapterConfig.do_not_follow;
    }

    nextConfig.options = nextOptions;

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'depcruise-config-'));
    const tempPath = path.join(tempDir, 'config.cjs');
    fs.writeFileSync(tempPath, `module.exports = ${JSON.stringify(nextConfig, null, 2)};\n`, 'utf8');

    return {
        configPath: tempPath,
        cleanup: () => fs.rmSync(tempDir, { recursive: true, force: true }),
        tsconfig,
        useTs,
    };
}

function buildArgs(configPath, adapterConfig = {}) {
    const targets = pickTargets(adapterConfig);
    const extraArgs = Array.isArray(adapterConfig.args) ? adapterConfig.args : [];

    return [
        ...targets,
        '--config', configPath,
        '--output-type', 'json',
        ...extraArgs,
    ];
}

function dependencyLocation(cwd, sourceFile, dependency) {
    const filePath = path.resolve(cwd, sourceFile);
    if (!fs.existsSync(filePath)) return { line: null, column: null };
    const lines = fs.readFileSync(filePath, 'utf8').split('\n');
    const needles = [dependency.module, dependency.resolved]
        .filter(Boolean)
        .flatMap((value) => [value, path.basename(value).replace(/\.[^.]+$/, '')]);

    for (let index = 0; index < lines.length; index += 1) {
        const column = needles.map((needle) => lines[index].indexOf(needle)).find((value) => value >= 0);
        if (column !== undefined) return { line: index + 1, column: column + 1 };
    }

    return { line: null, column: null };
}

export async function runAdapter({ targetDir, adapterConfig, toolVersion }) {
    const startTime = Date.now();
    const timeout = adapterConfig.timeout_ms || 60000;
    const cwd = pickCwd(targetDir, adapterConfig);
    const runtimeConfig = buildConfig({
        configPath: adapterConfig.configPath,
        targetDir,
        cwd,
        adapterConfig,
    });
    const args = buildArgs(runtimeConfig.configPath, adapterConfig);
    const result = await runTool(depCruiseBin.pathname, args, cwd, timeout);
    const duration_ms = Date.now() - startTime;

    const execution_meta = {
        status: 'ok',
        duration_ms,
        warnings: [],
        cwd,
        targets: pickTargets(adapterConfig),
        tsconfig_path: runtimeConfig.tsconfig.filePath,
        tsconfig_source: runtimeConfig.tsconfig.source,
        ts_mode: runtimeConfig.useTs ? 'full' : 'degraded',
    };
    const normalized_events = [];

    if (!runtimeConfig.tsconfig.filePath) {
        execution_meta.warnings.push('No tsconfig found. Falling back to degraded dependency analysis.');
    }

    try {
        if (result.isTimeout) {
            execution_meta.status = 'error';
            execution_meta.exit_code = 'timeout';
            execution_meta.warnings.push(`dep-cruiser execution timed out after ${timeout}ms.`);
            return { raw_output: null, normalized_events, execution_meta };
        }

        if (result.code !== 0 && !result.stdout.trim().startsWith('{')) {
            execution_meta.status = 'error';
            execution_meta.exit_code = result.code;
            execution_meta.warnings.push(`Command failed with code ${result.code}: ${result.stderr}`);
            return { raw_output: null, normalized_events, execution_meta };
        }

        let raw_output;
        try {
            raw_output = JSON.parse(result.stdout);
        } catch (err) {
            execution_meta.status = 'error';
            execution_meta.exit_code = 'parse_error';
            execution_meta.warnings.push(`Failed to parse dep-cruiser JSON output: ${err.message}`);
            return { raw_output: null, normalized_events, execution_meta };
        }

        execution_meta.exit_code = 0;

        const modules = raw_output.modules || [];
        const emittedCycles = new Set();
        for (const mod of modules) {
            for (const dep of (mod.dependencies || [])) {
                if (dep.rules && dep.rules.length > 0) {
                    for (const rule of dep.rules) {
                        if (rule.name === 'BE-DEP-C-004-no-circular') {
                            const cycleMembers = [
                                mod.source,
                                dep.resolved,
                                ...(dep.cycle ?? []).map((entry) => entry.name ?? entry),
                            ].filter(Boolean).sort();
                            const cycleKey = `${rule.name}:${[...new Set(cycleMembers)].join('|')}`;
                            if (emittedCycles.has(cycleKey)) continue;
                            emittedCycles.add(cycleKey);
                        }

                        const dependencyLoc = dependencyLocation(cwd, mod.source, dep);
                        normalized_events.push({
                            event_type: 'dependency_edge_violation',
                            source_tool: 'dep-cruiser',
                            source_tool_version: toolVersion,
                            source_rule_id: rule.name,
                            location: {
                                file: mod.source,
                                line: dep.line || dependencyLoc.line,
                                column: dependencyLoc.column,
                            },
                            payload: {
                                from_module: mod.source,
                                to_module: dep.resolved,
                                dependency_type: dep.dependencyTypes ? dep.dependencyTypes.join(',') : 'unknown',
                                severity: rule.severity,
                            },
                        });
                    }
                }
            }
        }

        return { raw_output, normalized_events, execution_meta };
    } finally {
        runtimeConfig.cleanup();
    }
}
