import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
    isGeneratedSourcePath,
    isProductionSourcePath,
    isStorySourcePath,
    isTestSourcePath,
} from '../_shared/production-files.mjs';

function normalizePath(value) {
    return value.split(path.sep).join('/');
}

function canonicalizeResourceName(value) {
    if (!value || typeof value !== 'string') {
        return null;
    }

    const normalized = value
        .replace(/\.(js|jsx|ts|tsx)$/i, '')
        .replace(/api$/i, '')
        .replace(/-detail$/i, '')
        .replace(/detail$/i, '')
        .replace(/[_-]/g, ' ')
        .trim()
        .toLowerCase()
        .split(/\s+/)[0];

    if (!normalized) {
        return null;
    }

    if (normalized.endsWith('ies') && normalized.length > 3) {
        return `${normalized.slice(0, -3)}y`;
    }

    if (normalized.endsWith('s') && !normalized.endsWith('ss') && normalized.length > 1) {
        return normalized.slice(0, -1);
    }

    return normalized;
}

function listFiles(rootDir, predicate, files = []) {
    if (!fs.existsSync(rootDir)) {
        return files;
    }

    for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
        const entryPath = path.join(rootDir, entry.name);

        if (entry.isDirectory()) {
            listFiles(entryPath, predicate, files);
            continue;
        }

        if (predicate(entryPath)) {
            files.push(entryPath);
        }
    }

    return files;
}

function listProductionFiles(rootDir, predicate) {
    return listFiles(rootDir, (filePath) => isProductionSourcePath(filePath) && predicate(filePath));
}

function runGit(repoRoot, args) {
    return spawnSync('git', args, {
        cwd: repoRoot,
        encoding: 'utf8',
    });
}

function resolveRepoRoot(targetDir, runtimeContext = {}) {
    if (runtimeContext.workspaceRoot) {
        return path.resolve(runtimeContext.workspaceRoot);
    }

    return path.resolve(targetDir);
}

function ensureResourceState(map, resource) {
    const current = map.get(resource) ?? {
        hasBackendContract: false,
        hasFrontendAdapter: false,
        hasFrontendUi: false,
        hasTests: false,
        changedBackendControllers: [],
        changedBackendDtos: [],
        changedBackendContract: [],
        changedFrontendAdapter: [],
        changedFrontendUi: [],
        changedTests: [],
    };

    map.set(resource, current);
    return current;
}

