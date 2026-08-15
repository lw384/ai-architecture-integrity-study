import path from 'node:path';
import { matchesAnyPath, normalizePath } from './_helpers.js';

const DEFAULT_ALLOWED_GLOBAL_STYLE_IMPORTS = [
    'src/styles/**/*.css',
    'src/styles/**/*.scss',
    'src/styles/**/*.sass',
    'src/assets/third-party/**/*.css',
    'src/assets/third-party/**/*.scss',
];

function isLocalStyleImport(sourcePath) {
    return typeof sourcePath === 'string' && (sourcePath.startsWith('.') || sourcePath.startsWith('/') || sourcePath.startsWith('src/'));
}

function isStylePath(sourcePath) {
    return /\.(css|scss|sass)$/.test(sourcePath);
}

function isModuleStylePath(sourcePath) {
    return /\.module\.(css|scss|sass)$/.test(sourcePath);
}

// A JSX style object is managed when it only transports runtime values into
// CSS custom properties. Visual rules remain in the component's CSS Module.
function containsOnlyCssCustomProperties(attributeValue) {
    if (attributeValue?.type !== 'JSXExpressionContainer') {
        return false;
    }

    const expression = attributeValue.expression;
    if (expression?.type !== 'ObjectExpression' || expression.properties.length === 0) {
        return false;
    }

    return expression.properties.every((property) => {
        if (property.type !== 'Property' || property.computed) {
            return false;
        }

        const propertyName = property.key.type === 'Identifier'
            ? property.key.name
            : property.key.value;

        return typeof propertyName === 'string' && propertyName.startsWith('--');
    });
}

function toComparableImportPath(sourcePath, importerPath) {
    if (!sourcePath) {
        return sourcePath;
    }

    if (sourcePath.startsWith('src/')) {
        return normalizePath(sourcePath);
    }

    if (sourcePath.startsWith('/')) {
        return normalizePath(sourcePath.replace(/^\/+/, ''));
    }

    if (!sourcePath.startsWith('.')) {
        return normalizePath(sourcePath);
    }

    const normalizedImporter = normalizePath(importerPath);
    const resolved = normalizePath(
        path.posix.normalize(path.posix.join(path.posix.dirname(normalizedImporter), sourcePath)),
    );
    const srcIndex = resolved.lastIndexOf('/src/');

    if (srcIndex >= 0) {
        return resolved.slice(srcIndex + 1);
    }

    return resolved;
}

export const noRawJsxStyleRule = {
    meta: {
        type: 'problem',
        schema: [],
        messages: {
            rawJsxStyle: 'Unmanaged JSX style props are not allowed. Use theme-aware sx, styled, MUI theme overrides, CSS Modules, or an approved shared abstraction.',
        },
    },
    create(context) {
        return {
            JSXAttribute(node) {
                const isStyleAttribute = node.name?.type === 'JSXIdentifier' && node.name.name === 'style';

                if (isStyleAttribute && !containsOnlyCssCustomProperties(node.value)) {
                    context.report({ node, messageId: 'rawJsxStyle' });
                }
            },
        };
    },
};

export const globalStylesOnlyInApprovedLocationsRule = {
    meta: {
        type: 'problem',
        schema: [{
            type: 'object',
            properties: {
                allowedGlobalStyleImports: {
                    type: 'array',
                    items: { type: 'string' },
                },
            },
            additionalProperties: false,
        }],
        messages: {
            disallowedGlobalStyleImport: 'Global stylesheet imports must come from approved locations only.',
        },
    },
    create(context) {
        const filename = normalizePath(context.filename ?? context.getFilename());
        const options = context.options[0] ?? {};
        const allowedGlobalStyleImports = options.allowedGlobalStyleImports ?? DEFAULT_ALLOWED_GLOBAL_STYLE_IMPORTS;

        if (filename === '<input>') {
            return {};
        }

        return {
            ImportDeclaration(node) {
                const sourcePath = typeof node.source?.value === 'string' ? node.source.value : null;

                if (!sourcePath || !isStylePath(sourcePath) || !isLocalStyleImport(sourcePath) || isModuleStylePath(sourcePath)) {
                    return;
                }

                const comparablePath = toComparableImportPath(sourcePath, filename);

                if (!matchesAnyPath(comparablePath, allowedGlobalStyleImports)) {
                    context.report({ node, messageId: 'disallowedGlobalStyleImport' });
                }
            },
        };
    },
};
