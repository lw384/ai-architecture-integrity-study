import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import parser from '@typescript-eslint/parser';
import { isProductionSourcePath } from '../_shared/production-files.mjs';

const PERSISTENT_DECORATORS = new Set([
    'Column',
    'PrimaryGeneratedColumn',
    'PrimaryColumn',
    'CreateDateColumn',
    'UpdateDateColumn',
    'DeleteDateColumn',
    'VersionColumn',
    'ManyToOne',
    'OneToMany',
    'OneToOne',
    'ManyToMany',
    'JoinColumn',
    'JoinTable',
    'RelationId',
]);

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
    return paths.filter((candidate) => isProductionSourcePath(candidate) && matcher.test(candidate));
}

function readGitFile(repoRoot, commit, filePath) {
    const result = runGit(repoRoot, ['show', `${commit}:${filePath}`]);
    return result.status === 0 ? result.stdout : '';
}

function normalizeIdentifier(value) {
    return String(value ?? '').replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function decoratorCall(decorator) {
    return decorator?.expression?.type === 'CallExpression' ? decorator.expression : null;
}

function parseEntitySchema(source, filePath) {
    if (!source) return { table: null, properties: new Map() };
    const ast = parser.parse(source, { sourceType: 'module', ecmaVersion: 2022, loc: true, range: true });
    const classes = (ast.body ?? []).flatMap((statement) => {
        if (statement.type === 'ClassDeclaration') return [statement];
        if (statement.declaration?.type === 'ClassDeclaration') return [statement.declaration];
        return [];
    });
    const entityClass = classes.find((classNode) =>
        (classNode.decorators ?? []).some((decorator) => decoratorCall(decorator)?.callee?.name === 'Entity')
    ) ?? classes[0];
    const entityDecorator = (entityClass?.decorators ?? []).find(
        (decorator) => decoratorCall(decorator)?.callee?.name === 'Entity'
    );
    const entityArgument = decoratorCall(entityDecorator)?.arguments?.[0];
    const table = entityArgument?.type === 'Literal' && typeof entityArgument.value === 'string'
        ? entityArgument.value
        : entityClass?.id?.name ?? path.basename(filePath, '.entity.ts');
    const properties = new Map();

    for (const propertyNode of entityClass?.body?.body ?? []) {
        if (propertyNode.type !== 'PropertyDefinition') continue;
        const decorators = propertyNode.decorators ?? [];
        const names = decorators.map((decorator) => {
            const call = decoratorCall(decorator);
            return call?.callee?.type === 'Identifier' ? call.callee.name : null;
        });
        if (!names.some((name) => PERSISTENT_DECORATORS.has(name))) continue;
        const property = propertyNode.key?.type === 'Identifier'
            ? propertyNode.key.name
            : propertyNode.key?.value;
        if (typeof property !== 'string') continue;
        let explicitName = null;

        for (const decorator of decorators) {
            const objectArg = decoratorCall(decorator)?.arguments?.find((argument) => argument.type === 'ObjectExpression');
            const nameProperty = objectArg?.properties?.find((item) =>
                item.type === 'Property'
                && ((item.key?.type === 'Identifier' && item.key.name === 'name') || item.key?.value === 'name')
            );
            if (nameProperty?.value?.type === 'Literal' && typeof nameProperty.value.value === 'string') {
                explicitName = nameProperty.value.value;
                break;
            }
        }

        properties.set(property, {
            property,
            storageName: explicitName ?? property,
            signature: source.slice(propertyNode.range[0], propertyNode.range[1]).replace(/\s+/g, ''),
            line: propertyNode.loc?.start?.line ?? null,
        });
    }

    return { table, properties };
}

function entityChanges(repoRoot, preCommit, postCommit, filePath) {
    const before = parseEntitySchema(readGitFile(repoRoot, preCommit, filePath), filePath);
    const after = parseEntitySchema(readGitFile(repoRoot, postCommit, filePath), filePath);
    const names = new Set([...before.properties.keys(), ...after.properties.keys()]);
    const changes = [];

    for (const name of names) {
        const previous = before.properties.get(name);
        const next = after.properties.get(name);
        if (previous?.signature === next?.signature) continue;
        changes.push({
            entityFile: filePath,
            table: after.table ?? before.table,
            property: name,
            storageName: next?.storageName ?? previous?.storageName ?? name,
            change: !previous ? 'added' : !next ? 'removed' : 'modified',
            line: next?.line ?? previous?.line ?? null,
        });
    }

    return changes;
}

function methodBody(source, name) {
    const match = new RegExp(`(?:async\\s+)?${name}\\s*\\([^)]*\\)\\s*(?::[^\\{]+)?\\{`, 'm').exec(source);
    if (!match) return '';
    const start = match.index + match[0].length;
    let depth = 1;

    for (let index = start; index < source.length; index += 1) {
        if (source[index] === '{') depth += 1;
        if (source[index] === '}') depth -= 1;
        if (depth === 0) return source.slice(start, index);
    }

    return '';
}

function parseMigration(source, filePath) {
    const up = methodBody(source, 'up');
    const down = methodBody(source, 'down');
    const operation = /(?:query|addColumn|dropColumn|renameColumn|changeColumn|createForeignKey|dropForeignKey|createTable|dropTable)\s*\(/;
    return {
        filePath,
        up,
        down,
        executable: Boolean(up && down && operation.test(up) && operation.test(down)),
    };
}

function migrationCovers(change, migration) {
    if (!migration.executable) return false;
    const table = normalizeIdentifier(change.table);
    const property = normalizeIdentifier(change.storageName);
    const up = normalizeIdentifier(migration.up);
    const down = normalizeIdentifier(migration.down);
    return up.includes(table) && down.includes(table) && up.includes(property) && down.includes(property);
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
    const schemaChanges = changedEntities.flatMap((filePath) => entityChanges(repoRoot, preCommit, postCommit, filePath));
    const migrations = changedMigrations.map((filePath) =>
        parseMigration(readGitFile(repoRoot, postCommit, filePath), filePath)
    );
    const uncoveredChanges = schemaChanges.filter((change) =>
        !migrations.some((migration) => migrationCovers(change, migration))
    );
    const normalized_events = uncoveredChanges.map((change) => ({
            event_type: 'diff_contract_violation',
            source_tool: 'contract-diff',
            source_tool_version: toolVersion,
            source_rule_id: 'BE-CONTRACT-C-001-entity-change-requires-migration',
            location: {
                file: change.entityFile,
                line: change.line,
                column: 1,
            },
            payload: {
                entity_file: change.entityFile,
                table: change.table,
                property: change.property,
                change: change.change,
                migration_files: changedMigrations,
                message: `Persistent change ${change.table}.${change.property} lacks a matching executable migration.`,
            },
        }));

    return {
        normalized_events,
        execution_meta: {
            status: 'ok',
            repo_root: repoRoot,
            changed_entities: changedEntities,
            schema_changes: schemaChanges,
            uncovered_schema_changes: uncoveredChanges,
            changed_migrations: changedMigrations,
        },
    };
}
