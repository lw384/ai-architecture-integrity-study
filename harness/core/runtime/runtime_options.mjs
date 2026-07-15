// Input: raw CLI argv and an optional current working directory.
// Output: a normalized runtime options object with resolved paths and run metadata.
import path from 'node:path';
import { parseArgs } from 'node:util';

const cliOptions = {
    target: { type: 'string' },
    manifest: { type: 'string' },
    'task-config': { type: 'string' },
    rulepack: { type: 'string' },
    output: { type: 'string' },
    baseline: { type: 'string' },
    'pre-commit': { type: 'string' },
    'post-commit': { type: 'string' },
    'run-id': { type: 'string' },
    'trajectory-id': { type: 'string' },
    mode: { type: 'string', default: 'full' },
};

// Resolve an optional CLI path into an absolute path.
function resolveOptionalPath(cwd, value) {
    if (!value) {
        return null;
    }

    return path.resolve(cwd, value);
}

// Parse CLI arguments into a normalized runtime options object.
export function parseRuntimeOptions(argv, cwd = process.cwd()) {
    const parsed = parseArgs({ args: argv, options: cliOptions, strict: false });
    const values = parsed.values;

    if (!values.target) {
        throw new Error('[Harness Error] Missing required CLI option: --target');
    }

    if (!values['task-config']) {
        throw new Error('[Harness Error] Missing required CLI option: --task-config');
    }

    if (!values.rulepack) {
        throw new Error('[Harness Error] Missing required CLI option: --rulepack');
    }

    const targetPath = path.resolve(cwd, values.target);
    const manifestPath = resolveOptionalPath(cwd, values.manifest) ?? path.join(targetPath, 'manifest.json');
    const outputPath = resolveOptionalPath(cwd, values.output) ?? path.join(targetPath, 'evaluation.json');

    return {
        cwd,
        mode: values.mode,
        targetPath,
        manifestPath,
        taskConfigPath: path.resolve(cwd, values['task-config']),
        rulepacksRoot: path.resolve(cwd, values.rulepack),
        outputPath,
        baselinePath: resolveOptionalPath(cwd, values.baseline),
        preCommit: values['pre-commit'] ?? null,
        postCommit: values['post-commit'] ?? null,
        runId: values['run-id'] ?? null,
        trajectoryId: values['trajectory-id'] ?? null,
    };
}
