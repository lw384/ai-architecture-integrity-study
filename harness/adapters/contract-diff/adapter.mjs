import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function readConfig(configPath) {
    if (!configPath || !fs.existsSync(configPath)) {
        return {};
    }

    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
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

    return path.resolve(targetDir, '..');
}

function filterPaths(paths, pattern) {
    const matcher = new RegExp(pattern);
    return paths.filter((candidate) => matcher.test(candidate));
}

function hasSchemaAffectingChange(repoRoot, preCommit, postCommit, filePath, patterns) {
    const result = runGit(repoRoot, ['diff', '--unified=0', preCommit, postCommit, '--', filePath]);

    if (result.status !== 0) {
        return false;
    }

    return result.stdout
        .split('\n')
        .some((line) => patterns.some((pattern) => new RegExp(pattern).test(line)));
}

export async function runAdapter({ targetDir, adapterConfig, toolVersion, runtimeContext }) {
    const config = readConfig(adapterConfig?.configPath);
    const repoRoot = resolveRepoRoot(targetDir, runtimeContext);
    const preCommit = runtimeContext?.preCommit;
    const postCommit = runtimeContext?.postCommit;

    if (!preCommit || !postCommit || preCommit === postCommit) {
        return {
            normalized_events: [],
            execution_meta: {
                status: 'ok',
                repo_root: repoRoot,
                reason: 'No comparable diff range was provided.',
            },
        };
    }

    const changedFilesResult = runGit(repoRoot, ['diff', '--name-only', preCommit, postCommit]);

    if (changedFilesResult.status !== 0) {
        return {
            normalized_events: [],
            execution_meta: {
                status: 'error',
                repo_root: repoRoot,
                error: changedFilesResult.stderr.trim(),
            },
        };
    }

    const changedFiles = changedFilesResult.stdout.split('\n').map((line) => line.trim()).filter(Boolean);
    const changedEntities = filterPaths(changedFiles, config.entity_file_pattern ?? '(^|/)src/modules?/.*\\.entity\\.ts$');
    const changedMigrations = filterPaths(changedFiles, config.migration_file_pattern ?? '(^|/)src/core/database/migrations?/.*\\.(ts|js)$');
    const schemaChangedEntities = changedEntities.filter((filePath) =>
        hasSchemaAffectingChange(
            repoRoot,
            preCommit,
            postCommit,
            filePath,
            config.schema_change_patterns ?? [],
        )
    );

    const normalized_events = [];

    if (schemaChangedEntities.length > 0 && changedMigrations.length === 0) {
        normalized_events.push({
            event_type: 'diff_contract_violation',
            source_tool: 'contract-diff',
            source_tool_version: toolVersion,
            source_rule_id: 'BE-CONTRACT-C-001-entity-change-requires-migration',
            location: {
                file: schemaChangedEntities[0],
                line: null,
                column: null,
            },
            payload: {
                entities: schemaChangedEntities,
                migration_files: changedMigrations,
                pre_commit: preCommit,
                post_commit: postCommit,
            },
        });
    }

    return {
        normalized_events,
        execution_meta: {
            status: 'ok',
            repo_root: repoRoot,
            changed_entities: changedEntities,
            schema_changed_entities: schemaChangedEntities,
            changed_migrations: changedMigrations,
        },
    };
}
