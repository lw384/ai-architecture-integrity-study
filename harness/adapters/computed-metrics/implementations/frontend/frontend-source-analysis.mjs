import fs from 'node:fs';
import path from 'node:path';
import parser from '@typescript-eslint/parser';
import { isProductionSourcePath } from '../../../_shared/production-files.mjs';

export function toPosixPath(value) {
    return value.split(path.sep).join('/');
}

function walkDirectory(dirPath, onFile) {
    if (!fs.existsSync(dirPath)) {
        return;
    }

    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
        const entryPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
            walkDirectory(entryPath, onFile);
            continue;
        }

        onFile(entryPath);
    }
}

export function listFiles(rootDir, predicate) {
    const files = [];

    walkDirectory(rootDir, (filePath) => {
        if (predicate(filePath)) {
            files.push(filePath);
        }
    });

    return files;
}

export function parseFrontendFile(filePath) {
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

export function walkAst(node, visitor, parent = null) {
    if (!node || typeof node !== 'object') {
        return;
    }

    visitor(node, parent);

    for (const [key, child] of Object.entries(node)) {
        if (key === 'parent' || key === 'tokens' || key === 'comments') {
            continue;
        }

        if (Array.isArray(child)) {
            for (const item of child) {
                walkAst(item, visitor, node);
            }
            continue;
        }

        if (child && typeof child === 'object') {
            walkAst(child, visitor, node);
        }
    }
}

function collectFrontendFiles(projectRoot, config = {}) {
    const sourceRoots = Array.isArray(config.source_roots) && config.source_roots.length > 0
        ? config.source_roots
        : ['src'];
    const exts = new Set(['.js', '.jsx', '.ts', '.tsx']);
    const files = [];

    for (const sourceRoot of sourceRoots) {
        const absoluteRoot = path.resolve(projectRoot, sourceRoot);

        for (const filePath of listFiles(
            absoluteRoot,
            (candidate) => exts.has(path.extname(candidate)) && isProductionSourcePath(candidate),
        )) {
            files.push(filePath);
        }
    }

    return files;
}

function isTransparentWrapper(node, transparentWrappers) {
    if (node.type === 'JSXFragment') {
        return true;
    }

    if (node.type === 'JSXElement' && node.openingElement?.name?.type === 'JSXIdentifier') {
        return transparentWrappers.has(node.openingElement.name.name);
    }

    return false;
}

function jsxDepth(node, transparentWrappers) {
    let depth = 0;
    let current = node;

    while (current) {
        if ((current.type === 'JSXElement' || current.type === 'JSXFragment') && !isTransparentWrapper(current, transparentWrappers)) {
            depth += 1;
        }

        current = current.parent ?? null;
    }

    return depth;
}

export function analyzeJsxDepth(projectRoot, config = {}) {
    const transparentWrappers = new Set(config.transparent_wrappers ?? [
        'Popper', 'Portal', 'Modal', 'Backdrop',
        'ClickAwayListener', 'Fade', 'Grow', 'Zoom', 'Slide', 'Collapse', 'Transitions',
    ]);
    const details = [];

    for (const filePath of collectFrontendFiles(projectRoot, config)) {
        const relativeFile = toPosixPath(path.relative(projectRoot, filePath));

        if (!/\.(jsx|tsx)$/.test(relativeFile)) {
            continue;
        }

        const { ast } = parseFrontendFile(filePath);
        let maxDepth = 0;

        walkAst(ast, (node, parent) => {
            if (!node || typeof node !== 'object') {
                return;
            }

            node.parent = parent;

            if (node.type === 'JSXElement') {
                maxDepth = Math.max(maxDepth, jsxDepth(node, transparentWrappers));
            }
        });

        details.push({
            file: relativeFile,
            maxDepth,
        });
    }

    const total = details.length;
    const average = total === 0
        ? 0
        : Number((details.reduce((sum, item) => sum + item.maxDepth, 0) / total).toFixed(2));

    return {
        totalComponents: total,
        averageDepth: average,
        details,
    };
}

function isStateHookCall(node) {
    if (node.callee?.type === 'Identifier') {
        return node.callee.name === 'useState' || node.callee.name === 'useReducer';
    }

    return (
        node.callee?.type === 'MemberExpression'
        && node.callee.object?.type === 'Identifier'
        && node.callee.object.name === 'React'
        && node.callee.property?.type === 'Identifier'
        && (node.callee.property.name === 'useState' || node.callee.property.name === 'useReducer')
    );
}

export function analyzeStateDistribution(projectRoot, config = {}) {
    const details = [];
    let localStateHooks = 0;
    let contextProviders = 0;

    for (const filePath of collectFrontendFiles(projectRoot, config)) {
        const relativeFile = toPosixPath(path.relative(projectRoot, filePath));
        const { ast } = parseFrontendFile(filePath);
        let fileLocalStateHooks = 0;
        let fileContextProviders = 0;

        walkAst(ast, (node) => {
            if (node.type === 'CallExpression' && isStateHookCall(node)) {
                fileLocalStateHooks += 1;
            }

            if (
                node.type === 'JSXOpeningElement'
                && node.name?.type === 'JSXMemberExpression'
                && node.name.property?.type === 'JSXIdentifier'
                && node.name.property.name === 'Provider'
            ) {
                fileContextProviders += 1;
            }
        });

        if (fileLocalStateHooks > 0 || fileContextProviders > 0) {
            details.push({
                file: relativeFile,
                localStateHooks: fileLocalStateHooks,
                contextProviders: fileContextProviders,
            });
        }

        localStateHooks += fileLocalStateHooks;
        contextProviders += fileContextProviders;
    }

    const total = localStateHooks + contextProviders;
    const localRatio = total === 0 ? 0 : Number((localStateHooks / total).toFixed(6));
    const contextRatio = total === 0 ? 0 : Number((contextProviders / total).toFixed(6));

    return {
        localStateHooks,
        contextProviders,
        localRatio,
        contextRatio,
        details,
    };
}

function getObjectProperty(node, propertyName) {
    if (!node || node.type !== 'ObjectExpression') {
        return null;
    }

    return node.properties.find((property) => {
        if (!property || property.type !== 'Property' || property.computed) {
            return false;
        }

        if (property.key.type === 'Identifier') {
            return property.key.name === propertyName;
        }

        if (property.key.type === 'Literal') {
            return property.key.value === propertyName;
        }

        return false;
    }) ?? null;
}

function getStaticString(node) {
    if (!node) {
        return null;
    }

    if (node.type === 'Literal' && typeof node.value === 'string') {
        return node.value;
    }

    if (node.type === 'TemplateLiteral' && node.expressions.length === 0 && node.quasis.length === 1) {
        return node.quasis[0].value.cooked ?? null;
    }

    return null;
}

export function analyzeRoutes(projectRoot, config = {}) {
    const routesRoot = path.resolve(projectRoot, config.routes_root ?? 'src/routes');
    const details = [];

    for (const filePath of listFiles(
        routesRoot,
        (candidate) => /\.(js|jsx|ts|tsx)$/.test(candidate) && isProductionSourcePath(candidate),
    )) {
        const relativeFile = toPosixPath(path.relative(projectRoot, filePath));
        const { ast } = parseFrontendFile(filePath);

        walkAst(ast, (node) => {
            if (node.type !== 'ObjectExpression') {
                return;
            }

            const pathProperty = getObjectProperty(node, 'path');

            if (!pathProperty) {
                return;
            }

            const routePath = getStaticString(pathProperty.value);

            if (!routePath) {
                return;
            }

            const paramCount = routePath.split('/').filter((segment) => segment.startsWith(':')).length;

            details.push({
                file: relativeFile,
                routePath,
                paramCount,
            });
        });
    }

    const totalRoutes = details.length;
    const averageParamCount = totalRoutes === 0
        ? 0
        : Number((details.reduce((sum, item) => sum + item.paramCount, 0) / totalRoutes).toFixed(2));

    return {
        totalRoutes,
        averageParamCount,
        details,
    };
}

function classifyStyleSignal(node, fileSignals) {
    if (node.type === 'JSXAttribute' && node.name?.type === 'JSXIdentifier') {
        if (node.name.name === 'sx') {
            fileSignals.add('sx');
        }

        if (node.name.name === 'className') {
            fileSignals.add('className');
        }

        if (node.name.name === 'style') {
            fileSignals.add('style');
        }
    }

    if (node.type === 'CallExpression' && node.callee?.type === 'Identifier' && node.callee.name === 'styled') {
        fileSignals.add('styled');
    }
}

export function analyzeStyleMixing(projectRoot, config = {}) {
    const details = [];
    let mixedFiles = 0;

    for (const filePath of collectFrontendFiles(projectRoot, config)) {
        const relativeFile = toPosixPath(path.relative(projectRoot, filePath));
        const { ast } = parseFrontendFile(filePath);
        const fileSignals = new Set();

        walkAst(ast, (node) => classifyStyleSignal(node, fileSignals));

        const signals = [...fileSignals];
        if (signals.length > 1) {
            mixedFiles += 1;
        }

        details.push({
            file: relativeFile,
            signals,
        });
    }

    const totalFiles = details.length;
    const ratio = totalFiles === 0 ? 0 : Number((mixedFiles / totalFiles).toFixed(6));

    return {
        totalFiles,
        mixedFiles,
        ratio,
        details,
    };
}

function collectAxiosAliases(ast) {
    const aliases = new Set();

    for (const stmt of ast.body ?? []) {
        if (stmt.type !== 'ImportDeclaration' || stmt.source?.value !== 'axios') {
            continue;
        }

        for (const specifier of stmt.specifiers ?? []) {
            if (specifier.local?.name) {
                aliases.add(specifier.local.name);
            }
        }
    }

    return aliases;
}

function isFetchCall(node) {
    return node.callee?.type === 'Identifier' && node.callee.name === 'fetch';
}

function isAxiosCall(node, axiosAliases) {
    if (node.callee?.type === 'Identifier') {
        return axiosAliases.has(node.callee.name);
    }

    return (
        node.callee?.type === 'MemberExpression'
        && node.callee.object?.type === 'Identifier'
        && axiosAliases.has(node.callee.object.name)
    );
}

export function analyzeDataAccessWrapping(projectRoot, config = {}) {
    const approvedPatterns = Array.isArray(config.approved_data_paths) && config.approved_data_paths.length > 0
        ? config.approved_data_paths.map((pattern) => new RegExp(pattern))
        : [
            /^src\/api\//,
            /^src\/pages\/.+Queries\.(js|jsx|ts|tsx)$/,
            /^src\/contexts\/RouteAccessContext\.(jsx|tsx)$/,
        ];
    let totalCalls = 0;
    let approvedCalls = 0;
    const details = [];

    for (const filePath of collectFrontendFiles(projectRoot, config)) {
        const relativeFile = toPosixPath(path.relative(projectRoot, filePath));
        const { ast } = parseFrontendFile(filePath);
        const axiosAliases = collectAxiosAliases(ast);
        let fileCalls = 0;

        walkAst(ast, (node) => {
            if (node.type === 'CallExpression' && (isFetchCall(node) || isAxiosCall(node, axiosAliases))) {
                fileCalls += 1;
            }
        });

        if (fileCalls === 0) {
            continue;
        }

        const approved = approvedPatterns.some((pattern) => pattern.test(relativeFile));

        totalCalls += fileCalls;
        if (approved) {
            approvedCalls += fileCalls;
        }

        details.push({
            file: relativeFile,
            networkCalls: fileCalls,
            approved,
        });
    }

    const ratio = totalCalls === 0 ? 1 : Number((approvedCalls / totalCalls).toFixed(6));

    return {
        totalCalls,
        approvedCalls,
        ratio,
        details,
    };
}

export function analyzePropDrilling(projectRoot, config = {}) {
    const details = [];
    let candidateCount = 0;
    let totalPropFanout = 0;

    for (const filePath of collectFrontendFiles(projectRoot, config)) {
        const relativeFile = toPosixPath(path.relative(projectRoot, filePath));
        const { ast } = parseFrontendFile(filePath);

        walkAst(ast, (node) => {
            if (node.type !== 'JSXOpeningElement') {
                return;
            }

            const propAttributes = (node.attributes ?? []).filter((attribute) => attribute.type === 'JSXAttribute');
            const propCount = propAttributes.length;

            if (propCount >= (config.prop_drilling_threshold ?? 4)) {
                candidateCount += 1;
                totalPropFanout += propCount;
                details.push({
                    file: relativeFile,
                    elementName: node.name?.type === 'JSXIdentifier' ? node.name.name : '<unknown>',
                    propCount,
                });
            }
        });
    }

    const average = candidateCount === 0 ? 0 : Number((totalPropFanout / candidateCount).toFixed(2));

    return {
        candidateCount,
        averagePropFanout: average,
        details,
    };
}

export function analyzeUncachedApiCalls(projectRoot, config = {}) {
    const details = [];
    let totalNetworkCalls = 0;
    let uncachedCalls = 0;

    for (const filePath of collectFrontendFiles(projectRoot, config)) {
        const relativeFile = toPosixPath(path.relative(projectRoot, filePath));
        const { ast } = parseFrontendFile(filePath);
        const axiosAliases = collectAxiosAliases(ast);
        const inQueryWrapper = /Queries\.(js|jsx|ts|tsx)$/.test(relativeFile);
        let fileCalls = 0;
        let fileUncached = 0;

        walkAst(ast, (node, parent) => {
            if (node.type !== 'CallExpression' || (!isFetchCall(node) && !isAxiosCall(node, axiosAliases))) {
                return;
            }

            fileCalls += 1;

            let current = parent;
            let wrappedByQuery = inQueryWrapper;

            while (current) {
                if (
                    current.type === 'CallExpression'
                    && current.callee?.type === 'Identifier'
                    && (current.callee.name === 'useQuery' || current.callee.name === 'useInfiniteQuery')
                ) {
                    wrappedByQuery = true;
                    break;
                }

                current = current.parent ?? null;
            }

            if (!wrappedByQuery) {
                fileUncached += 1;
            }
        });

        if (fileCalls > 0) {
            details.push({
                file: relativeFile,
                networkCalls: fileCalls,
                uncachedCalls: fileUncached,
            });
        }

        totalNetworkCalls += fileCalls;
        uncachedCalls += fileUncached;
    }

    const ratio = totalNetworkCalls === 0 ? 0 : Number((uncachedCalls / totalNetworkCalls).toFixed(6));

    return {
        totalNetworkCalls,
        uncachedCalls,
        ratio,
        details,
    };
}
