import path from 'node:path';

export const STATELESS_COMPONENT_PATHS = [
    'src/components/ui/',
    'src/components/atoms/',
];

export const CONTROLLED_PROVIDER_PATHS = [
    'src/providers/',
    'src/app/providers.',
    'src/pages/_app.',
    'src/context/providers.',
];

export const ROUTES_DIR = 'src/routes/';

export function normalizePath(filePath) {
    return filePath.split(path.sep).join('/');
}

export function isInAnyPath(filePath, prefixes) {
    return prefixes.some((prefix) => filePath.includes(`/${prefix}`) || filePath.startsWith(prefix));
}

export function isControlledProviderFile(filePath) {
    if (isInAnyPath(filePath, ['src/providers/'])) {
        return true;
    }

    return CONTROLLED_PROVIDER_PATHS.some((prefix) => filePath.includes(`/${prefix}`) || filePath.startsWith(prefix));
}

export function isInRoutesDirectory(filePath, routesDir = ROUTES_DIR) {
    return filePath.includes(`/${routesDir}`) || filePath.startsWith(routesDir);
}

export function getObjectProperty(node, propertyName) {
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

export function getStaticString(node) {
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

export function isPageImportPath(importPath) {
    if (!importPath) {
        return false;
    }

    return importPath.startsWith('pages/')
        || importPath.includes('/pages/')
        || importPath.startsWith('./pages/')
        || importPath.startsWith('../pages/');
}

export function collectIdentifiers(node, identifiers = new Set()) {
    if (!node || typeof node !== 'object') {
        return identifiers;
    }

    if (node.type === 'Identifier') {
        identifiers.add(node.name);
    }

    for (const key of Object.keys(node)) {
        if (key === 'parent') {
            continue;
        }

        const value = node[key];

        if (Array.isArray(value)) {
            for (const item of value) {
                collectIdentifiers(item, identifiers);
            }
        } else if (value && typeof value === 'object') {
            collectIdentifiers(value, identifiers);
        }
    }

    return identifiers;
}

export function extractLoaderImportPath(loaderNode) {
    if (!loaderNode || (loaderNode.type !== 'ArrowFunctionExpression' && loaderNode.type !== 'FunctionExpression')) {
        return null;
    }

    if (loaderNode.body?.type === 'ImportExpression') {
        return getStaticString(loaderNode.body.source);
    }

    if (loaderNode.body?.type === 'BlockStatement') {
        for (const statement of loaderNode.body.body ?? []) {
            if (statement.type === 'ReturnStatement' && statement.argument?.type === 'ImportExpression') {
                return getStaticString(statement.argument.source);
            }
        }
    }

    return null;
}
