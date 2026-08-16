// Build frontend facts once so every constraint reasons over the same files,
// bindings, routes, hooks, owners, and candidate logic implementations.
import fs from 'node:fs';
import path from 'node:path';
import { isProductionSourcePath, normalizeSourcePath } from '../_shared/production-files.mjs';
import {
    buildProject,
    expressionName,
    getProperty,
} from '../backend-static/project.mjs';

const STYLE_EXTENSIONS = new Set(['.css', '.scss', '.sass']);
const ROUTE_APIS = new Set([
    'createBrowserRouter',
    'createHashRouter',
    'createMemoryRouter',
    'createRoutesFromElements',
    'useRoutes',
]);
const SKIP_DIRECTORIES = new Set(['node_modules', 'dist', 'build', 'coverage', '.git']);

function visitAst(node, visitor, parent = null) {
    if (!node || typeof node !== 'object') return;
    visitor(node, parent);

    for (const [key, child] of Object.entries(node)) {
        if (['parent', 'tokens', 'comments'].includes(key)) continue;

        if (Array.isArray(child)) {
            for (const item of child) visitAst(item, visitor, node);
        } else if (child && typeof child === 'object') {
            visitAst(child, visitor, node);
        }
    }
}

function declarationOf(statement) {
    if (statement?.type === 'ExportNamedDeclaration' || statement?.type === 'ExportDefaultDeclaration') {
        return statement.declaration;
    }
    return statement;
}

export function patternNames(pattern, names = new Set()) {
    if (!pattern) return names;
    if (pattern.type === 'Identifier') names.add(pattern.name);
    if (pattern.type === 'RestElement') patternNames(pattern.argument, names);
    if (pattern.type === 'AssignmentPattern') patternNames(pattern.left, names);
    if (pattern.type === 'ArrayPattern') {
        for (const element of pattern.elements ?? []) patternNames(element, names);
    }
    if (pattern.type === 'ObjectPattern') {
        for (const property of pattern.properties ?? []) {
            patternNames(property.type === 'RestElement' ? property.argument : property.value, names);
        }
    }
    return names;
}

export function propertyName(property) {
    if (!property || property.computed) return null;
    if (property.key?.type === 'Identifier') return property.key.name;
    if (property.key?.type === 'Literal') return String(property.key.value);
    return null;
}

export function jsxName(node) {
    if (!node) return null;
    if (node.type === 'JSXIdentifier') return node.name;
    if (node.type === 'JSXMemberExpression') {
        const left = jsxName(node.object);
        const right = jsxName(node.property);
        return left && right ? `${left}.${right}` : right;
    }
    if (node.type === 'JSXNamespacedName') return jsxName(node.name);
    return null;
}

export function lastName(value) {
    return value?.split('.').at(-1) ?? null;
}

export function staticString(node) {
    if (node?.type === 'Literal' && typeof node.value === 'string') return node.value;
    if (node?.type === 'TemplateLiteral' && node.expressions.length === 0) {
        return node.quasis.map((part) => part.value?.cooked ?? '').join('');
    }
    return null;
}

function containsJsx(node) {
    let found = false;
    visitAst(node, (child) => {
        if (child.type === 'JSXElement' || child.type === 'JSXFragment') found = true;
    });
    return found;
}

function functionName(node, parent) {
    if (node.id?.name) return node.id.name;
    if (parent?.type === 'VariableDeclarator' && parent.id.type === 'Identifier') return parent.id.name;
    if (parent?.type === 'Property') return propertyName(parent);
    return null;
}

function isComponentFunction(name, node) {
    return Boolean(name && /^[A-Z]/.test(name) && containsJsx(node.body));
}

function nonCommentLineCount(code) {
    let inBlock = false;
    let count = 0;

    for (const line of code.split(/\r?\n/)) {
        let rest = line.trim();
        if (!rest) continue;

        while (rest) {
            if (inBlock) {
                const end = rest.indexOf('*/');
                if (end < 0) {
                    rest = '';
                    break;
                }
                inBlock = false;
                rest = rest.slice(end + 2).trim();
                continue;
            }

            if (rest.startsWith('//')) {
                rest = '';
                break;
            }
            if (rest.startsWith('/*')) {
                inBlock = true;
                rest = rest.slice(2);
                continue;
            }
            count += 1;
            break;
        }
    }

    return count;
}

function importedLocalNames(file, source, importedNames) {
    const names = new Set();
    for (const edge of file.imports.filter((item) => item.source === source)) {
        for (const binding of edge.bindings) {
            if (importedNames.has(binding.imported)) names.add(binding.local);
        }
    }
    return names;
}

function memberMatches(node, objects, properties) {
    return Boolean(
        node?.type === 'MemberExpression'
        && !node.computed
        && node.object?.type === 'Identifier'
        && objects.has(node.object.name)
        && node.property?.type === 'Identifier'
        && properties.has(node.property.name),
    );
}

function calleeMatches(node, direct, namespaces, properties = new Set()) {
    return Boolean(
        (node?.type === 'Identifier' && direct.has(node.name))
        || memberMatches(node, namespaces, properties),
    );
}

function routeVariable(node) {
    return Boolean(
        node?.type === 'VariableDeclarator'
        && node.id?.type === 'Identifier'
        && /^(?:app)?routes?$|router|routeConfig/i.test(node.id.name),
    );
}

