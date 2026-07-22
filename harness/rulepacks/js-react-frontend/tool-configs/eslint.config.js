import path from 'node:path';

const STATELESS_COMPONENT_PATHS = [
    'src/components/ui/',
    'src/components/atoms/',
];

const CONTROLLED_PROVIDER_PATHS = [
    'src/providers/',
    'src/app/providers.',
    'src/pages/_app.',
    'src/context/providers.',
];

function normalizePath(filePath) {
    return filePath.split(path.sep).join('/');
}

function isInAnyPath(filePath, prefixes) {
    return prefixes.some((prefix) => filePath.includes(`/${prefix}`) || filePath.startsWith(prefix));
}

function isControlledProviderFile(filePath) {
    if (isInAnyPath(filePath, ['src/providers/'])) {
        return true;
    }

    return CONTROLLED_PROVIDER_PATHS.some((prefix) => filePath.includes(`/${prefix}`) || filePath.startsWith(prefix));
}

function createRules() {
    return {
        'business-jsx-max-depth': {
            meta: {
                type: 'suggestion',
                schema: [{
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                        max: { type: 'integer', minimum: 1 },
                        transparent_wrappers: { type: 'array', items: { type: 'string' } },
                    },
                }],
                messages: {
                    jsxTooDeep: 'JSX nesting should not exceed {{max}} levels (business-logic depth, ignoring transparent wrappers).',
                },
            },
            create(context) {
                const options = context.options[0] ?? {};
                const max = options.max ?? 5;
                const transparentWrappers = new Set(options.transparent_wrappers ?? [
                    'Popper', 'Portal', 'Modal', 'Backdrop',
                    'ClickAwayListener', 'Fade', 'Grow', 'Zoom', 'Slide', 'Collapse',
                    'Transitions',
                ]);

                function isTransparentWrapper(node) {
                    if (node.type === 'JSXFragment') {
                        return true; // <> and <Fragment>
                    }

                    if (node.type === 'JSXElement') {
                        const name = node.openingElement.name;
                        if (name.type === 'JSXIdentifier') {
                            return transparentWrappers.has(name.name);
                        }
                    }

                    return false;
                }

                function isRenderPropCallback(node) {
                    // Check if this node is a child of a JSXExpressionContainer containing a function
                    let current = node.parent;
                    while (current) {
                        if (current.type === 'JSXExpressionContainer' && current.parent?.type === 'JSXElement') {
                            // This is {something} inside JSX
                            if (current.expression.type === 'ArrowFunctionExpression' ||
                                current.expression.type === 'FunctionExpression') {
                                return true;
                            }
                        }
                        current = current.parent;
                    }
                    return false;
                }

                function getBusinessJsxDepth(node) {
                    let depth = 0;
                    let current = node;

                    // Count only business layers, skip transparent wrappers
                    while (current) {
                        if ((current.type === 'JSXElement' || current.type === 'JSXFragment') &&
                            !isTransparentWrapper(current)) {
                            depth += 1;
                        }

                        current = current.parent;
                    }

                    return depth;
                }

                return {
                    JSXElement(node) {
                        if (isRenderPropCallback(node)) {
                            return; // Render-prop children don't count
                        }

                        const depth = getBusinessJsxDepth(node);

                        if (depth <= max) {
                            return;
                        }

                        // Report at the violation point (first node exceeding max)
                        let parent = node.parent;
                        let parentDepth = 0;
                        while (parent) {
                            if ((parent.type === 'JSXElement' || parent.type === 'JSXFragment') &&
                                !isTransparentWrapper(parent)) {
                                parentDepth += 1;
                            }
                            parent = parent.parent;
                        }

                        if (parentDepth > max) {
                            return; // Already reported at a higher level
                        }

                        context.report({
                            node,
                            messageId: 'jsxTooDeep',
                            data: { max: String(max) },
                        });
                    },
                };
            },
            'no-usestate-in-deep-child-components': {
                meta: {
                    type: 'suggestion',
                    schema: [],
                    messages: {
                        noDeepChildUseState: 'useState should not appear in deep child components.',
                    },
                },
                create(context) {
                    const filename = normalizePath(context.filename ?? context.getFilename());

                    if (filename === '<input>' || !isInAnyPath(filename, STATELESS_COMPONENT_PATHS)) {
                        return {};
                    }

                    return {
                        CallExpression(node) {
                            if (
                                node.callee.type === 'Identifier' &&
                                (node.callee.name === 'useState' || node.callee.name === 'useReducer')
                            ) {
                                context.report({ node, messageId: 'noDeepChildUseState' });
                            }

                            if (
                                node.callee.type === 'MemberExpression' &&
                                node.callee.object.type === 'Identifier' &&
                                node.callee.object.name === 'React' &&
                                node.callee.property.type === 'Identifier' &&
                                (node.callee.property.name === 'useState' || node.callee.property.name === 'useReducer')
                            ) {
                                context.report({ node, messageId: 'noDeepChildUseState' });
                            }
                        },
                    };
                },
            },
            'context-provider-only-in-controlled-locations': {
                meta: {
                    type: 'suggestion',
                    schema: [],
                    messages: {
                        providerOutsideBoundary: 'Context providers must stay in controlled locations.',
                    },
                },
                create(context) {
                    const filename = normalizePath(context.filename ?? context.getFilename());

                    if (filename === '<input>' || isControlledProviderFile(filename)) {
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
            },
        };
    }

    const architecturePlugin = {
        rules: createRules(),
    };

    export default [
        {
            ignores: ['node_modules/**', 'dist/**', 'build/**', 'coverage/**'],
        },
        {
            files: ['**/*.js', '**/*.jsx', '**/*.cjs', '**/*.mjs'],
            languageOptions: {
                ecmaVersion: 2021,
                sourceType: 'module',
                parserOptions: {
                    ecmaFeatures: {
                        jsx: true,
                    },
                },
            },
            plugins: {
                architecture: architecturePlugin,
            },
            rules: {
                'max-lines': ['error', {
                    max: 300,
                    skipBlankLines: true,
                    skipComments: true,
                }],
                'architecture/business-jsx-max-depth': ['error', {
                    max: 5,
                    transparent_wrappers: [
                        'Popper', 'Portal', 'Modal', 'Backdrop',
                        'ClickAwayListener', 'Fade', 'Grow', 'Zoom', 'Slide', 'Collapse',
                        'Transitions',
                    ],
                }],
                'architecture/no-usestate-in-deep-child-components': 'error',
                'architecture/context-provider-only-in-controlled-locations': 'error',
            },
        },
    ];