function isMittImport(node) {
    return node.source?.type === 'Literal' && node.source.value === 'mitt';
}

function isEventEmitterImport(node) {
    return node.source?.type === 'Literal' && ['events', 'eventemitter3'].includes(node.source.value);
}

export const noGlobalEventBusRule = {
    meta: {
        type: 'problem',
        schema: [],
        messages: {
            noGlobalEventBus: 'Global event bus patterns are not allowed.',
        },
    },
    create(context) {
        const forbiddenFactories = new Set();

        return {
            ImportDeclaration(node) {
                if (isMittImport(node) || isEventEmitterImport(node)) {
                    for (const specifier of node.specifiers ?? []) {
                        if (specifier.local?.name) {
                            forbiddenFactories.add(specifier.local.name);
                        }
                    }

                    context.report({ node, messageId: 'noGlobalEventBus' });
                }
            },
            NewExpression(node) {
                if (node.callee?.type === 'Identifier' && forbiddenFactories.has(node.callee.name)) {
                    context.report({ node, messageId: 'noGlobalEventBus' });
                }
            },
            CallExpression(node) {
                if (node.callee?.type === 'Identifier' && forbiddenFactories.has(node.callee.name)) {
                    context.report({ node, messageId: 'noGlobalEventBus' });
                }
            },
        };
    },
};
