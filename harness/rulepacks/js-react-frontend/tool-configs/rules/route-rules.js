import {
    ROUTES_DIR,
    collectIdentifiers,
    extractLoaderImportPath,
    getObjectProperty,
    getStaticString,
    isInRoutesDirectory,
    isPageImportPath,
    normalizePath,
} from './_helpers.js';

export const routeDefinitionsOnlyInRoutesDirRule = {
    meta: {
        type: 'problem',
        schema: [{
            type: 'object',
            additionalProperties: false,
            properties: {
                routes_dir: { type: 'string' },
            },
        }],
        messages: {
            routeDefinitionOutsideDir: 'Route definitions must be centralized under {{routesDir}}.',
        },
    },
    create(context) {
        const filename = normalizePath(context.filename ?? context.getFilename());
        const options = context.options[0] ?? {};
        const routesDir = options.routes_dir ?? ROUTES_DIR;
        const isInRoutesDir = isInRoutesDirectory(filename, routesDir);

        if (filename === '<input>' || isInRoutesDir) {
            return {};
        }

        const routeDefinitionApis = new Set([
            'createBrowserRouter',
            'createHashRouter',
            'createMemoryRouter',
            'createRoutesFromElements',
            'useRoutes',
            'Route',
        ]);

        return {
            ImportDeclaration(node) {
                if (node.source?.type !== 'Literal' || node.source.value !== 'react-router-dom') {
                    return;
                }

                for (const specifier of node.specifiers ?? []) {
                    if (specifier.type !== 'ImportSpecifier') {
                        continue;
                    }

                    const importedName = specifier.imported?.name;
                    if (!routeDefinitionApis.has(importedName)) {
                        continue;
                    }

                    context.report({
                        node: specifier,
                        messageId: 'routeDefinitionOutsideDir',
                        data: { routesDir },
                    });
                }
            },
        };
    },
};

export const routeMustMapToPageComponentRule = {
    meta: {
        type: 'problem',
        schema: [{
            type: 'object',
            additionalProperties: false,
            properties: {
                routes_dir: { type: 'string' },
            },
        }],
        messages: {
            missingPageMapping: 'Route "{{routePath}}" must map to a page component (loader import from pages/* or element referencing a pages import).',
        },
    },
    create(context) {
        const filename = normalizePath(context.filename ?? context.getFilename());
        const options = context.options[0] ?? {};
        const routesDir = options.routes_dir ?? ROUTES_DIR;

        if (filename === '<input>' || !isInRoutesDirectory(filename, routesDir)) {
            return {};
        }

        const importSourceByLocalName = new Map();

        function elementReferencesPageImport(elementNode) {
            const identifiers = collectIdentifiers(elementNode);

            for (const identifier of identifiers) {
                const sourcePath = importSourceByLocalName.get(identifier);
                if (isPageImportPath(sourcePath)) {
                    return true;
                }
            }

            return false;
        }

        return {
            ImportDeclaration(node) {
                const sourcePath = node.source?.type === 'Literal'
                    ? node.source.value
                    : null;

                if (!sourcePath || typeof sourcePath !== 'string') {
                    return;
                }

                for (const specifier of node.specifiers ?? []) {
                    if (specifier.type === 'ImportSpecifier' || specifier.type === 'ImportDefaultSpecifier') {
                        importSourceByLocalName.set(specifier.local.name, sourcePath);
                    }
                }
            },
            ObjectExpression(node) {
                const pathProperty = getObjectProperty(node, 'path');

                if (!pathProperty) {
                    return;
                }

                const childrenProperty = getObjectProperty(node, 'children');

                // Layout/container routes are allowed to map children instead of a page directly.
                if (childrenProperty) {
                    return;
                }

                const routePath = getStaticString(pathProperty.value);

                if (!routePath) {
                    return;
                }

                const loaderProperty = getObjectProperty(node, 'loader');
                const elementProperty = getObjectProperty(node, 'element');

                if (loaderProperty) {
                    const importPath = extractLoaderImportPath(loaderProperty.value);
                    if (isPageImportPath(importPath)) {
                        return;
                    }

                    context.report({
                        node: loaderProperty,
                        messageId: 'missingPageMapping',
                        data: { routePath },
                    });
                    return;
                }

                if (elementProperty) {
                    if (elementReferencesPageImport(elementProperty.value)) {
                        return;
                    }

                    context.report({
                        node: elementProperty,
                        messageId: 'missingPageMapping',
                        data: { routePath },
                    });
                    return;
                }

                context.report({
                    node: pathProperty,
                    messageId: 'missingPageMapping',
                    data: { routePath },
                });
            },
        };
    },
};
