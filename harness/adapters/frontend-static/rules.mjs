// Deterministic frontend constraints over one shared evidence inventory.
import crypto from 'node:crypto';
import path from 'node:path';
import {
    expressionName,
    getProperty,
    nodeLocation,
} from '../backend-static/project.mjs';
import {
    inventoryHelpers,
    jsxName,
    lastName,
    patternNames,
    propertyName,
    staticString,
} from './inventory.mjs';

const SOURCE_EXT_RE = /\.[cm]?[jt]sx?$/;
const STYLE_MODULE_RE = /\.module\.(?:css|scss|sass)$/;
const ROUTES_DIR_RE = /^src\/routes\//;
const COMPONENT_STATE_DIR_RE = /^src\/(?:components|layout\/components)\//;
const GLOBAL_OBJECTS = new Set([
    'Array', 'Boolean', 'Date', 'Error', 'JSON', 'Map', 'Math', 'Number', 'Object',
    'Promise', 'RegExp', 'Set', 'String', 'URL', 'URLSearchParams', 'console',
    'document', 'globalThis', 'window',
]);

function violation(ruleId, file, node, payload) {
    return { ruleId, location: nodeLocation(file, node), payload };
}

function styleViolation(ruleId, styleFile, payload) {
    return {
        ruleId,
        location: { file: styleFile.relative, line: 1, column: 1 },
        payload,
    };
}

