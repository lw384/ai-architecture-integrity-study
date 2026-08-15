import fs from 'node:fs';
import path from 'node:path';
import parser from '@typescript-eslint/parser';
import { collectDuplicateRuleEvents } from './duplicate-contracts.mjs';
import { collectPropagationRuleEvents } from './propagation-contracts.mjs';
import { collectTypeRuleEvents } from './type-contracts.mjs';

const HTTP_STATUS_VALUES = {
    CONTINUE: 100,
    SWITCHING_PROTOCOLS: 101,
    PROCESSING: 102,
    EARLYHINTS: 103,
    OK: 200,
    CREATED: 201,
    ACCEPTED: 202,
    NON_AUTHORITATIVE_INFORMATION: 203,
    NO_CONTENT: 204,
    RESET_CONTENT: 205,
    PARTIAL_CONTENT: 206,
    AMBIGUOUS: 300,
    MOVED_PERMANENTLY: 301,
    FOUND: 302,
    SEE_OTHER: 303,
    NOT_MODIFIED: 304,
    TEMPORARY_REDIRECT: 307,
    PERMANENT_REDIRECT: 308,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    PAYMENT_REQUIRED: 402,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    METHOD_NOT_ALLOWED: 405,
    NOT_ACCEPTABLE: 406,
    PROXY_AUTHENTICATION_REQUIRED: 407,
    REQUEST_TIMEOUT: 408,
    CONFLICT: 409,
    GONE: 410,
    PAYLOAD_TOO_LARGE: 413,
    UNSUPPORTED_MEDIA_TYPE: 415,
    UNPROCESSABLE_ENTITY: 422,
    TOO_MANY_REQUESTS: 429,
    INTERNAL_SERVER_ERROR: 500,
    NOT_IMPLEMENTED: 501,
    BAD_GATEWAY: 502,
    SERVICE_UNAVAILABLE: 503,
    GATEWAY_TIMEOUT: 504,
};

