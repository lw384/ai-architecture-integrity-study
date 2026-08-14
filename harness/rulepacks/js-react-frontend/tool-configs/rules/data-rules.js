import { matchesAnyPath, normalizePath } from './_helpers.js';

const DEFAULT_ALLOWED_DATA_ACCESS_PATHS = [
    'src/api/**/*.js',
    'src/api/**/*.jsx',
    'src/api/**/*.ts',
    'src/api/**/*.tsx',
    'src/pages/**/*Queries.js',
    'src/pages/**/*Queries.jsx',
    'src/pages/**/*Queries.ts',
    'src/pages/**/*Queries.tsx',
    'src/contexts/RouteAccessContext.jsx',
    'src/contexts/RouteAccessContext.tsx',
];

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

function isUseEffectCall(node) {
    if (node.callee?.type === 'Identifier') {
        return node.callee.name === 'useEffect';
    }

    return (
        node.callee?.type === 'MemberExpression'
        && node.callee.object?.type === 'Identifier'
        && node.callee.object.name === 'React'
        && node.callee.property?.type === 'Identifier'
        && node.callee.property.name === 'useEffect'
    );
}

export const networkCallsOnlyInApprovedModulesRule = {
    meta: {
        type: 'problem',
        schema: [{
            type: 'object',
            properties: {
                allowedPaths: {
                    type: 'array',
                    items: { type: 'string' },
                },
            },
            additionalProperties: false,
        }],
        messages: {
            disallowedNetworkCall: 'fetch/axios calls are only allowed in approved data access modules.',
        },
    },
    create(context) {
        const filename = normalizePath(context.filename ?? context.getFilename());
        const options = context.options[0] ?? {};
        const allowedPaths = options.allowedPaths ?? DEFAULT_ALLOWED_DATA_ACCESS_PATHS;
        const axiosAliases = new Set();

        if (filename === '<input>' || matchesAnyPath(filename, allowedPaths)) {
            return {};
        }

        return {
            ImportDeclaration(node) {
                if (node.source?.value !== 'axios') {
                    return;
                }

                for (const specifier of node.specifiers ?? []) {
                    if (specifier.local?.name) {
                        axiosAliases.add(specifier.local.name);
                    }
                }
            },
            CallExpression(node) {
                if (isFetchCall(node) || isAxiosCall(node, axiosAliases)) {
                    context.report({ node, messageId: 'disallowedNetworkCall' });
                }
            },
        };
    },
};

export const useEffectRequiresDependencyArrayRule = {
    meta: {
        type: 'problem',
        schema: [],
        messages: {
            missingDependencyArray: 'useEffect must declare a dependency array.',
        },
    },
    create(context) {
        return {
            CallExpression(node) {
                if (!isUseEffectCall(node)) {
                    return;
                }

                if (node.arguments.length < 2 || node.arguments[1]?.type !== 'ArrayExpression') {
                    context.report({ node, messageId: 'missingDependencyArray' });
                }
            },
        };
    },
};
