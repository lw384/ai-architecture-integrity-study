import {
    CONTROLLED_PROVIDER_PATHS,
    STATELESS_COMPONENT_PATHS,
    matchesAnyPath,
    normalizePath,
} from './_helpers.js';

const DEFAULT_ALLOWED_PATHS = [
    'src/App.js',
    'src/App.jsx',
    'src/App.ts',
    'src/App.tsx',
    'src/providers/**/*.js',
    'src/providers/**/*.jsx',
    'src/providers/**/*.ts',
    'src/providers/**/*.tsx',
    'src/contexts/**/*.js',
    'src/contexts/**/*.jsx',
    'src/contexts/**/*.ts',
    'src/contexts/**/*.tsx',
    'src/layout/**/*Layout.js',
    'src/layout/**/*Layout.jsx',
    'src/layout/**/*Layout.ts',
    'src/layout/**/*Layout.tsx',
    ...CONTROLLED_PROVIDER_PATHS.map((prefix) => `${prefix}*`),
];

export const noUseStateInDeepChildComponentsRule = {
    meta: {
        type: 'suggestion',
        schema: [],
        messages: {
            noDeepChildUseState: 'useState should not appear in deep child components.',
        },
    },
    create(context) {
        const filename = normalizePath(context.filename ?? context.getFilename());

        if (filename === '<input>' || !matchesAnyPath(filename, STATELESS_COMPONENT_PATHS)) {
            return {};
        }

        return {
            CallExpression(node) {
                if (
                    node.callee.type === 'Identifier'
                    && (node.callee.name === 'useState' || node.callee.name === 'useReducer')
                ) {
                    context.report({ node, messageId: 'noDeepChildUseState' });
                }

                if (
                    node.callee.type === 'MemberExpression'
                    && node.callee.object.type === 'Identifier'
                    && node.callee.object.name === 'React'
                    && node.callee.property.type === 'Identifier'
                    && (node.callee.property.name === 'useState' || node.callee.property.name === 'useReducer')
                ) {
                    context.report({ node, messageId: 'noDeepChildUseState' });
                }
            },
        };
    },
};

export const contextProviderOnlyInControlledLocationsRule = {
    meta: {
        type: 'suggestion',
        schema: [
            {
                type: 'object',
                properties: {
                    allowedPaths: {
                        type: 'array',
                        items: { type: 'string' },
                    },
                },
                additionalProperties: false,
            },
        ],
        messages: {
            providerOutsideBoundary: 'Context providers must stay in controlled locations.',
        },
    },
    create(context) {
        const options = context.options[0] ?? {};
        const allowedPaths = options.allowedPaths ?? DEFAULT_ALLOWED_PATHS;
        const filename = normalizePath(context.filename ?? context.getFilename());

        if (filename === '<input>' || matchesAnyPath(filename, allowedPaths)) {
            return {};
        }

        return {
            JSXOpeningElement(node) {
                if (node.name.type !== 'JSXMemberExpression') {
                    return;
                }

                if (node.name.property.type !== 'JSXIdentifier' || node.name.property.name !== 'Provider') {
                    return;
                }

                context.report({ node, messageId: 'providerOutsideBoundary' });
            },
        };
    },
};
