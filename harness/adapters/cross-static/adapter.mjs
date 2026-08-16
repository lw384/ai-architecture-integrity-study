import fs from 'node:fs';
import path from 'node:path';
import parser from '@typescript-eslint/parser';
import { isProductionSourcePath } from '../_shared/production-files.mjs';
import { collectPropagationRuleEvents } from './propagation-contracts.mjs';
import { collectTypeRuleEvents } from './type-contracts.mjs';

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
    const joined = toPosixJoin('/', prefix || '', apiPath || '');
    return joined
        .replace(/\/+/g, '/')
        .replace(/\/:([^/]+)/g, '/:param')
        .replace(/\/$/, '') || '/';
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

function collectBackendEndpoints(workspaceRoot, config) {
    const controllerRoots = Array.isArray(config.backend_controller_roots)
        ? config.backend_controller_roots
        : ['backend/src/modules'];
    const prefix = extractBackendPrefix(workspaceRoot, config);
    const endpoints = [];
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

                        endpoints.push({
                            file: relativeFile,
                            method,
                            path: normalizePublicPath(prefix, controllerBasePath, routePath),
                        });
                    }
                }
            }
        }
    }

    return endpoints;
}

function collectFrontendEndpoints(workspaceRoot, config) {
    const apiRoots = Array.isArray(config.frontend_api_roots)
        ? config.frontend_api_roots
        : ['frontend/src/api'];
    const prefix = config.required_prefix ?? 'api';
    const endpoints = [];

    for (const root of apiRoots) {
        const absoluteRoot = path.resolve(workspaceRoot, root);
        const files = listFiles(absoluteRoot, (filePath) => /\.(js|jsx|ts|tsx)$/.test(filePath));

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
                    }
                }

                endpoints.push({
                    file: relativeFile,
                    method,
                    path: normalizeFrontendPath(prefix, apiPath),
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

export async function runAdapter({ targetDir, adapterConfig, toolVersion, runtimeContext }) {
    const config = readConfig(adapterConfig?.configPath);
    const inventoryConfig = config.endpoint_inventory ?? {};
    const backendEndpoints = collectBackendEndpoints(targetDir, inventoryConfig);
    const frontendEndpoints = collectFrontendEndpoints(targetDir, inventoryConfig);
    const backendByPath = new Map();
    const normalizedEvents = [];

    for (const endpoint of backendEndpoints) {
        const byPath = backendByPath.get(endpoint.path) ?? [];
        byPath.push(endpoint);
        backendByPath.set(endpoint.path, byPath);
    }

    for (const endpoint of frontendEndpoints) {
        const backendEndpointsForPath = backendByPath.get(endpoint.path) ?? [];

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
        }
    }

    const typeRule = collectTypeRuleEvents(targetDir, config);
    const propagationRule = collectPropagationRuleEvents(targetDir, config.propagation_inventory ?? {}, runtimeContext, toolVersion);
    normalizedEvents.push(...typeRule.normalizedEvents, ...propagationRule.normalizedEvents);

    return {
        normalized_events: normalizedEvents,
        execution_meta: {
            status: 'ok',
            tool_version: toolVersion,
            config_path: adapterConfig?.configPath ?? null,
            frontend_endpoint_count: frontendEndpoints.length,
            backend_endpoint_count: backendEndpoints.length,
            ...typeRule.stats,
            ...propagationRule.stats,
        },
    };
}