function hasRouteContext(file, node) {
    let current = node;
    while (current) {
        if (routeVariable(current)) return true;
        if (
            current.type === 'CallExpression'
            && calleeMatches(current.callee, file.bindings.routeApis, new Set(), ROUTE_APIS)
        ) return true;
        current = file.parents.get(current);
    }
    return false;
}

function isRouteObject(file, node) {
    if (node.type !== 'ObjectExpression') return false;
    const hasIdentity = Boolean(getProperty(node, 'path') || getProperty(node, 'index'));
    const hasRouteProperty = ['element', 'Component', 'lazy', 'children', 'loader', 'action']
        .some((name) => getProperty(node, name));
    return hasIdentity && (hasRouteProperty || hasRouteContext(file, node));
}

function listStyleFiles(rootDir) {
    const sourceRoot = path.join(rootDir, 'src');
    const files = [];

    function visit(directory) {
        if (!fs.existsSync(directory)) return;
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
            if (entry.isDirectory() && SKIP_DIRECTORIES.has(entry.name)) continue;
            const entryPath = path.join(directory, entry.name);
            if (entry.isDirectory()) {
                visit(entryPath);
                continue;
            }
            const relative = normalizeSourcePath(path.relative(rootDir, entryPath));
            if (STYLE_EXTENSIONS.has(path.extname(entry.name)) && isProductionSourcePath(relative)) {
                files.push({ path: entryPath, relative });
            }
        }
    }

    visit(sourceRoot);
    return files.sort((left, right) => left.relative.localeCompare(right.relative));
}

function collectFileInventory(file) {
    file.parents = new WeakMap();
    file.nodes = [];
    file.calls = [];
    file.jsxElements = [];
    file.objects = [];
    file.variables = [];
    file.functionRecords = [];
    file.topLevelNames = new Set(file.importBindings.keys());
    file.lineCount = nonCommentLineCount(file.code);

    for (const statement of file.ast.body ?? []) {
        const declaration = declarationOf(statement);
        if (declaration?.type === 'VariableDeclaration') {
            for (const item of declaration.declarations ?? []) patternNames(item.id, file.topLevelNames);
        }
        if (declaration?.type === 'FunctionDeclaration' || declaration?.type === 'ClassDeclaration') {
            if (declaration.id?.name) file.topLevelNames.add(declaration.id.name);
        }
    }

    visitAst(file.ast, (node, parent) => {
        if (parent) file.parents.set(node, parent);
        file.nodes.push(node);
        if (node.type === 'CallExpression') file.calls.push(node);
        if (node.type === 'JSXElement') file.jsxElements.push(node);
        if (node.type === 'ObjectExpression') file.objects.push(node);
        if (node.type === 'VariableDeclarator') file.variables.push(node);
        if (['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(node.type)) {
            const name = functionName(node, parent);
            file.functionRecords.push({
                name,
                node,
                parent,
                component: isComponentFunction(name, node),
            });
        }
    });

    const reactNamed = (names) => importedLocalNames(file, 'react', new Set(names));
    const reactNamespaces = new Set();
    for (const edge of file.imports.filter((item) => item.source === 'react')) {
        for (const binding of edge.bindings) {
            if (binding.imported === '*' || binding.imported === 'default') reactNamespaces.add(binding.local);
        }
    }

    file.bindings = {
        stateHooks: reactNamed(['useState', 'useReducer']),
        effectHooks: reactNamed(['useEffect']),
        refHooks: reactNamed(['useRef']),
        contextFactories: reactNamed(['createContext']),
        reactNamespaces,
        routeApis: importedLocalNames(file, 'react-router-dom', ROUTE_APIS),
        routeComponents: importedLocalNames(file, 'react-router-dom', new Set(['Route'])),
        axios: importedLocalNames(file, 'axios', new Set(['default', '*'])),
        axiosCreate: importedLocalNames(file, 'axios', new Set(['create'])),
        emitterFactories: new Set(),
    };

    for (const edge of file.imports.filter((item) => ['mitt', 'events', 'eventemitter3'].includes(item.source))) {
        for (const binding of edge.bindings) file.bindings.emitterFactories.add(binding.local);
    }

    file.componentNodes = file.functionRecords.filter((record) => record.component).map((record) => record.node);
    file.isComponent = file.componentNodes.length > 0
        || (containsJsx(file.ast) && /^[A-Z]/.test(path.basename(file.relative, path.extname(file.relative))));
    file.routeEntries = file.objects.filter((node) => isRouteObject(file, node));
    file.routeJsxEntries = file.jsxElements
        .map((element) => element.openingElement)
        .filter((opening) => file.bindings.routeComponents.has(lastName(jsxName(opening.name))));

    const routeCalls = file.calls.filter((call) =>
        calleeMatches(call.callee, file.bindings.routeApis, new Set(), ROUTE_APIS));
    const routeVariables = file.variables.filter((variable) =>
        routeVariable(variable) && file.routeEntries.some((entry) => {
            let current = entry;
            while (current) {
                if (current === variable.init) return true;
                current = file.parents.get(current);
            }
            return false;
        }));
    file.routeDefinitions = [...routeCalls, ...routeVariables, ...file.routeJsxEntries]
        .sort((left, right) => left.range[0] - right.range[0]);
}

export function buildFrontendInventory(rootDir, config = {}) {
    const project = buildProject(rootDir);
    for (const file of project.files) collectFileInventory(file);

    return {
        ...project,
        config,
        styleFiles: listStyleFiles(project.rootDir),
        files: project.files,
    };
}

export const inventoryHelpers = {
    calleeMatches,
    containsJsx,
    importedLocalNames,
    memberMatches,
};