function nearestFunction(file, node) {
    let current = file.parents.get(node);
    while (current) {
        if (['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(current.type)) {
            return current;
        }
        current = file.parents.get(current);
    }
    return null;
}

function isWithin(file, node, ancestor) {
    let current = node;
    while (current) {
        if (current === ancestor) return true;
        current = file.parents.get(current);
    }
    return false;
}

function attribute(opening, name) {
    return (opening.attributes ?? []).find((item) =>
        item.type === 'JSXAttribute' && item.name?.type === 'JSXIdentifier' && item.name.name === name) ?? null;
}

function attributeValue(item) {
    if (!item?.value) return true;
    if (item.value.type === 'Literal') return item.value.value;
    if (item.value.type === 'JSXExpressionContainer') return item.value.expression;
    return item.value;
}

function objectEntry(objectNode, name) {
    if (objectNode?.type !== 'ObjectExpression') return null;
    return (objectNode.properties ?? []).find((property) =>
        property.type === 'Property' && propertyName(property) === name) ?? null;
}

function importedBinding(file, localName) {
    const binding = file.importBindings.get(localName);
    if (!binding) return null;
    const edge = file.imports.find((item) =>
        item.source === binding.source && item.bindings.some((candidate) => candidate.local === localName));
    return { ...binding, edge };
}

function isTransparentJsx(file, node, transparent) {
    if (node.type === 'JSXFragment') return true;
    const localName = lastName(jsxName(node.openingElement?.name));
    const importedName = file.importBindings.get(localName)?.imported;
    return transparent.has(localName) || transparent.has(importedName);
}

function jsxDepth(file, node, transparent) {
    let depth = 0;
    let current = node;

    while (current) {
        if ((current.type === 'JSXElement' || current.type === 'JSXFragment') && !isTransparentJsx(file, current, transparent)) {
            depth += 1;
        }

        if (['ArrowFunctionExpression', 'FunctionExpression'].includes(current.type)) {
            const container = file.parents.get(current);
            if (container?.type === 'JSXExpressionContainer' && container.expression === current) break;
        }
        current = file.parents.get(current);
    }

    return depth;
}

function analyzeComponents(inventory, config) {
    const findings = [];
    const maxLines = config.component_max_lines ?? 300;
    const maxDepth = config.jsx_max_depth ?? 5;
    const transparent = new Set(config.transparent_wrappers ?? []);

    for (const file of inventory.files) {
        if (file.isComponent && file.lineCount > maxLines) {
            findings.push(violation('FE-COM-C-001', file, file.componentNodes[0] ?? file.ast, {
                line_count: file.lineCount,
                max_lines: maxLines,
                message: `React component file has ${file.lineCount} non-blank, non-comment lines; maximum is ${maxLines}.`,
            }));
        }

        for (const element of file.jsxElements) {
            const depth = jsxDepth(file, element, transparent);
            if (depth === maxDepth + 1) {
                findings.push(violation('FE-COM-C-002', file, element.openingElement, {
                    depth,
                    max_depth: maxDepth,
                    element: jsxName(element.openingElement.name),
                    message: `Business JSX nesting depth ${depth} exceeds ${maxDepth}.`,
                }));
            }
        }
    }

    return findings;
}

function hookCall(file, call, directBindings, memberName) {
    if (call.callee?.type === 'Identifier') return directBindings.has(call.callee.name);
    return inventoryHelpers.memberMatches(call.callee, file.bindings.reactNamespaces, new Set([memberName]));
}

function providerAllowed(relative) {
    return /^src\/App\.[cm]?[jt]sx?$/.test(relative)
        || /^src\/(?:index|main)\.[cm]?[jt]sx?$/.test(relative)
        || /^src\/(?:providers|contexts)\//.test(relative)
        || /^src\/routes\/.*Layout\.[cm]?[jt]sx?$/.test(relative);
}

function contextNames(file) {
    const names = new Set();
    for (const variable of file.variables) {
        if (variable.id?.type !== 'Identifier' || variable.init?.type !== 'CallExpression') continue;
        if (hookCall(file, variable.init, file.bindings.contextFactories, 'createContext')) names.add(variable.id.name);
    }
    for (const edge of file.imports) {
        const resolvesContext = edge.ultimateTargets.some((target) => /\/src\/contexts\//.test(target));
        if (resolvesContext || /(?:^|\/)contexts?\//.test(edge.source)) {
            for (const binding of edge.bindings) names.add(binding.local);
        }
    }
    return names;
}

function analyzeState(inventory) {
    const findings = [];

    for (const file of inventory.files) {
        if (COMPONENT_STATE_DIR_RE.test(file.relative)) {
            for (const call of file.calls) {
                const stateHook = hookCall(file, call, file.bindings.stateHooks, 'useState')
                    || hookCall(file, call, file.bindings.stateHooks, 'useReducer');
                if (!stateHook) continue;
                findings.push(violation('FE-STATE-C-001', file, call, {
                    hook: expressionName(call.callee),
                    boundary: file.relative.startsWith('src/layout/components/')
                        ? 'src/layout/components/'
                        : 'src/components/',
                    message: 'Local state hooks are not allowed in controlled child-component directories.',
                }));
            }
        }

        if (providerAllowed(file.relative)) continue;
        const contexts = contextNames(file);
        for (const element of file.jsxElements) {
            const opening = element.openingElement;
            const fullName = jsxName(opening.name);
            const name = lastName(fullName);
            const isProvider = name === 'Provider' || name?.endsWith('Provider') || contexts.has(name);
            if (!isProvider) continue;
            findings.push(violation('FE-STATE-C-002', file, opening, {
                provider: fullName,
                allowed_locations: ['src/App.*', 'src/index.*', 'src/main.*', 'src/routes/**/*Layout.*', 'src/providers/**', 'src/contexts/**'],
                message: 'Context providers must stay at an approved application or route boundary.',
            }));
        }
    }

    return findings;
}

function minimalDefinitions(definitions) {
    return definitions.filter((node) => !definitions.some((other) =>
        other !== node
        && node.range[0] <= other.range[0]
        && node.range[1] >= other.range[1]));
}

function nodeHasPageReference(file, node, seen = new Set()) {
    if (!node || seen.has(node)) return false;
    seen.add(node);

    if (node.type === 'ImportExpression') {
        const target = staticString(node.source);
        return typeof target === 'string' && /(?:^|\/)pages\//.test(target);
    }
    if (node.type === 'Identifier') {
        const binding = importedBinding(file, node.name);
        if (binding) {
            if (binding.source === 'react-router-dom' && binding.imported === 'Navigate') return true;
            return /(?:^|\/)pages(?:\/|$)/.test(binding.source)
                || binding.edge?.ultimateTargets.some((target) => /\/src\/pages\//.test(target));
        }
        return nodeHasPageReference(file, file.constants.get(node.name), seen);
    }
    if (node.type === 'JSXIdentifier') {
        const binding = importedBinding(file, node.name);
        return binding?.source === 'react-router-dom' && binding.imported === 'Navigate';
    }
    if (node.type === 'CallExpression') {
        const calleeBinding = node.callee?.type === 'Identifier' ? importedBinding(file, node.callee.name) : null;
        const delegatesToPageLoader = calleeBinding?.source === 'react'
            && calleeBinding.imported === 'lazy'
            && node.arguments.some((argument) =>
                argument?.type === 'MemberExpression'
                && !argument.computed
                && argument.property?.type === 'Identifier'
                && argument.property.name === 'loader');
        if (delegatesToPageLoader) return true;
    }

    for (const [key, child] of Object.entries(node)) {
        if (['parent', 'tokens', 'comments', 'loc', 'range'].includes(key)) continue;
        if (Array.isArray(child) && child.some((item) => nodeHasPageReference(file, item, seen))) return true;
        if (child && typeof child === 'object' && nodeHasPageReference(file, child, seen)) return true;
    }
    return false;
}

function routeObjectMapping(file, route) {
    const children = objectEntry(route, 'children');
    const index = objectEntry(route, 'index');
    if (children && index?.value?.value !== true) return null;

    const identity = objectEntry(route, 'path') ?? index;
    const mapping = objectEntry(route, 'element')
        ?? objectEntry(route, 'Component')
        ?? objectEntry(route, 'lazy')
        ?? objectEntry(route, 'loader');
    return {
        identity,
        mapping,
        routePath: staticString(objectEntry(route, 'path')?.value) ?? (index ? '<index>' : '<unknown>'),
    };
}

function routeJsxMapping(opening) {
    const pathAttribute = attribute(opening, 'path');
    const indexAttribute = attribute(opening, 'index');
    const mapping = attribute(opening, 'element') ?? attribute(opening, 'Component') ?? attribute(opening, 'lazy');
    const children = attribute(opening, 'children');
    if (children && !indexAttribute) return null;
    return {
        identity: pathAttribute ?? indexAttribute ?? opening,
        mapping,
        routePath: String(attributeValue(pathAttribute) ?? (indexAttribute ? '<index>' : '<unknown>')),
    };
}

function analyzeRoutes(inventory) {
    const findings = [];

    for (const file of inventory.files) {
        if (!ROUTES_DIR_RE.test(file.relative)) {
            for (const definition of minimalDefinitions(file.routeDefinitions)) {
                findings.push(violation('FE-ROUTE-C-001', file, definition, {
                    definition: definition.type,
                    required_directory: 'src/routes/',
                    message: 'Route definitions must live under src/routes/.',
                }));
            }
            continue;
        }

        for (const route of file.routeEntries) {
            const details = routeObjectMapping(file, route);
            if (!details) continue;
            if (details.mapping && nodeHasPageReference(file, details.mapping.value)) continue;
            findings.push(violation('FE-ROUTE-C-002', file, details.mapping?.value ?? details.identity?.value ?? route, {
                route: details.routePath,
                mapping: details.mapping ? propertyName(details.mapping) : null,
                message: `Route ${details.routePath} must resolve to a component under src/pages/.`,
            }));
        }

        for (const opening of file.routeJsxEntries) {
            const details = routeJsxMapping(opening);
            if (!details) continue;
            const mappingValue = details.mapping ? attributeValue(details.mapping) : null;
            if (mappingValue && nodeHasPageReference(file, mappingValue)) continue;
            findings.push(violation('FE-ROUTE-C-002', file, details.mapping ?? details.identity ?? opening, {
                route: details.routePath,
                mapping: details.mapping?.name?.name ?? null,
                message: `Route ${details.routePath} must resolve to a component under src/pages/.`,
            }));
        }
    }

    return findings;
}

function analyzeStyles(inventory) {
    const findings = [];
    for (const file of inventory.files) {
        for (const element of file.jsxElements) {
            const style = attribute(element.openingElement, 'style');
            if (!style) continue;
            findings.push(violation('FE-STYLE-C-001', file, style, {
                element: jsxName(element.openingElement.name),
                message: 'Raw JSX style props are not allowed; use the shared styling abstraction.',
            }));
        }
    }

    for (const styleFile of inventory.styleFiles) {
        if (STYLE_MODULE_RE.test(styleFile.relative) || /^src\/styles\/global\//.test(styleFile.relative)) continue;
        findings.push(styleViolation('FE-STYLE-C-002', styleFile, {
            stylesheet: styleFile.relative,
            required_directory: 'src/styles/global/',
            message: 'Global stylesheets must live under src/styles/global/.',
        }));
    }
    return findings;
}

function scopeDeclares(file, node, name) {
    if (file.importBindings.has(name)) return true;
    let current = node;

    while (current) {
        if (['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(current.type)) {
            if ((current.params ?? []).some((param) => patternNames(param).has(name))) return true;
            if (file.variables.some((variable) =>
                nearestFunction(file, variable) === current && patternNames(variable.id).has(name))) return true;
        }
        current = file.parents.get(current);
    }
    return file.topLevelNames.has(name);
}

function axiosInstanceNames(file) {
    const instances = new Set();
    for (const variable of file.variables) {
        if (variable.id?.type !== 'Identifier' || variable.init?.type !== 'CallExpression') continue;
        const callee = variable.init.callee;
        const directCreate = callee?.type === 'Identifier' && file.bindings.axiosCreate.has(callee.name);
        const memberCreate = inventoryHelpers.memberMatches(callee, file.bindings.axios, new Set(['create']));
        if (directCreate || memberCreate) instances.add(variable.id.name);
    }
    return instances;
}

function networkCallKind(file, call, axiosInstances) {
    const callee = call.callee;
    if (callee?.type === 'Identifier' && callee.name === 'fetch' && !scopeDeclares(file, call, 'fetch')) return 'fetch';
    if (
        callee?.type === 'MemberExpression'
        && !callee.computed
        && ['window', 'globalThis'].includes(callee.object?.name)
        && callee.property?.name === 'fetch'
    ) return 'fetch';
    if (callee?.type === 'Identifier' && file.bindings.axios.has(callee.name)) return 'axios';
    if (callee?.type === 'MemberExpression' && callee.object?.type === 'Identifier') {
        if (file.bindings.axios.has(callee.object.name) || axiosInstances.has(callee.object.name)) return 'axios';
    }
    return null;
}

function dataAccessAllowed(relative, config) {
    const paths = config.data_access_paths ?? ['src/api/', 'src/hooks/', '/hooks/'];
    return paths.some((allowed) => allowed.startsWith('/') ? relative.includes(allowed) : relative.startsWith(allowed));
}

function isReferenceIdentifier(node, parent) {
    if (!parent) return false;
    if (parent.type.startsWith('Import')) return false;
    if (parent.type === 'MemberExpression' && parent.property === node && !parent.computed) return false;
    if (parent.type === 'Property' && parent.key === node && !parent.computed && !parent.shorthand) return false;
    if (parent.type === 'VariableDeclarator' && parent.id === node) return false;
    if (['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(parent.type)
        && (parent.id === node || parent.params.includes(node))) return false;
    if (['JSXIdentifier', 'JSXAttribute', 'LabeledStatement', 'BreakStatement', 'ContinueStatement'].includes(parent.type)) return false;
    return true;
}

function functionBindings(file, fn) {
    const reactive = new Set();
    const stable = new Set();
    for (const param of fn.params ?? []) patternNames(param, reactive);

    for (const variable of file.variables.filter((item) => nearestFunction(file, item) === fn)) {
        for (const name of patternNames(variable.id)) reactive.add(name);
        if (variable.id?.type === 'ArrayPattern' && variable.init?.type === 'CallExpression'
            && (hookCall(file, variable.init, file.bindings.stateHooks, 'useState')
                || hookCall(file, variable.init, file.bindings.stateHooks, 'useReducer'))) {
            const setter = variable.id.elements?.[1];
            if (setter?.type === 'Identifier') stable.add(setter.name);
        }
        if (variable.id?.type === 'Identifier' && variable.init?.type === 'CallExpression'
            && hookCall(file, variable.init, file.bindings.refHooks, 'useRef')) {
            stable.add(variable.id.name);
        }
    }
    for (const record of file.functionRecords) {
        if (record.name && nearestFunction(file, record.node) === fn) reactive.add(record.name);
    }
    for (const name of stable) reactive.delete(name);
    return reactive;
}

function callbackReferences(file, callback, candidates) {
    const declared = new Set();
    for (const node of file.nodes.filter((item) => isWithin(file, item, callback))) {
        if (['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(node.type)) {
            if (node.id?.name) declared.add(node.id.name);
            for (const param of node.params ?? []) patternNames(param, declared);
        }
        if (node.type === 'VariableDeclarator') patternNames(node.id, declared);
        if (node.type === 'CatchClause') patternNames(node.param, declared);
    }

    const references = new Set();
    for (const node of file.nodes.filter((item) => item.type === 'Identifier' && isWithin(file, item, callback))) {
        const parent = file.parents.get(node);
        if (isReferenceIdentifier(node, parent)
            && candidates.has(node.name)
            && !declared.has(node.name)
            && !GLOBAL_OBJECTS.has(node.name)) {
            references.add(node.name);
        }
    }
    return references;
}

function dependencyNames(node) {
    if (node?.type !== 'ArrayExpression') return null;
    const names = new Set();
    for (const element of node.elements ?? []) {
        let current = element;
        while (current?.type === 'MemberExpression') current = current.object;
        if (current?.type === 'Identifier') names.add(current.name);
    }
    return names;
}

function analyzeData(inventory, config) {
    const findings = [];
    for (const file of inventory.files) {
        const axiosInstances = axiosInstanceNames(file);
        if (!dataAccessAllowed(file.relative, config)) {
            for (const call of file.calls) {
                const kind = networkCallKind(file, call, axiosInstances);
                if (!kind) continue;
                findings.push(violation('FE-DATA-C-001', file, call, {
                    client: kind,
                    callee: expressionName(call.callee),
                    message: 'Direct network calls belong in an API service or data hook.',
                }));
            }
        }

        for (const call of file.calls) {
            if (!hookCall(file, call, file.bindings.effectHooks, 'useEffect')) continue;
            const callback = call.arguments[0];
            const dependencies = dependencyNames(call.arguments[1]);
            const component = nearestFunction(file, call);
            const reactive = component ? functionBindings(file, component) : new Set();
            const referenced = callback && ['ArrowFunctionExpression', 'FunctionExpression'].includes(callback.type)
                ? callbackReferences(file, callback, reactive)
                : new Set();
            const missing = [...referenced].filter((name) => !dependencies?.has(name)).sort();
            if (dependencies && missing.length === 0) continue;
            findings.push(violation('FE-DATA-C-002', file, call, {
                reason: dependencies ? 'incomplete-dependencies' : 'missing-dependency-array',
                missing_dependencies: missing,
                declared_dependencies: dependencies ? [...dependencies].sort() : null,
                message: dependencies
                    ? `useEffect is missing reactive dependencies: ${missing.join(', ')}.`
                    : 'useEffect must declare an explicit dependency array.',
            }));
        }
    }
    return findings;
}

function isTopLevelVariable(file, variable) {
    let current = file.parents.get(variable);
    if (current?.type === 'VariableDeclaration') current = file.parents.get(current);
    return current?.type === 'Program' || current?.type === 'ExportNamedDeclaration' || current?.type === 'ExportDefaultDeclaration';
}

function emitterInitializer(file, init) {
    if (!init) return false;
    if (init.type === 'CallExpression' && init.callee?.type === 'Identifier') {
        return file.bindings.emitterFactories.has(init.callee.name);
    }
    if (init.type === 'NewExpression') {
        return init.callee?.name === 'EventTarget'
            || (init.callee?.type === 'Identifier' && file.bindings.emitterFactories.has(init.callee.name));
    }
    if (init.type === 'ObjectExpression') {
        const methods = new Set(init.properties.map(propertyName).filter(Boolean));
        return (methods.has('on') && methods.has('emit')) || (methods.has('subscribe') && methods.has('publish'));
    }
    return false;
}

function isExportedVariable(file, variable) {
    let current = file.parents.get(variable);
    while (current && current.type !== 'Program') {
        if (current.type === 'ExportNamedDeclaration' || current.type === 'ExportDefaultDeclaration') return true;
        current = file.parents.get(current);
    }
    return false;
}

function analyzeCommunication(inventory) {
    const findings = [];
    for (const file of inventory.files) {
        for (const variable of file.variables) {
            if (!isTopLevelVariable(file, variable) || !emitterInitializer(file, variable.init)) continue;
            const name = variable.id?.type === 'Identifier' ? variable.id.name : '<anonymous>';
            if (!isExportedVariable(file, variable) && !/(?:^|_)(?:event)?bus$|emitter/i.test(name)) continue;
            findings.push(violation('FE-COMM-C-001', file, variable, {
                singleton: name,
                exported: isExportedVariable(file, variable),
                message: 'Module-level event-bus singletons are not allowed.',
            }));
        }
    }
    return findings;
}

function words(value) {
    return value
        .replace(SOURCE_EXT_RE, '')
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(Boolean);
}

function singular(value) {
    if (value.endsWith('ies') && value.length > 3) return `${value.slice(0, -3)}y`;
    if (value.endsWith('sses')) return value.slice(0, -2);
    if (value.endsWith('s') && !value.endsWith('ss')) return value.slice(0, -1);
    return value;
}

function resourceKey(value, aliases = {}) {
    const ignored = new Set(['page', 'pages', 'form', 'forms', 'list', 'detail', 'details', 'edit', 'create', 'new', 'view', 'screen']);
    const tokens = words(value).filter((token) => !ignored.has(token));
    const key = singular(tokens[0] ?? '');
    return aliases[key] ?? key;
}

function routeResource(route) {
    const value = staticString(getProperty(route, 'path'));
    return value?.split('/').filter((segment) => segment && !segment.startsWith(':'))[0] ?? null;
}

function ownerDirectory(relative, rootName) {
    const parts = relative.split('/');
    const index = parts.indexOf(rootName);
    if (index < 0) return relative;
    return parts[index + 1] && parts.length > index + 2
        ? parts.slice(0, index + 2).join('/')
        : relative;
}

function collectOwners(inventory, config) {
    const owners = [];
    const aliases = config.resource_aliases ?? {};

    for (const file of inventory.files) {
        const feature = file.relative.match(/^src\/features\/([^/]+)\//);
        if (feature) {
            owners.push({ kind: 'feature', resource: resourceKey(feature[1], aliases), owner: `src/features/${feature[1]}`, file, node: file.ast });
        }

        if (/^src\/pages\//.test(file.relative) && file.isComponent) {
            const component = file.functionRecords.find((record) => record.component);
            const basename = path.basename(file.relative).replace(SOURCE_EXT_RE, '');
            const resourceName = basename === 'index' ? path.basename(path.dirname(file.relative)) : basename;
            const resource = resourceKey(resourceName, aliases);
            const directPage = file.relative.split('/').length === 3;
            const owner = directPage ? `src/pages/${resource}` : ownerDirectory(file.relative, 'pages');
            owners.push({ kind: 'page', resource, owner, file, node: component?.node ?? file.ast });
        }

        for (const record of file.functionRecords.filter((item) => /Form$/.test(item.name ?? ''))) {
            owners.push({
                kind: 'form',
                resource: resourceKey(record.name, aliases),
                owner: ownerDirectory(file.relative, file.relative.includes('/forms/') ? 'forms' : 'features'),
                file,
                node: record.node,
            });
        }

        for (const route of file.routeEntries) {
            const resource = resourceKey(routeResource(route) ?? '', aliases);
            if (resource) owners.push({ kind: 'route', resource, owner: file.relative, file, node: route });
        }
    }

    const unique = new Map();
    for (const owner of owners.filter((item) => item.resource)) {
        unique.set(`${owner.kind}:${owner.resource}:${owner.owner}`, owner);
    }
    return [...unique.values()];
}

function analyzeResourceDuplication(inventory, config) {
    const findings = [];
    const groups = new Map();
    for (const owner of collectOwners(inventory, config)) {
        const key = `${owner.kind}:${owner.resource}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(owner);
    }

    for (const records of groups.values()) {
        const sorted = records.sort((left, right) => left.owner.localeCompare(right.owner));
        if (sorted.length < 2) continue;
        const evidence = sorted.map((item) => item.owner);
        findings.push(violation('FE-DUP-C-001', sorted[1].file, sorted[1].node, {
            reason: 'duplicate-owner',
            resource: sorted[0].resource,
            owner_type: sorted[0].kind,
            owners: evidence,
            message: `${sorted[0].resource} has competing ${sorted[0].kind} owners.`,
        }));
    }
    return findings;
}

function astShape(node) {
    if (!node || typeof node !== 'object') return JSON.stringify(node);
    if (Array.isArray(node)) return `[${node.map(astShape).join(',')}]`;
    if (node.type === 'Identifier') return 'Identifier';
    if (node.type === 'JSXIdentifier') return `JSX:${node.name}`;
    if (node.type === 'Literal') return `Literal:${JSON.stringify(node.value)}`;
    if (node.type === 'MemberExpression' && !node.computed && node.property?.type === 'Identifier') {
        return `Member{object:${astShape(node.object)},property:${node.property.name},optional:${Boolean(node.optional)}}`;
    }
    if (node.type === 'Property' && !node.computed) {
        return `Property{key:${propertyName(node)},kind:${node.kind},value:${astShape(node.value)}}`;
    }
    const ignored = new Set(['loc', 'range', 'raw', 'parent', 'tokens', 'comments', 'id']);
    const fields = Object.keys(node).filter((key) => !ignored.has(key)).sort();
    return `${node.type ?? 'Object'}{${fields.map((key) => `${key}:${astShape(node[key])}`).join(',')}}`;
}

function shapeHash(value) {
    return crypto.createHash('sha256').update(value).digest('hex').slice(0, 12);
}

function astSize(node) {
    if (!node || typeof node !== 'object') return 0;
    if (Array.isArray(node)) return node.reduce((total, item) => total + astSize(item), 0);
    return 1 + Object.entries(node)
        .filter(([key]) => !['loc', 'range', 'parent', 'tokens', 'comments'].includes(key))
        .reduce((total, [, value]) => total + astSize(value), 0);
}

function staticEndpoint(call) {
    const calleeName = expressionName(call.callee) ?? '';
    if (calleeName === 'fetch' || calleeName.endsWith('.fetch')) {
        const endpoint = staticString(call.arguments[0]);
        const options = call.arguments[1];
        const method = staticString(getProperty(options, 'method')) ?? 'GET';
        return endpoint ? `${method.toUpperCase()} ${endpoint}` : null;
    }
    const method = calleeName.split('.').at(-1)?.toUpperCase();
    if (['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
        const endpoint = staticString(call.arguments[0]);
        return endpoint ? `${method} ${endpoint}` : null;
    }
    return null;
}

function formFingerprint(element) {
    const fields = [];
    const stack = [element];
    while (stack.length) {
        const current = stack.pop();
        if (!current || typeof current !== 'object') continue;
        if (current.type === 'JSXOpeningElement') {
            const name = attribute(current, 'name');
            const value = attributeValue(name);
            if (typeof value === 'string') fields.push(value);
        }
        for (const [key, child] of Object.entries(current)) {
            if (['parent', 'loc', 'range', 'tokens', 'comments'].includes(key)) continue;
            if (Array.isArray(child)) stack.push(...child);
            else if (child && typeof child === 'object') stack.push(child);
        }
    }
    return fields.length >= 2 ? [...new Set(fields)].sort().join('|') : null;
}

function implementationCandidates(inventory) {
    const candidates = [];
    const add = (reason, fingerprint, file, node) => {
        if (fingerprint) candidates.push({ reason, fingerprint, file, node });
    };

    for (const file of inventory.files) {
        const axiosInstances = axiosInstanceNames(file);
        for (const call of file.calls) {
            if (networkCallKind(file, call, axiosInstances)) add('api-duplicate', staticEndpoint(call), file, call);
        }

        for (const element of file.jsxElements) {
            if (lastName(jsxName(element.openingElement.name)) === 'form') {
                add('form-duplicate', formFingerprint(element), file, element.openingElement);
            }
        }

        for (const variable of file.variables) {
            const name = variable.id?.type === 'Identifier' ? variable.id.name : '';
            if (/(?:schema|validation|validators?|rules)$/i.test(name) && variable.init?.type === 'ObjectExpression') {
                add('validation-duplicate', astShape(variable.init), file, variable);
            }
            if (/(?:transition|state)(?:Map|Machine|Table)$/i.test(name) && variable.init?.type === 'ObjectExpression') {
                add('state-duplicate', astShape(variable.init), file, variable);
            }
        }

        for (const record of file.functionRecords) {
            if (!record.name || astSize(record.node.body) < 10) continue;
            const shape = astShape(record.node.body);
            if (/(?:transform|normalize|serialize|deserialize|map)[A-Z_]|^(?:transform|normalize|serialize|deserialize)/.test(record.name)) {
                add('transformation-duplicate', shape, file, record.node);
            } else if (/(?:reducer|transition)$/i.test(record.name)) {
                add('state-duplicate', shape, file, record.node);
            } else {
                add(record.component ? 'component-clone' : 'function-clone', shape, file, record.node);
            }
        }
    }
    return candidates;
}

function analyzeImplementationDuplication(inventory) {
    const findings = [];
    const priority = [
        'api-duplicate', 'form-duplicate', 'validation-duplicate', 'transformation-duplicate',
        'state-duplicate', 'component-clone', 'function-clone',
    ];
    const groups = new Map();
    for (const candidate of implementationCandidates(inventory)) {
        const key = `${candidate.reason}:${shapeHash(candidate.fingerprint)}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(candidate);
    }

    const usedPairs = new Set();
    for (const reason of priority) {
        for (const records of [...groups.values()].filter((items) => items[0].reason === reason)) {
            const uniqueByFile = new Map(records.map((item) => [item.file.relative, item]));
            const sorted = [...uniqueByFile.values()].sort((left, right) => left.file.relative.localeCompare(right.file.relative));
            if (sorted.length < 2) continue;
            const pair = sorted.map((item) => item.file.relative).join('|');
            if (usedPairs.has(pair)) continue;
            usedPairs.add(pair);
            const implementations = sorted.map((item) => `${item.file.relative}:${item.node.loc.start.line}`);
            findings.push(violation('FE-DUP-C-002', sorted[1].file, sorted[1].node, {
                reason,
                fingerprint: shapeHash(sorted[0].fingerprint),
                implementations,
                message: `${reason} logic has more than one production implementation.`,
            }));
        }
    }
    return findings;
}

export function analyzeFrontendRules(inventory, config = {}) {
    return [
        ...analyzeComponents(inventory, config),
        ...analyzeState(inventory),
        ...analyzeRoutes(inventory),
        ...analyzeStyles(inventory),
        ...analyzeData(inventory, config),
        ...analyzeCommunication(inventory),
        ...analyzeResourceDuplication(inventory, config),
        ...analyzeImplementationDuplication(inventory),
    ].sort((left, right) =>
        left.ruleId.localeCompare(right.ruleId)
        || left.location.file.localeCompare(right.location.file)
        || left.location.line - right.location.line
        || left.location.column - right.location.column);
}