function readConfig(configPath) {
    if (!configPath || !fs.existsSync(configPath)) {
        return {};
    }

    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

function normalizePath(value) {
    return value.split(path.sep).join('/');
}

function toPosixJoin(...parts) {
    return normalizePath(path.posix.join(...parts));
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

function walkAst(node, visitor, parent = null) {
    if (!node || typeof node !== 'object') {
        return;
    }

    visitor(node, parent);

    for (const [key, value] of Object.entries(node)) {
        if (key === 'parent' || key === 'tokens' || key === 'comments') {
            continue;
        }

        if (Array.isArray(value)) {
            for (const item of value) {
                walkAst(item, visitor, node);
            }
            continue;
        }

        if (value && typeof value === 'object') {
            walkAst(value, visitor, node);
        }
    }
}

function getStaticString(node) {
    if (!node) {
        return null;
    }

    if (node.type === 'Literal' && typeof node.value === 'string') {
        return node.value;
    }

    if (node.type === 'TemplateLiteral') {
        let built = '';

        for (let index = 0; index < node.quasis.length; index += 1) {
            built += node.quasis[index].value.cooked ?? '';

            if (index < node.expressions.length) {
                built += ':param';
            }
        }

        return built;
    }

    return null;
}

function getStaticNumber(node) {
    const unwrapped = unwrapTsExpression(node);

    if (!unwrapped) {
        return null;
    }

    if (unwrapped.type === 'Literal' && typeof unwrapped.value === 'number') {
        return unwrapped.value;
    }

    if (unwrapped.type === 'UnaryExpression' && unwrapped.operator === '-' && unwrapped.argument?.type === 'Literal' && typeof unwrapped.argument.value === 'number') {
        return -unwrapped.argument.value;
    }

    if (
        unwrapped.type === 'MemberExpression'
        && unwrapped.object?.type === 'Identifier'
        && unwrapped.object.name === 'HttpStatus'
    ) {
        const statusName = getPropertyName(unwrapped.property);

        if (statusName && HTTP_STATUS_VALUES[statusName] !== undefined) {
            return HTTP_STATUS_VALUES[statusName];
        }
    }

    return null;
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

function unwrapTsExpression(node) {
    let current = node;

    while (current?.type === 'TSAsExpression' || current?.type === 'TSSatisfiesExpression' || current?.type === 'TSNonNullExpression') {
        current = current.expression;
    }

    return current;
}

function getDecoratorName(decorator) {
    const expression = decorator.expression;

    if (expression?.type === 'CallExpression' && expression.callee?.type === 'Identifier') {
        return expression.callee.name;
    }

    if (expression?.type === 'Identifier') {
        return expression.name;
    }

    return null;
}

function getDecoratorFirstArgString(decorator) {
    const expression = decorator.expression;

    if (expression?.type !== 'CallExpression') {
        return null;
    }

    return getStaticString(expression.arguments[0]);
}

function normalizePublicPath(prefix, controllerPath = '', routePath = '') {
    const joined = toPosixJoin('/', prefix || '', controllerPath || '', routePath || '');
    return joined
        .replace(/\/+/g, '/')
        .replace(/\/:([^/]+)/g, '/:param')
        .replace(/\/$/, '') || '/';
}

function normalizeFrontendPath(prefix, apiPath = '') {
    const pathOnly = apiPath.split(/[?#]/, 1)[0];
    const joined = toPosixJoin('/', prefix || '', pathOnly || '');
    return joined
        .replace(/\/+/g, '/')
        .replace(/\/:([^/]+)/g, '/:param')
        .replace(/\/$/, '') || '/';
}

// Endpoint constraints evaluate production API clients, not tests or fixture data.
function isProductionFrontendFile(workspaceRoot, filePath) {
    const relativeFile = normalizePath(path.relative(workspaceRoot, filePath));

    return !/(^|\/)(?:__tests__|fixtures?|stories?|mocks?|generated)(\/|$)/i.test(relativeFile)
        && !/\.(?:test|spec|stories)\.(?:js|jsx|ts|tsx)$/i.test(relativeFile);
}

function splitRoutePath(routePath) {
    return routePath.split('/').filter(Boolean);
}

/**
 * Match one frontend path against a backend route pattern segment by segment.
 * A backend parameter accepts either a concrete frontend segment or a frontend
 * template parameter. A frontend parameter does not match a fixed backend
 * segment because its runtime values cannot be proven to resolve to that route.
 */
function backendRouteMatchesFrontendPath(frontendPath, backendPath) {
    const frontendSegments = splitRoutePath(frontendPath);
    const backendSegments = splitRoutePath(backendPath);

    if (frontendSegments.length !== backendSegments.length) {
        return false;
    }

    return frontendSegments.every((frontendSegment, index) => {
        const backendSegment = backendSegments[index];

        return backendSegment === frontendSegment || backendSegment === ':param';
    });
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

function firstPathSegment(routePath) {
    if (!routePath) {
        return null;
    }

    return routePath
        .replace(/^\/+/, '')
        .split('/')
        .find((segment) => segment && !segment.startsWith(':')) ?? null;
}

function memberExpressionChain(node) {
    const parts = [];
    let current = node;

    while (current?.type === 'MemberExpression') {
        if (current.property?.type === 'Identifier') {
            parts.unshift(current.property.name);
        } else if (current.property?.type === 'Literal' && typeof current.property.value === 'string') {
            parts.unshift(current.property.value);
        }

        current = current.object;
    }

    if (current?.type === 'Identifier') {
        parts.unshift(current.name);
    }

    return parts;
}

function expressionReferencesCode(node) {
    if (!node || typeof node !== 'object') {
        return false;
    }

    if (node.type === 'Identifier') {
        return node.name === 'code';
    }

    if (node.type === 'MemberExpression') {
        return memberExpressionChain(node).includes('code');
    }

    if (node.type === 'ChainExpression') {
        return expressionReferencesCode(node.expression);
    }

    return false;
}

function extractBackendPrefix(workspaceRoot, config) {
    const requiredPrefix = config.required_prefix ?? 'api';
    const candidates = Array.isArray(config.main_file_candidates) ? config.main_file_candidates : [];

    for (const relativePath of candidates) {
        const filePath = path.resolve(workspaceRoot, relativePath);

        if (!fs.existsSync(filePath)) {
            continue;
        }

        const content = fs.readFileSync(filePath, 'utf8');
        const match = content.match(/setGlobalPrefix\(\s*['"`]([^'"`]+)['"`]\s*\)/);

        if (match?.[1]) {
            return match[1];
        }
    }

    return requiredPrefix;
}

function resolveLocalTypeScriptFile(importerPath, importSource) {
    if (typeof importSource !== 'string' || !importSource.startsWith('.')) {
        return null;
    }

    const unresolvedPath = path.resolve(path.dirname(importerPath), importSource);
    const candidates = [
        unresolvedPath,
        `${unresolvedPath}.ts`,
        path.join(unresolvedPath, 'index.ts'),
    ];

    return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

function collectLocalImports(ast, importerPath) {
    const imports = new Map();

    for (const statement of ast.body ?? []) {
        if (statement.type !== 'ImportDeclaration') {
            continue;
        }

        const importedFile = resolveLocalTypeScriptFile(importerPath, statement.source?.value);

        if (!importedFile) {
            continue;
        }

        for (const specifier of statement.specifiers ?? []) {
            if (specifier.local?.name) {
                imports.set(specifier.local.name, importedFile);
            }
        }
    }

    return imports;
}

function getClassNodes(ast) {
    return (ast.body ?? []).flatMap((statement) => {
        const declaration = statement.type === 'ExportNamedDeclaration'
            ? statement.declaration
            : statement;

        return declaration?.type === 'ClassDeclaration' ? [declaration] : [];
    });
}

function getModuleMetadata(classNode) {
    const moduleDecorator = (classNode.decorators ?? []).find(
        (decorator) => getDecoratorName(decorator) === 'Module',
    );
    const metadata = moduleDecorator?.expression?.arguments?.[0];

    return metadata?.type === 'ObjectExpression' ? metadata : null;
}

function getMetadataIdentifiers(metadata, propertyName) {
    const property = (metadata?.properties ?? []).find(
        (candidate) => candidate.type === 'Property'
            && !candidate.computed
            && getPropertyName(candidate.key) === propertyName,
    );
    const value = unwrapTsExpression(property?.value);

    if (value?.type !== 'ArrayExpression') {
        return [];
    }

    return value.elements.flatMap((element) => {
        const unwrapped = unwrapTsExpression(element);
        return unwrapped?.type === 'Identifier' ? [unwrapped.name] : [];
    });
}

function collectNestModuleRecords(workspaceRoot, config) {
    const moduleRoots = Array.isArray(config.backend_module_roots)
        ? config.backend_module_roots
        : ['backend/src'];
    const records = new Map();

    for (const root of moduleRoots) {
        const files = listFiles(
            path.resolve(workspaceRoot, root),
            (filePath) => /\.module\.ts$/.test(filePath),
        );

        for (const filePath of files) {
            const { ast } = parseFile(filePath);
            const localImports = collectLocalImports(ast, filePath);

            for (const classNode of getClassNodes(ast)) {
                const metadata = getModuleMetadata(classNode);

                if (!metadata) {
                    continue;
                }

                records.set(path.resolve(filePath), {
                    importedModules: getMetadataIdentifiers(metadata, 'imports')
                        .map((name) => localImports.get(name))
                        .filter(Boolean)
                        .map((importedFile) => path.resolve(importedFile)),
                    controllers: getMetadataIdentifiers(metadata, 'controllers')
                        .map((name) => localImports.get(name))
                        .filter(Boolean)
                        .map((controllerFile) => path.resolve(controllerFile)),
                });
            }
        }
    }

    return records;
}

function findApplicationRootModule(workspaceRoot, config) {
    const candidates = Array.isArray(config.main_file_candidates)
        ? config.main_file_candidates
        : [];

    for (const relativePath of candidates) {
        const mainFile = path.resolve(workspaceRoot, relativePath);

        if (!fs.existsSync(mainFile)) {
            continue;
        }

        const { ast } = parseFile(mainFile);
        const localImports = collectLocalImports(ast, mainFile);
        let rootModuleName = null;

        walkAst(ast, (node) => {
            if (
                node.type === 'CallExpression'
                && node.callee?.type === 'MemberExpression'
                && node.callee.object?.type === 'Identifier'
                && node.callee.object.name === 'NestFactory'
                && getPropertyName(node.callee.property) === 'create'
                && node.arguments?.[0]?.type === 'Identifier'
            ) {
                rootModuleName = node.arguments[0].name;
            }
        });

        const rootModuleFile = localImports.get(rootModuleName);

        if (rootModuleFile) {
            return path.resolve(rootModuleFile);
        }
    }

    return null;
}

/** Resolve controllers reachable from the module passed to NestFactory.create(). */
function collectReachableControllerFiles(workspaceRoot, config) {
    if (config.verify_controller_reachability === false) {
        return null;
    }

    const rootModule = findApplicationRootModule(workspaceRoot, config);
    const moduleRecords = collectNestModuleRecords(workspaceRoot, config);

    if (!rootModule || !moduleRecords.has(rootModule)) {
        throw new Error('Unable to resolve the NestJS root module for endpoint reachability analysis.');
    }

    const controllers = new Set();
    const visitedModules = new Set();
    const pendingModules = [rootModule];

    while (pendingModules.length > 0) {
        const moduleFile = pendingModules.pop();

        if (visitedModules.has(moduleFile)) {
            continue;
        }

        visitedModules.add(moduleFile);
        const record = moduleRecords.get(moduleFile);

        if (!record) {
            continue;
        }

        record.controllers.forEach((controllerFile) => controllers.add(controllerFile));
        record.importedModules.forEach((importedModule) => {
            if (moduleRecords.has(importedModule)) {
                pendingModules.push(importedModule);
            }
        });
    }

    return controllers;
}

function collectBackendEndpoints(workspaceRoot, config) {
    const controllerRoots = Array.isArray(config.backend_controller_roots)
        ? config.backend_controller_roots
        : ['backend/src/modules'];
    const prefix = extractBackendPrefix(workspaceRoot, config);
    const reachableControllerFiles = collectReachableControllerFiles(workspaceRoot, config);
    const endpoints = [];
    let declaredControllerCount = 0;
    let reachableControllerCount = 0;
    const methodDecorators = new Map([
        ['Get', 'GET'],
        ['Post', 'POST'],
        ['Put', 'PUT'],
        ['Patch', 'PATCH'],
        ['Delete', 'DELETE'],
    ]);

    for (const root of controllerRoots) {
        const absoluteRoot = path.resolve(workspaceRoot, root);
        const files = listFiles(absoluteRoot, (filePath) => /\.controller\.ts$/.test(filePath));

        for (const filePath of files) {
            declaredControllerCount += 1;

            if (reachableControllerFiles && !reachableControllerFiles.has(path.resolve(filePath))) {
                continue;
            }

            reachableControllerCount += 1;
            const relativeFile = normalizePath(path.relative(workspaceRoot, filePath));
            const { ast } = parseFile(filePath);
            let controllerBasePath = '';

            for (const statement of ast.body ?? []) {
                if (statement.type !== 'ExportNamedDeclaration' && statement.type !== 'ClassDeclaration') {
                    continue;
                }

                const classNode = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;

                if (!classNode || classNode.type !== 'ClassDeclaration') {
                    continue;
                }

                for (const decorator of classNode.decorators ?? []) {
                    if (getDecoratorName(decorator) === 'Controller') {
                        controllerBasePath = getDecoratorFirstArgString(decorator) ?? '';
                    }
                }

                for (const member of classNode.body.body ?? []) {
                    if (member.type !== 'MethodDefinition') {
                        continue;
                    }

                    for (const decorator of member.decorators ?? []) {
                        const decoratorName = getDecoratorName(decorator);
                        const method = methodDecorators.get(decoratorName);

                        if (!method) {
                            continue;
                        }

                        const routePath = getDecoratorFirstArgString(decorator) ?? '';
                        const explicitStatusDecorator = (member.decorators ?? []).find(
                            (item) => getDecoratorName(item) === 'HttpCode',
                        );
                        const explicitStatus = explicitStatusDecorator
                            ? getStaticNumber(unwrapTsExpression(explicitStatusDecorator.expression.arguments?.[0]))
                            : null;
                        const defaultStatus = method === 'POST' ? 201 : 200;

                        endpoints.push({
                            file: relativeFile,
                            method,
                            path: normalizePublicPath(prefix, controllerBasePath, routePath),
                            status: explicitStatus ?? defaultStatus,
                        });
                    }
                }
            }
        }
    }

    return {
        endpoints,
        stats: {
            backend_declared_controller_count: declaredControllerCount,
            backend_reachable_controller_count: reachableControllerCount,
        },
    };
}

function collectFrontendEndpoints(workspaceRoot, config) {
    const apiRoots = Array.isArray(config.frontend_api_roots)
        ? config.frontend_api_roots
        : ['frontend/src/api'];
    const prefix = config.required_prefix ?? 'api';
    const endpoints = [];

    for (const root of apiRoots) {
        const absoluteRoot = path.resolve(workspaceRoot, root);
        const files = listFiles(
            absoluteRoot,
            (filePath) => /\.(js|jsx|ts|tsx)$/.test(filePath)
                && isProductionFrontendFile(workspaceRoot, filePath),
        );

        for (const filePath of files) {
            const relativeFile = normalizePath(path.relative(workspaceRoot, filePath));
            const { ast } = parseFile(filePath);
            const requestAliases = new Set();

            walkAst(ast, (node, parent) => {
                node.parent = parent;

                if (
                    node.type === 'ImportDeclaration'
                    && typeof node.source?.value === 'string'
                    && /(\/|^)request$/.test(node.source.value.replace(/\.(js|jsx|ts|tsx)$/, ''))
                ) {
                    for (const specifier of node.specifiers ?? []) {
                        if (specifier.type === 'ImportSpecifier' && specifier.imported?.name === 'request') {
                            requestAliases.add(specifier.local.name);
                        }
                    }
                }
            });

            walkAst(ast, (node) => {
                if (node.type !== 'CallExpression' || node.callee?.type !== 'Identifier' || !requestAliases.has(node.callee.name)) {
                    return;
                }

                const apiPath = getStaticString(node.arguments[0]);

                if (!apiPath) {
                    return;
                }

                let method = 'GET';
                let expectedStatuses = [];
                const options = node.arguments[1];

                if (options?.type === 'ObjectExpression') {
                    for (const property of options.properties ?? []) {
                        if (
                            property?.type === 'Property'
                            && !property.computed
                            && property.key?.type === 'Identifier'
                            && property.key.name === 'method'
                        ) {
                            method = (getStaticString(property.value) ?? method).toUpperCase();
                        }

                        if (
                            property?.type === 'Property'
                            && !property.computed
                            && property.key?.type === 'Identifier'
                            && property.key.name === 'expectedStatus'
                        ) {
                            const value = getStaticNumber(property.value);

                            if (value !== null) {
                                expectedStatuses = [value];
                            }
                        }

                        if (
                            property?.type === 'Property'
                            && !property.computed
                            && property.key?.type === 'Identifier'
                            && property.key.name === 'expectedStatuses'
                            && unwrapTsExpression(property.value)?.type === 'ArrayExpression'
                        ) {
                            expectedStatuses = unwrapTsExpression(property.value).elements
                                .map((element) => getStaticNumber(element))
                                .filter((value) => value !== null);
                        }
                    }
                }

                endpoints.push({
                    file: relativeFile,
                    method,
                    path: normalizeFrontendPath(prefix, apiPath),
                    expectedStatuses,
                    location: node.loc
                        ? {
                            file: relativeFile,
                            start: {
                                line: node.loc.start.line,
                                column: node.loc.start.column,
                            },
                            end: {
                                line: node.loc.end.line,
                                column: node.loc.end.column,
                            },
                        }
                        : { file: relativeFile },
                });
            });
        }
    }

    return endpoints;
}

function collectBackendNamingSurfaces(workspaceRoot, config) {
    const controllerRoots = Array.isArray(config.backend_controller_roots)
        ? config.backend_controller_roots
        : ['backend/src/modules'];
    const surfaces = [];

    for (const root of controllerRoots) {
        const absoluteRoot = path.resolve(workspaceRoot, root);
        const files = listFiles(absoluteRoot, (filePath) => /\.controller\.ts$/.test(filePath));

        for (const filePath of files) {
            const relativeFile = normalizePath(path.relative(workspaceRoot, filePath));
            const { ast } = parseFile(filePath);
            const moduleDir = relativeFile.match(/\/modules\/([^/]+)\//)?.[1] ?? null;
            let controllerPath = null;

            for (const statement of ast.body ?? []) {
                const classNode = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;

                if (!classNode || classNode.type !== 'ClassDeclaration') {
                    continue;
                }

                for (const decorator of classNode.decorators ?? []) {
                    if (getDecoratorName(decorator) === 'Controller') {
                        controllerPath = getDecoratorFirstArgString(decorator);
                    }
                }
            }

            surfaces.push({
                type: 'backend-controller',
                file: relativeFile,
                moduleName: moduleDir,
                routeResource: firstPathSegment(controllerPath),
                canonicalModule: canonicalizeResourceName(moduleDir),
                canonicalRoute: canonicalizeResourceName(firstPathSegment(controllerPath)),
            });
        }
    }

    return surfaces;
}

function collectFrontendApiNamingSurfaces(workspaceRoot, config) {
    const apiRoots = Array.isArray(config.frontend_api_roots)
        ? config.frontend_api_roots
        : ['frontend/src/api'];
    const surfaces = [];

    for (const root of apiRoots) {
        const absoluteRoot = path.resolve(workspaceRoot, root);
        const files = listFiles(absoluteRoot, (filePath) => /\.(js|jsx|ts|tsx)$/.test(filePath));

        for (const filePath of files) {
            const relativeFile = normalizePath(path.relative(workspaceRoot, filePath));
            const fileBaseName = path.basename(relativeFile).replace(/\.(js|jsx|ts|tsx)$/i, '');
            const { ast } = parseFile(filePath);
            const requestAliases = new Set();
            const routeSegments = new Set();

            walkAst(ast, (node) => {
                if (
                    node.type === 'ImportDeclaration'
                    && typeof node.source?.value === 'string'
                    && /(\/|^)request$/.test(node.source.value.replace(/\.(js|jsx|ts|tsx)$/, ''))
                ) {
                    for (const specifier of node.specifiers ?? []) {
                        if (specifier.type === 'ImportSpecifier' && specifier.imported?.name === 'request') {
                            requestAliases.add(specifier.local.name);
                        }
                    }
                }
            });

            walkAst(ast, (node) => {
                if (node.type !== 'CallExpression' || node.callee?.type !== 'Identifier' || !requestAliases.has(node.callee.name)) {
                    return;
                }

                const apiPath = getStaticString(node.arguments[0]);
                const segment = firstPathSegment(apiPath);

                if (segment) {
                    routeSegments.add(segment);
                }
            });

            if (routeSegments.size === 0) {
                continue;
            }

            surfaces.push({
                type: 'frontend-api',
                file: relativeFile,
                apiFileName: fileBaseName,
                routeResources: [...routeSegments],
                canonicalFile: canonicalizeResourceName(fileBaseName),
                canonicalRoutes: [...routeSegments].map((segment) => canonicalizeResourceName(segment)).filter(Boolean),
            });
        }
    }

    return surfaces;
}

function collectFrontendRouteNamingSurfaces(workspaceRoot, config) {
    const routeFiles = Array.isArray(config.frontend_route_files)
        ? config.frontend_route_files
        : ['frontend/src/routes/route-registry.js'];
    const surfaces = [];

    for (const relativePath of routeFiles) {
        const filePath = path.resolve(workspaceRoot, relativePath);

        if (!fs.existsSync(filePath)) {
            continue;
        }

        const normalizedFile = normalizePath(path.relative(workspaceRoot, filePath));
        const { ast } = parseFile(filePath);

        walkAst(ast, (node) => {
            if (node.type !== 'ObjectExpression') {
                return;
            }

            let pathValue = null;
            let loaderImport = null;
            let idValue = null;

            for (const property of node.properties ?? []) {
                if (property?.type !== 'Property' || property.computed) {
                    continue;
                }

                const keyName = getPropertyName(property.key);

                if (keyName === 'path') {
                    pathValue = getStaticString(property.value);
                }

                if (keyName === 'id') {
                    idValue = getStaticString(property.value);
                }

                if (
                    keyName === 'loader'
                    && property.value?.type
                    && ['ArrowFunctionExpression', 'FunctionExpression'].includes(property.value.type)
                ) {
                    if (property.value.body?.type === 'ImportExpression') {
                        loaderImport = getStaticString(property.value.body.source);
                    }
                }
            }

            if (!pathValue || !loaderImport || !loaderImport.startsWith('pages/')) {
                return;
            }

            const routeResource = firstPathSegment(pathValue);
            const loaderResource = loaderImport.replace(/^pages\//, '').split('/')[0];

            surfaces.push({
                type: 'frontend-route',
                file: normalizedFile,
                routeId: idValue,
                routeResource,
                loaderResource,
                canonicalRoute: canonicalizeResourceName(routeResource),
                canonicalLoader: canonicalizeResourceName(loaderResource),
                canonicalId: canonicalizeResourceName(idValue),
            });
        });
    }

    return surfaces;
}

function collectBackendDefinedErrorCodes(workspaceRoot, config) {
    const candidates = Array.isArray(config.backend_error_catalog_files)
        ? config.backend_error_catalog_files
        : ['backend/src/common/errors/error-codes.ts'];
    const codes = new Map();

    for (const relativePath of candidates) {
        const filePath = path.resolve(workspaceRoot, relativePath);

        if (!fs.existsSync(filePath)) {
            continue;
        }

        const normalizedFile = normalizePath(path.relative(workspaceRoot, filePath));
        const { ast } = parseFile(filePath);

        walkAst(ast, (node) => {
            if (node.type !== 'VariableDeclarator' || node.id?.type !== 'Identifier' || node.id.name !== 'BUSINESS_ERROR_CODES') {
                return;
            }

            const init = unwrapTsExpression(node.init);

            if (init?.type !== 'ObjectExpression') {
                return;
            }

            for (const property of init.properties ?? []) {
                if (property?.type !== 'Property' || property.computed) {
                    continue;
                }

                const key = getPropertyName(property.key);
                const value = getStaticString(property.value);

                if (key && value) {
                    codes.set(value, normalizedFile);
                }
            }
        });
    }

    return codes;
}

function extractBusinessErrorCodeFromExpression(node) {
    if (!node) {
        return null;
    }

    if (node.type === 'MemberExpression') {
        const chain = memberExpressionChain(node);

        if (chain[0] === 'BUSINESS_ERROR_CODES' && chain.length >= 2) {
            return chain[1];
        }
    }

    if (node.type === 'Literal' && typeof node.value === 'string' && /^[A-Z0-9_]+$/.test(node.value)) {
        return node.value;
    }

    return null;
}

function collectBackendEmittedErrorCodes(workspaceRoot, config) {
    const roots = Array.isArray(config.backend_error_scan_roots)
        ? config.backend_error_scan_roots
        : ['backend/src'];
    const codes = new Map();

    for (const root of roots) {
        const absoluteRoot = path.resolve(workspaceRoot, root);
        const files = listFiles(absoluteRoot, (filePath) => /\.(ts|tsx|js|jsx)$/.test(filePath) && !/\.spec\./.test(filePath));

        for (const filePath of files) {
            const relativeFile = normalizePath(path.relative(workspaceRoot, filePath));
            const { ast } = parseFile(filePath);

            walkAst(ast, (node) => {
                if (node.type === 'NewExpression' && node.callee?.type === 'Identifier' && node.callee.name === 'AppException') {
                    const options = node.arguments[0];

                    if (options?.type !== 'ObjectExpression') {
                        return;
                    }

                    for (const property of options.properties ?? []) {
                        if (
                            property?.type === 'Property'
                            && !property.computed
                            && getPropertyName(property.key) === 'code'
                        ) {
                            const code = extractBusinessErrorCodeFromExpression(property.value);

                            if (code) {
                                codes.set(code, relativeFile);
                            }
                        }
                    }
                }

                if (node.type === 'Property' && !node.computed && getPropertyName(node.key) === 'code') {
                    const code = extractBusinessErrorCodeFromExpression(node.value);

                    if (code) {
                        codes.set(code, relativeFile);
                    }
                }
            });
        }
    }

    return codes;
}

function collectFrontendHandledErrorCodes(workspaceRoot, config) {
    const roots = Array.isArray(config.frontend_error_scan_roots)
        ? config.frontend_error_scan_roots
        : ['frontend/src'];
    const findings = [];

    for (const root of roots) {
        const absoluteRoot = path.resolve(workspaceRoot, root);
        const files = listFiles(absoluteRoot, (filePath) => /\.(js|jsx|ts|tsx)$/.test(filePath));

        for (const filePath of files) {
            const relativeFile = normalizePath(path.relative(workspaceRoot, filePath));
            const { ast } = parseFile(filePath);

            walkAst(ast, (node) => {
                if (node.type !== 'BinaryExpression' || !['===', '==', '!==', '!='].includes(node.operator)) {
                    return;
                }

                const leftValue = getStaticString(node.left);
                const rightValue = getStaticString(node.right);

                if (leftValue && expressionReferencesCode(node.right) && /^[A-Z0-9_]+$/.test(leftValue)) {
                    findings.push({
                        code: leftValue,
                        file: relativeFile,
                        location: node.loc
                            ? {
                                file: relativeFile,
                                start: node.loc.start,
                                end: node.loc.end,
                            }
                            : { file: relativeFile },
                    });
                }

                if (rightValue && expressionReferencesCode(node.left) && /^[A-Z0-9_]+$/.test(rightValue)) {
                    findings.push({
                        code: rightValue,
                        file: relativeFile,
                        location: node.loc
                            ? {
                                file: relativeFile,
                                start: node.loc.start,
                                end: node.loc.end,
                            }
                            : { file: relativeFile },
                    });
                }
            });
        }
    }

    return findings;
}

function collectNameRuleEvents(workspaceRoot, config) {
    const namingConfig = config.naming_inventory ?? {};
    const backendSurfaces = collectBackendNamingSurfaces(workspaceRoot, {
        backend_controller_roots: namingConfig.backend_controller_roots,
    });
    const frontendApiSurfaces = collectFrontendApiNamingSurfaces(workspaceRoot, {
        frontend_api_roots: namingConfig.frontend_api_roots,
    });
    const frontendRouteSurfaces = collectFrontendRouteNamingSurfaces(workspaceRoot, {
        frontend_route_files: namingConfig.frontend_route_files,
    });
    const normalizedEvents = [];
    const backendCanonicalResources = new Set(
        backendSurfaces.flatMap((surface) => [surface.canonicalModule, surface.canonicalRoute]).filter(Boolean),
    );

    for (const surface of backendSurfaces) {
        if (surface.canonicalModule && surface.canonicalRoute && surface.canonicalModule !== surface.canonicalRoute) {
            normalizedEvents.push({
                source_tool: 'cross-static',
                source_rule_id: 'cross-static/canonical-resource-name-mismatch',
                event_type: 'cross_contract_violation',
                location: { file: surface.file },
                payload: {
                    surface: 'backend-module-controller',
                    file: surface.file,
                    expected_resource: surface.moduleName,
                    actual_resource: surface.routeResource,
                },
            });
        }
    }

    for (const surface of frontendApiSurfaces) {
        const routeCanonicals = [...new Set(surface.canonicalRoutes)];

        if (surface.canonicalFile && routeCanonicals.length === 1 && routeCanonicals[0] && surface.canonicalFile !== routeCanonicals[0]) {
            normalizedEvents.push({
                source_tool: 'cross-static',
                source_rule_id: 'cross-static/canonical-resource-name-mismatch',
                event_type: 'cross_contract_violation',
                location: { file: surface.file },
                payload: {
                    surface: 'frontend-api',
                    file: surface.file,
                    expected_resource: surface.apiFileName,
                    actual_resource: surface.routeResources.join(', '),
                },
            });
        }

        for (const canonicalRoute of routeCanonicals) {
            if (canonicalRoute && !backendCanonicalResources.has(canonicalRoute)) {
                normalizedEvents.push({
                    source_tool: 'cross-static',
                    source_rule_id: 'cross-static/canonical-resource-name-mismatch',
                    event_type: 'cross_contract_violation',
                    location: { file: surface.file },
                    payload: {
                        surface: 'frontend-api-backend',
                        file: surface.file,
                        expected_resource: surface.routeResources.join(', '),
                        actual_resource: 'no matching backend resource',
                    },
                });
            }
        }
    }

    for (const surface of frontendRouteSurfaces) {
        if (surface.canonicalRoute && surface.canonicalLoader && surface.canonicalRoute !== surface.canonicalLoader) {
            normalizedEvents.push({
                source_tool: 'cross-static',
                source_rule_id: 'cross-static/canonical-resource-name-mismatch',
                event_type: 'cross_contract_violation',
                location: { file: surface.file },
                payload: {
                    surface: 'frontend-route-page',
                    file: surface.file,
                    expected_resource: surface.routeResource,
                    actual_resource: surface.loaderResource,
                },
            });
        }

        if (surface.canonicalRoute && !backendCanonicalResources.has(surface.canonicalRoute)) {
            normalizedEvents.push({
                source_tool: 'cross-static',
                source_rule_id: 'cross-static/canonical-resource-name-mismatch',
                event_type: 'cross_contract_violation',
                location: { file: surface.file },
                payload: {
                    surface: 'frontend-route-backend',
                    file: surface.file,
                    expected_resource: surface.routeResource,
                    actual_resource: 'no matching backend resource',
                },
            });
        }
    }

    return {
        normalizedEvents,
        stats: {
            backend_surface_count: backendSurfaces.length,
            frontend_api_surface_count: frontendApiSurfaces.length,
            frontend_route_surface_count: frontendRouteSurfaces.length,
        },
    };
}

function collectErrorRuleEvents(workspaceRoot, config) {
    const errorConfig = config.error_inventory ?? {};
    const definedCodes = collectBackendDefinedErrorCodes(workspaceRoot, errorConfig);
    const emittedCodes = collectBackendEmittedErrorCodes(workspaceRoot, errorConfig);
    const handledCodes = collectFrontendHandledErrorCodes(workspaceRoot, errorConfig);
    const normalizedEvents = [];

    for (const handled of handledCodes) {
        if (!definedCodes.has(handled.code)) {
            normalizedEvents.push({
                source_tool: 'cross-static',
                source_rule_id: 'cross-static/frontend-handled-error-code-not-defined',
                event_type: 'cross_contract_violation',
                location: handled.location,
                payload: {
                    frontend_code: handled.code,
                    frontend_file: handled.file,
                    reason: 'not defined by backend error catalog',
                },
            });
            continue;
        }

        if (!emittedCodes.has(handled.code)) {
            normalizedEvents.push({
                source_tool: 'cross-static',
                source_rule_id: 'cross-static/frontend-handled-error-code-not-emitted',
                event_type: 'cross_contract_violation',
                location: handled.location,
                payload: {
                    frontend_code: handled.code,
                    frontend_file: handled.file,
                    reason: 'defined by backend but not emitted from backend flows',
                },
            });
        }
    }

    return {
        normalizedEvents,
        stats: {
            backend_defined_error_codes: definedCodes.size,
            backend_emitted_error_codes: emittedCodes.size,
            frontend_handled_error_codes: handledCodes.length,
        },
    };
}

function uniqueSorted(values) {
    return [...new Set(values)].sort((left, right) => {
        if (typeof left === 'number' && typeof right === 'number') {
            return left - right;
        }

        return String(left).localeCompare(String(right));
    });
}

export async function runAdapter({ targetDir, adapterConfig, toolVersion, runtimeContext }) {
    const config = readConfig(adapterConfig?.configPath);
    const inventoryConfig = config.endpoint_inventory ?? {};
    const backendInventory = collectBackendEndpoints(targetDir, inventoryConfig);
    const backendEndpoints = backendInventory.endpoints;
    const frontendEndpoints = collectFrontendEndpoints(targetDir, inventoryConfig);
    const normalizedEvents = [];

    for (const endpoint of frontendEndpoints) {
        const backendEndpointsForPath = backendEndpoints.filter(
            (backendEndpoint) => backendRouteMatchesFrontendPath(endpoint.path, backendEndpoint.path),
        );

        if (backendEndpointsForPath.length === 0) {
            normalizedEvents.push({
                source_tool: 'cross-static',
                source_rule_id: 'cross-static/frontend-endpoint-missing-backend-route',
                event_type: 'cross_contract_violation',
                location: endpoint.location,
                payload: {
                    frontend_method: endpoint.method,
                    frontend_path: endpoint.path,
                    frontend_file: endpoint.file,
                },
            });
            continue;
        }

        const backendEndpointsForMethod = backendEndpointsForPath.filter(
            (backendEndpoint) => backendEndpoint.method === endpoint.method,
        );

        if (backendEndpointsForMethod.length === 0) {
            normalizedEvents.push({
                source_tool: 'cross-static',
                source_rule_id: 'cross-static/frontend-endpoint-method-mismatch',
                event_type: 'cross_contract_violation',
                location: endpoint.location,
                payload: {
                    frontend_method: endpoint.method,
                    frontend_path: endpoint.path,
                    frontend_file: endpoint.file,
                    backend_methods: uniqueSorted(backendEndpointsForPath.map((item) => item.method)).join(', '),
                },
            });
            continue;
        }

        const backendStatuses = uniqueSorted(
            backendEndpointsForMethod.map((backendEndpoint) => backendEndpoint.status),
        );

        if (
            endpoint.expectedStatuses.length > 0
            && !backendStatuses.some((status) => endpoint.expectedStatuses.includes(status))
        ) {
            normalizedEvents.push({
                source_tool: 'cross-static',
                source_rule_id: 'cross-static/frontend-endpoint-status-mismatch',
                event_type: 'cross_contract_violation',
                location: endpoint.location,
                payload: {
                    frontend_method: endpoint.method,
                    frontend_path: endpoint.path,
                    frontend_file: endpoint.file,
                    expected_statuses: endpoint.expectedStatuses.join(', '),
                    backend_status: backendStatuses.join(', '),
                },
            });
        }
    }

    const nameRule = collectNameRuleEvents(targetDir, config);
    const errorRule = collectErrorRuleEvents(targetDir, config);
    const typeRule = collectTypeRuleEvents(targetDir, config);
    const propagationRule = collectPropagationRuleEvents(targetDir, config.propagation_inventory ?? {}, runtimeContext, toolVersion);
    const duplicateRule = collectDuplicateRuleEvents(targetDir, config.duplicate_inventory ?? {}, toolVersion);
    normalizedEvents.push(...nameRule.normalizedEvents, ...errorRule.normalizedEvents, ...typeRule.normalizedEvents, ...propagationRule.normalizedEvents, ...duplicateRule.normalizedEvents);

    return {
        normalized_events: normalizedEvents,
        execution_meta: {
            status: 'ok',
            tool_version: toolVersion,
            config_path: adapterConfig?.configPath ?? null,
            frontend_endpoint_count: frontendEndpoints.length,
            backend_endpoint_count: backendEndpoints.length,
            frontend_explicit_success_status_count: frontendEndpoints.filter((endpoint) => endpoint.expectedStatuses.length > 0).length,
            ...backendInventory.stats,
            ...nameRule.stats,
            ...errorRule.stats,
            ...typeRule.stats,
            ...propagationRule.stats,
            ...duplicateRule.stats,
        },
    };
}
