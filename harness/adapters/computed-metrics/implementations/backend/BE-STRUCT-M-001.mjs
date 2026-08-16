import fs from 'node:fs';
import path from 'node:path';
import {
    appendBaselineDeltaFinding,
    buildMetricResult,
    computeDelta,
} from '../_shared/metric-result.mjs';

// Associated metric rule: BE-STRUCT-M-001-module-composition-violation-ratio.
// Reuses the module composition policy from constraint rule BE-STRUCT-C-001-module-composition.

export const VERSION = '1.0.0';

function toPosixPath(value) {
    return value.split(path.sep).join('/');
}

function collectModuleFiles(projectRoot, config = {}) {
    const moduleRoots = Array.isArray(config.module_roots) && config.module_roots.length > 0
        ? config.module_roots
        : ['backend/src/module', 'backend/src/modules', 'src/module', 'src/modules'];
    const moduleFileSet = new Set();

    for (const moduleRoot of moduleRoots) {
        const absoluteRoot = path.resolve(projectRoot, moduleRoot);

        if (!fs.existsSync(absoluteRoot)) {
            continue;
        }

        const entries = fs.readdirSync(absoluteRoot, { withFileTypes: true });
        const subDirs = entries.filter((entry) => entry.isDirectory());

        for (const subDir of subDirs) {
            const moduleDir = path.join(absoluteRoot, subDir.name);
            const files = fs.readdirSync(moduleDir);
            const moduleFilename = files.find(
                (filename) => filename.endsWith('.module.ts') && filename !== 'app.module.ts',
            );

            if (!moduleFilename) {
                continue;
            }

            moduleFileSet.add(path.join(moduleDir, moduleFilename));
        }
    }

    return [...moduleFileSet];
}

function classifyModule(moduleDir, moduleBase) {
    if (/(?:-link|-relation)$/.test(moduleBase)) {
        return { type: 'link', required: ['controller', 'service'] };
    }

    const hasEntityFile = fs.readdirSync(moduleDir).some((filename) => filename.endsWith('.entity.ts'));

    if (hasEntityFile) {
        return { type: 'entity', required: ['controller', 'service', 'repository'] };
    }

    return { type: 'service', required: ['service'] };
}

function checkModuleComposition(moduleFilePath) {
    const moduleDir = path.dirname(moduleFilePath);
    const moduleBase = path.basename(moduleFilePath, '.module.ts');
    const { type, required } = classifyModule(moduleDir, moduleBase);
    const missing = required.filter(
        (layer) => !fs.existsSync(path.join(moduleDir, `${moduleBase}.${layer}.ts`)),
    );

    return {
        moduleName: moduleBase,
        moduleType: type,
        requiredLayers: required,
        moduleFile: toPosixPath(moduleFilePath),
        moduleDir: toPosixPath(moduleDir),
        missing,
        isComplete: missing.length === 0,
    };
}

function summarize(projectRoot, config = {}) {
    const moduleFiles = collectModuleFiles(projectRoot, config);
    const details = moduleFiles.map((moduleFilePath) => checkModuleComposition(moduleFilePath));
    const violating = details.filter((item) => !item.isComplete);
    const totalModules = details.length;
    const violatingModules = violating.length;
    const ratio = totalModules === 0 ? 0 : Number((violatingModules / totalModules).toFixed(6));

    return {
        ratio,
        totalModules,
        violatingModules,
        details,
    };
}

function canReadRoot(rootDir) {
    return typeof rootDir === 'string' && rootDir.length > 0 && fs.existsSync(rootDir);
}

export async function run({ targetDir, baselineDir, config }) {
    const target = summarize(targetDir, config ?? {});
    const baseline = canReadRoot(baselineDir) ? summarize(baselineDir, config ?? {}) : null;
    const delta = computeDelta(target.ratio, baseline?.ratio, 6);
    const findings = appendBaselineDeltaFinding([
        `Violating modules: ${target.violatingModules}/${target.totalModules} (${target.ratio})`,
    ], delta, {
        missingBaselineMessage: 'Baseline is unavailable; delta_vs_baseline is set to null.',
    });

    return buildMetricResult({
        value: target.ratio,
        unit: 'ratio',
        direction: 'lower_is_better',
        delta,
        findings,
        rawArtifactPath: config?.raw_artifact_path,
        details: {
            target,
            baseline,
        },
    });
}
