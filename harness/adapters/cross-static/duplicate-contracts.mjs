import fs from 'node:fs';
import path from 'node:path';
import parser from '@typescript-eslint/parser';
import { isProductionSourcePath } from '../_shared/production-files.mjs';

function normalizePath(value) {
    return value.split(path.sep).join('/');
}

function listFiles(rootDir, predicate, files = []) {
    if (!fs.existsSync(rootDir)) {
        return files;
    }

    for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
        const entryPath = path.join(rootDir, entry.name);

        if (entry.isDirectory()) {
            if (!isProductionSourcePath(entryPath)) {
                continue;
            }
            listFiles(entryPath, predicate, files);
            continue;
        }

        if (isProductionSourcePath(entryPath) && predicate(entryPath)) {
            files.push(entryPath);
        }
    }

    return files;
}

function parseFile(filePath) {
    const code = fs.readFileSync(filePath, 'utf8');
    const ast = parser.parse(code, {
        sourceType: 'module',
        ecmaVersion: 2021,
        loc: true,
        range: true,
        ecmaFeatures: {
            jsx: true,
        },
    });

    return { code, ast };
}

function unwrapTsExpression(node) {
    let current = node;

    while (current?.type === 'TSAsExpression' || current?.type === 'TSSatisfiesExpression' || current?.type === 'TSNonNullExpression') {
        current = current.expression;
    }

    return current;
}

function splitTokens(value) {
    if (!value) {
        return [];
    }

    return String(value)
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/[_\-./]/g, ' ')
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean);
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

function getPropertyName(node) {
    if (!node) {
        return null;
    }

    if (node.type === 'Identifier') {
        return node.name;
    }

    if (node.type === 'Literal' && typeof node.value === 'string') {
        return node.value;
    }

    return null;
}

