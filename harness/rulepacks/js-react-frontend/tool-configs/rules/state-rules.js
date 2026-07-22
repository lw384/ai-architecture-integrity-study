import {
    STATELESS_COMPONENT_PATHS,
    isControlledProviderFile,
    isInAnyPath,
    normalizePath,
} from './_helpers.js';

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

        if (filename === '<input>' || !isInAnyPath(filename, STATELESS_COMPONENT_PATHS)) {
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
};