function backendModuleResource(relativePath) {
    return canonicalizeResourceName(relativePath.match(/^backend\/src\/modules\/([^/]+)\//)?.[1] ?? null);
}

function frontendPageResource(relativePath) {
    return canonicalizeResourceName(relativePath.match(/^frontend\/src\/pages\/([^/]+)\//)?.[1] ?? null);
}

function frontendApiResource(relativePath) {
    const baseName = path.basename(relativePath).replace(/\.(js|jsx|ts|tsx)$/i, '');

    if (['request', 'index'].includes(baseName.toLowerCase())) {
        return null;
    }

    return canonicalizeResourceName(baseName);
}

function backendTestResource(relativePath) {
    const moduleResource = backendModuleResource(relativePath);

    if (moduleResource) {
        return moduleResource;
    }

    const testBase = path.basename(relativePath).replace(/\.(e2e-)?spec\.ts$/i, '').replace(/\.test\.ts$/i, '');

    return canonicalizeResourceName(testBase.split(/[._-]/)[0]);
}

function frontendTestResource(relativePath) {
    const pageResource = frontendPageResource(relativePath);

    if (pageResource) {
        return pageResource;
    }

    return canonicalizeResourceName(path.basename(relativePath).split('.')[0]);
}

function collectResourceInventory(workspaceRoot, config) {
    const resourceStates = new Map();
    const controllerRoots = Array.isArray(config.backend_controller_roots) ? config.backend_controller_roots : ['backend/src/modules'];
    const dtoRoots = Array.isArray(config.backend_dto_roots) ? config.backend_dto_roots : ['backend/src/modules'];
    const frontendApiRoots = Array.isArray(config.frontend_api_roots) ? config.frontend_api_roots : ['frontend/src/api'];
    const frontendUiRoots = Array.isArray(config.frontend_ui_roots) ? config.frontend_ui_roots : ['frontend/src/pages'];
    const testRoots = Array.isArray(config.test_roots) ? config.test_roots : ['backend/src', 'backend/test', 'frontend/src'];

    for (const root of controllerRoots) {
        const files = listProductionFiles(path.resolve(workspaceRoot, root), (filePath) => /\.controller\.ts$/.test(filePath));

        for (const filePath of files) {
            const relativePath = normalizePath(path.relative(workspaceRoot, filePath));
            const resource = backendModuleResource(relativePath);

            if (!resource) {
                continue;
            }

            ensureResourceState(resourceStates, resource).hasBackendContract = true;
        }
    }

    for (const root of dtoRoots) {
        const files = listProductionFiles(path.resolve(workspaceRoot, root), (filePath) => /\/dto\/.+\.(ts|tsx|js|jsx)$/.test(normalizePath(filePath)));

        for (const filePath of files) {
            const relativePath = normalizePath(path.relative(workspaceRoot, filePath));
            const resource = backendModuleResource(relativePath);

            if (!resource) {
                continue;
            }

            ensureResourceState(resourceStates, resource).hasBackendContract = true;
        }
    }

    for (const root of frontendApiRoots) {
        const files = listProductionFiles(path.resolve(workspaceRoot, root), (filePath) => /\.(js|jsx|ts|tsx)$/.test(filePath));

        for (const filePath of files) {
            const relativePath = normalizePath(path.relative(workspaceRoot, filePath));
            const resource = frontendApiResource(relativePath);

            if (!resource) {
                continue;
            }

            ensureResourceState(resourceStates, resource).hasFrontendAdapter = true;
        }
    }

    for (const root of frontendUiRoots) {
        const files = listProductionFiles(path.resolve(workspaceRoot, root), (filePath) => /\.(js|jsx|ts|tsx)$/.test(filePath));

        for (const filePath of files) {
            const relativePath = normalizePath(path.relative(workspaceRoot, filePath));
            const resource = frontendPageResource(relativePath);

            if (!resource) {
                continue;
            }

            ensureResourceState(resourceStates, resource).hasFrontendUi = true;
        }
    }

    for (const root of testRoots) {
        const files = listFiles(
            path.resolve(workspaceRoot, root),
            (filePath) => isTestSourcePath(filePath)
                && !isStorySourcePath(filePath)
                && !isGeneratedSourcePath(filePath)
                && /\.(js|jsx|ts|tsx)$/.test(filePath),
        );

        for (const filePath of files) {
            const relativePath = normalizePath(path.relative(workspaceRoot, filePath));
            const resource = relativePath.startsWith('frontend/')
                ? frontendTestResource(relativePath)
                : backendTestResource(relativePath);

            if (!resource) {
                continue;
            }

            ensureResourceState(resourceStates, resource).hasTests = true;
        }
    }

    return resourceStates;
}

function classifyChangedFile(relativePath, resourceStates, globalState) {
    const normalizedPath = normalizePath(relativePath);

    if (isStorySourcePath(normalizedPath) || isGeneratedSourcePath(normalizedPath)) {
        return;
    }

    if (isTestSourcePath(normalizedPath)) {
        const resource = normalizedPath.startsWith('frontend/')
            ? frontendTestResource(normalizedPath)
            : backendTestResource(normalizedPath);

        if (resource) {
            ensureResourceState(resourceStates, resource).changedTests.push(normalizedPath);
        }

        return;
    }

    if (/^backend\/src\/modules\/[^/]+\/.+\.controller\.ts$/.test(normalizedPath)) {
        const resource = backendModuleResource(normalizedPath);

        if (resource) {
            const state = ensureResourceState(resourceStates, resource);
            state.changedBackendControllers.push(normalizedPath);
            state.changedBackendContract.push(normalizedPath);
        }

        return;
    }

    if (/^backend\/src\/modules\/[^/]+\/dto\/.+\.(ts|tsx|js|jsx)$/.test(normalizedPath)) {
        const resource = backendModuleResource(normalizedPath);

        if (resource) {
            const state = ensureResourceState(resourceStates, resource);
            state.changedBackendDtos.push(normalizedPath);
            state.changedBackendContract.push(normalizedPath);
        }

        return;
    }

    if (/^frontend\/src\/api\/.+\.(js|jsx|ts|tsx)$/.test(normalizedPath)) {
        const resource = frontendApiResource(normalizedPath);

        if (resource) {
            ensureResourceState(resourceStates, resource).changedFrontendAdapter.push(normalizedPath);
        }

        return;
    }

    if (/^frontend\/src\/pages\/[^/]+\/.+\.(js|jsx|ts|tsx)$/.test(normalizedPath)) {
        const resource = frontendPageResource(normalizedPath);

        if (resource) {
            ensureResourceState(resourceStates, resource).changedFrontendUi.push(normalizedPath);
        }
    }

    if (/^frontend\/src\/routes\/.+\.(js|jsx|ts|tsx)$/.test(normalizedPath)) {
        globalState.changedRouteFiles.push(normalizedPath);
    }

}

function uniqueSorted(values) {
    return [...new Set(values)].sort((left, right) => String(left).localeCompare(String(right)));
}

function toDisplayList(values) {
    return uniqueSorted(values).join(', ');
}

export function collectPropagationRuleEvents(workspaceRoot, config, runtimeContext = {}, toolVersion = 'unknown') {
    const repoRoot = resolveRepoRoot(workspaceRoot, runtimeContext);
    const preCommit = runtimeContext?.preCommit;
    const postCommit = runtimeContext?.postCommit;

    if (!preCommit || !postCommit || preCommit === postCommit) {
        return {
            normalizedEvents: [],
            stats: {
                propagation_changed_files: 0,
                propagation_triggered_resources: 0,
                propagation_violation_count: 0,
                propagation_counterpart_surface_total: 0,
                propagation_counterpart_surface_missing: 0,
                propagation_reason: 'No comparable diff range was provided.',
            },
        };
    }

    const changedFilesResult = runGit(repoRoot, ['diff', '--name-only', preCommit, postCommit]);

    if (changedFilesResult.status !== 0) {
        return {
            normalizedEvents: [],
            stats: {
                propagation_changed_files: 0,
                propagation_triggered_resources: 0,
                propagation_violation_count: 0,
                propagation_counterpart_surface_total: 0,
                propagation_counterpart_surface_missing: 0,
                propagation_error: changedFilesResult.stderr.trim(),
            },
        };
    }

    const changedFiles = changedFilesResult.stdout
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
    const resourceStates = collectResourceInventory(workspaceRoot, config);
    const globalState = { changedRouteFiles: [] };

    for (const filePath of changedFiles) {
        classifyChangedFile(filePath, resourceStates, globalState);
    }

    const normalizedEvents = [];
    let triggeredResources = 0;
    // Full enumeration of counterpart-surface "slots" per triggered resource
    // (not only the ones a resource ends up missing) — the denominator
    // CROSS-PROP-M-001 needs. A "slot" exists whenever a resource that had an
    // API-facing change also already has a counterpart surface on disk that
    // could have been updated; this mirrors the two checks below exactly, it
    // just also counts the slots that were satisfied.
    let counterpartSurfaceTotal = 0;
    let counterpartSurfaceMissing = 0;

    for (const [resource, state] of resourceStates.entries()) {
        const backendChanged = state.changedBackendContract.length > 0;
        const backendControllerChanged = state.changedBackendControllers.length > 0;
        const backendDtoChanged = state.changedBackendDtos.length > 0;
        const frontendAdapterChanged = state.changedFrontendAdapter.length > 0;
        const frontendUiChanged = state.changedFrontendUi.length > 0 || globalState.changedRouteFiles.length > 0;

        if (!backendChanged && !frontendAdapterChanged) {
            continue;
        }

        triggeredResources += 1;
        const missingSurfaces = [];

        if ((backendControllerChanged || backendDtoChanged) && (state.hasFrontendAdapter || state.hasFrontendUi)) {
            counterpartSurfaceTotal += 1;

            if (!frontendAdapterChanged && !frontendUiChanged) {
                counterpartSurfaceMissing += 1;
                missingSurfaces.push('frontend adapter or UI surface');
            }
        }

        if (frontendAdapterChanged && state.hasBackendContract) {
            counterpartSurfaceTotal += 1;

            if (state.changedBackendContract.length === 0) {
                counterpartSurfaceMissing += 1;
                missingSurfaces.push('backend DTO/controller');
            }
        }

        if (missingSurfaces.length === 0) {
            continue;
        }

        const changedSurfaces = [];

        if (backendChanged) {
            changedSurfaces.push('backend contract');
        }

        if (frontendAdapterChanged) {
            changedSurfaces.push('frontend adapter');
        }

        if (frontendUiChanged) {
            changedSurfaces.push('UI surface or route');
        }

        if (state.changedTests.length > 0) {
            changedSurfaces.push('test');
        }

        const locationFile = state.changedBackendContract[0] ?? state.changedFrontendAdapter[0] ?? state.changedFrontendUi[0] ?? state.changedTests[0] ?? globalState.changedRouteFiles[0] ?? changedFiles[0] ?? null;

        normalizedEvents.push({
            source_tool: 'cross-static',
            source_tool_version: toolVersion,
            source_rule_id: 'cross-static/api-facing-change-not-fully-propagated',
            event_type: 'cross_contract_violation',
            location: locationFile ? { file: locationFile, line: null, column: null } : null,
            payload: {
                resource,
                changed_surfaces: toDisplayList(changedSurfaces),
                missing_surfaces: toDisplayList(missingSurfaces),
                changed_backend_contract_files: uniqueSorted(state.changedBackendContract),
                changed_frontend_adapter_files: uniqueSorted(state.changedFrontendAdapter),
                changed_frontend_ui_files: uniqueSorted([...state.changedFrontendUi, ...globalState.changedRouteFiles]),
                changed_test_files: uniqueSorted(state.changedTests),
                pre_commit: preCommit,
                post_commit: postCommit,
            },
        });
    }

    return {
        normalizedEvents,
        stats: {
            propagation_changed_files: changedFiles.length,
            propagation_triggered_resources: triggeredResources,
            propagation_violation_count: normalizedEvents.length,
            propagation_counterpart_surface_total: counterpartSurfaceTotal,
            propagation_counterpart_surface_missing: counterpartSurfaceMissing,
        },
    };
}