function detectResource(relativeFile) {
    const normalized = normalizePath(relativeFile);
    const backendModule = normalized.match(/^backend\/src\/modules\/([^/]+)\//)?.[1];

    if (backendModule) {
        return canonicalizeResourceName(backendModule);
    }

    if (normalized.startsWith('backend/src/common/')) {
        return 'common';
    }

    const frontendPage = normalized.match(/^frontend\/src\/pages\/([^/]+)\//)?.[1];

    if (frontendPage) {
        return canonicalizeResourceName(frontendPage);
    }

    if (normalized.startsWith('frontend/src/api/')) {
        return canonicalizeResourceName(path.basename(normalized).replace(/\.(js|jsx|ts|tsx)$/i, ''));
    }

    return canonicalizeResourceName(path.basename(normalized).replace(/\.(js|jsx|ts|tsx)$/i, ''));
}

function detectContractToken(definitionName, relativeFile) {
    const tokens = new Set([
        ...splitTokens(definitionName),
        ...splitTokens(path.basename(relativeFile)),
    ]);

    if (tokens.has('error') && (tokens.has('code') || tokens.has('codes'))) {
        return 'error-code';
    }

    if (tokens.has('stage') || tokens.has('stages')) {
        return 'stage';
    }

    if (tokens.has('status') || tokens.has('statuses')) {
        return 'status';
    }

    if (tokens.has('industry') || tokens.has('industries')) {
        return 'industry';
    }

    if (tokens.has('sort')) {
        return 'sort';
    }

    if (tokens.has('order')) {
        return 'order';
    }

    if (tokens.has('type') || tokens.has('types')) {
        return 'type';
    }

    return null;
}

function resolveString(node, env) {
    const current = unwrapTsExpression(node);

    if (!current) {
        return null;
    }

    if (current.type === 'Literal' && typeof current.value === 'string') {
        return current.value;
    }

    if (current.type === 'Identifier') {
        return env.stringScalars.get(current.name) ?? null;
    }

    if (current.type === 'MemberExpression' && !current.computed && current.object?.type === 'Identifier') {
        const objectMap = env.stringObjectMaps.get(current.object.name);
        const propertyName = getPropertyName(current.property);

        if (objectMap && propertyName && objectMap.has(propertyName)) {
            return objectMap.get(propertyName);
        }
    }

    if (current.type === 'MemberExpression' && current.computed && current.object?.type === 'Identifier') {
        const objectMap = env.stringObjectMaps.get(current.object.name);
        const propertyName = resolveString(current.property, env);

        if (objectMap && propertyName && objectMap.has(propertyName)) {
            return objectMap.get(propertyName);
        }
    }

    return null;
}

function resolveStringArray(node, env) {
    const current = unwrapTsExpression(node);

    if (!current) {
        return null;
    }

    if (current.type === 'Identifier') {
        return env.stringArrays.get(current.name) ?? null;
    }

    if (current.type !== 'ArrayExpression') {
        return null;
    }

    const values = [];

    for (const element of current.elements ?? []) {
        const value = resolveString(element, env);

        if (value === null) {
            return null;
        }

        values.push(value);
    }

    return values;
}

function resolveOptionValueArray(node, env) {
    const current = unwrapTsExpression(node);

    if (!current || current.type !== 'ArrayExpression') {
        return null;
    }

    const values = [];

    for (const element of current.elements ?? []) {
        const objectNode = unwrapTsExpression(element);

        if (!objectNode || objectNode.type !== 'ObjectExpression') {
            return null;
        }

        let value = null;

        for (const property of objectNode.properties ?? []) {
            if (property?.type !== 'Property' || property.computed) {
                continue;
            }

            if (getPropertyName(property.key) === 'value') {
                value = resolveString(property.value, env);
            }
        }

        if (value === null) {
            return null;
        }

        values.push(value);
    }

    return values;
}

function resolveObjectStringMap(node, env) {
    const current = unwrapTsExpression(node);

    if (!current || current.type !== 'ObjectExpression') {
        return null;
    }

    const resolved = new Map();

    for (const property of current.properties ?? []) {
        if (property?.type !== 'Property') {
            return null;
        }

        const key = property.computed ? resolveString(property.key, env) : getPropertyName(property.key);
        const value = resolveString(property.value, env);

        if (!key || value === null) {
            return null;
        }

        resolved.set(key, value);
    }

    return resolved;
}

function resolveObjectKeySet(node, env) {
    const current = unwrapTsExpression(node);

    if (!current || current.type !== 'ObjectExpression') {
        return null;
    }

    const values = [];

    for (const property of current.properties ?? []) {
        if (property?.type !== 'Property') {
            return null;
        }

        const key = property.computed ? resolveString(property.key, env) : getPropertyName(property.key);

        if (!key) {
            return null;
        }

        values.push(key);
    }

    return values;
}

function resolveTransitionMap(node, env) {
    const current = unwrapTsExpression(node);

    if (!current || current.type !== 'ObjectExpression') {
        return null;
    }

    const resolved = new Map();

    for (const property of current.properties ?? []) {
        if (property?.type !== 'Property') {
            return null;
        }

        const key = property.computed ? resolveString(property.key, env) : getPropertyName(property.key);
        const value = resolveStringArray(property.value, env);

        if (!key || value === null) {
            return null;
        }

        resolved.set(key, value);
    }

    return resolved;
}

function topLevelDeclarations(ast) {
    const declarations = [];

    for (const statement of ast.body ?? []) {
        if (statement.type === 'ExportNamedDeclaration' && statement.declaration?.type === 'VariableDeclaration') {
            declarations.push(...statement.declaration.declarations);
            continue;
        }

        if (statement.type === 'VariableDeclaration') {
            declarations.push(...statement.declarations);
        }
    }

    return declarations;
}

function uniqueSorted(values) {
    return [...new Set(values)].sort((left, right) => String(left).localeCompare(String(right)));
}

function flattenTransitionEdges(map) {
    const edges = [];

    for (const [from, targets] of map.entries()) {
        for (const target of targets) {
            edges.push(`${from}->${target}`);
        }
    }

    return uniqueSorted(edges);
}

function collectDefinitionsForFile(workspaceRoot, relativeFile, side) {
    const filePath = path.resolve(workspaceRoot, relativeFile);

    if (!fs.existsSync(filePath)) {
        return [];
    }

    const { ast } = parseFile(filePath);
    const resource = detectResource(relativeFile);
    const env = {
        stringScalars: new Map(),
        stringArrays: new Map(),
        stringObjectMaps: new Map(),
        transitionMaps: new Map(),
    };
    const definitions = [];

    for (const declaration of topLevelDeclarations(ast)) {
        if (declaration.id?.type !== 'Identifier' || !declaration.init) {
            continue;
        }

        const definitionName = declaration.id.name;
        const contractToken = detectContractToken(definitionName, relativeFile);
        const objectStringMap = resolveObjectStringMap(declaration.init, env);

        if (objectStringMap) {
            env.stringObjectMaps.set(definitionName, objectStringMap);
        }

        const stringArray = resolveStringArray(declaration.init, env);

        if (stringArray) {
            env.stringArrays.set(definitionName, stringArray);
        }

        const transitionMap = resolveTransitionMap(declaration.init, env);

        if (transitionMap) {
            env.transitionMaps.set(definitionName, transitionMap);
        }

        if (!resource || !contractToken) {
            continue;
        }

        if (transitionMap && transitionMap.size >= 2) {
            definitions.push({
                side,
                file: relativeFile,
                resource,
                contractToken,
                definitionName,
                kind: 'transition-map',
                subtype: 'transition-map',
                values: flattenTransitionEdges(transitionMap),
            });
            continue;
        }

        const optionValues = resolveOptionValueArray(declaration.init, env);

        if (optionValues && uniqueSorted(optionValues).length >= 2) {
            definitions.push({
                side,
                file: relativeFile,
                resource,
                contractToken,
                definitionName,
                kind: 'set',
                subtype: 'option-set',
                values: uniqueSorted(optionValues),
            });
        }

        if (stringArray && uniqueSorted(stringArray).length >= 2) {
            definitions.push({
                side,
                file: relativeFile,
                resource,
                contractToken,
                definitionName,
                kind: 'set',
                subtype: 'value-set',
                values: uniqueSorted(stringArray),
            });
        }

        if (objectStringMap && uniqueSorted([...objectStringMap.values()]).length >= 2) {
            definitions.push({
                side,
                file: relativeFile,
                resource,
                contractToken,
                definitionName,
                kind: 'set',
                subtype: 'value-set',
                values: uniqueSorted([...objectStringMap.values()]),
            });
        }

        const keySet = resolveObjectKeySet(declaration.init, env);

        if (keySet && uniqueSorted(keySet).length >= 2) {
            definitions.push({
                side,
                file: relativeFile,
                resource,
                contractToken,
                definitionName,
                kind: 'set',
                subtype: 'key-set',
                values: uniqueSorted(keySet),
            });
        }
    }

    return definitions;
}

function collectDefinitions(workspaceRoot, roots, side) {
    const definitions = [];

    for (const root of roots) {
        const absoluteRoot = path.resolve(workspaceRoot, root);
        const files = listFiles(absoluteRoot, (filePath) => /\.(js|jsx|ts|tsx)$/.test(filePath));

        for (const filePath of files) {
            const relativeFile = normalizePath(path.relative(workspaceRoot, filePath));
            definitions.push(...collectDefinitionsForFile(workspaceRoot, relativeFile, side));
        }
    }

    return definitions;
}

function isCompatibleResource(frontendDef, backendDef) {
    if (frontendDef.contractToken !== backendDef.contractToken) {
        return false;
    }

    if (frontendDef.resource === backendDef.resource) {
        return true;
    }

    if (backendDef.resource === 'common' && frontendDef.contractToken === 'error-code') {
        return true;
    }

    return false;
}

function compareSetDefinitions(frontendDef, backendDef, config) {
    const frontendValues = new Set(frontendDef.values);
    const backendValues = new Set(backendDef.values);
    const shared = frontendDef.values.filter((value) => backendValues.has(value));
    const minSharedValues = config.min_shared_values ?? 2;

    if (shared.length < minSharedValues) {
        return null;
    }

    const missing = backendDef.values.filter((value) => !frontendValues.has(value));
    const extra = frontendDef.values.filter((value) => !backendValues.has(value));
    const exact = missing.length === 0 && extra.length === 0;

    return {
        score: exact ? 1000 + shared.length : shared.length * 10 - missing.length - extra.length,
        duplicateMode: exact ? 'exact-duplicate' : 'drifted-duplicate',
        shared,
        missing,
        extra,
    };
}

function compareTransitionDefinitions(frontendDef, backendDef, config) {
    const frontendValues = new Set(frontendDef.values);
    const backendValues = new Set(backendDef.values);
    const shared = frontendDef.values.filter((value) => backendValues.has(value));
    const minSharedEdges = config.min_shared_transition_edges ?? 2;

    if (shared.length < minSharedEdges) {
        return null;
    }

    const missing = backendDef.values.filter((value) => !frontendValues.has(value));
    const extra = frontendDef.values.filter((value) => !backendValues.has(value));
    const exact = missing.length === 0 && extra.length === 0;

    return {
        score: exact ? 2000 + shared.length : shared.length * 20 - missing.length - extra.length,
        duplicateMode: exact ? 'exact-duplicate' : 'drifted-duplicate',
        shared,
        missing,
        extra,
    };
}

function compareDefinitions(frontendDef, backendDef, config) {
    if (!isCompatibleResource(frontendDef, backendDef)) {
        return null;
    }

    if (frontendDef.kind !== backendDef.kind) {
        return null;
    }

    if (frontendDef.kind === 'set') {
        return compareSetDefinitions(frontendDef, backendDef, config);
    }

    if (frontendDef.kind === 'transition-map') {
        return compareTransitionDefinitions(frontendDef, backendDef, config);
    }

    return null;
}

export function collectDuplicateRuleEvents(workspaceRoot, config, toolVersion = 'unknown') {
    const backendRoots = Array.isArray(config.backend_contract_roots) ? config.backend_contract_roots : ['backend/src'];
    const frontendRoots = Array.isArray(config.frontend_contract_roots) ? config.frontend_contract_roots : ['frontend/src'];
    const backendDefinitions = collectDefinitions(workspaceRoot, backendRoots, 'backend');
    const frontendDefinitions = collectDefinitions(workspaceRoot, frontendRoots, 'frontend');
    const normalizedEvents = [];

    for (const frontendDef of frontendDefinitions) {
        const candidates = backendDefinitions
            .map((backendDef) => ({
                backendDef,
                comparison: compareDefinitions(frontendDef, backendDef, config),
            }))
            .filter((entry) => entry.comparison);

        if (candidates.length === 0) {
            continue;
        }

        if (
            frontendDef.subtype === 'key-set'
            && /labels?/i.test(frontendDef.definitionName)
            && candidates.some((entry) => entry.comparison.duplicateMode === 'exact-duplicate')
        ) {
            continue;
        }

        candidates.sort((left, right) => right.comparison.score - left.comparison.score);
        const best = candidates[0];

        normalizedEvents.push({
            source_tool: 'cross-static',
            source_tool_version: toolVersion,
            source_rule_id: 'cross-static/unsynchronized-cross-contract-duplicate-definition',
            event_type: 'cross_contract_violation',
            location: {
                file: frontendDef.file,
                line: null,
                column: null,
            },
            payload: {
                resource: frontendDef.resource,
                contract_token: frontendDef.contractToken,
                duplicate_mode: best.comparison.duplicateMode,
                frontend_file: frontendDef.file,
                frontend_definition: frontendDef.definitionName,
                frontend_definition_kind: frontendDef.subtype,
                backend_file: best.backendDef.file,
                backend_definition: best.backendDef.definitionName,
                backend_definition_kind: best.backendDef.subtype,
                shared_values: best.comparison.shared,
                missing_values: best.comparison.missing,
                extra_values: best.comparison.extra,
            },
        });
    }

    return {
        normalizedEvents,
        stats: {
            backend_duplicate_contract_definitions: backendDefinitions.length,
            frontend_duplicate_contract_definitions: frontendDefinitions.length,
            cross_duplicate_violation_count: normalizedEvents.length,
        },
    };
}
