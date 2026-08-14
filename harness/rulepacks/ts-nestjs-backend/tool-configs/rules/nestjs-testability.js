import { isServiceFile } from './_helpers.js';

function getNewExpressionName(node) {
    if (node.callee?.type === 'Identifier') {
        return node.callee.name;
    }

    if (node.callee?.type === 'MemberExpression' && node.callee.property?.type === 'Identifier') {
        return node.callee.property.name;
    }

    return null;
}

export const nestjsTestabilityPlugin = {
    rules: {
        'no-direct-repository-construction': {
            meta: {
                type: 'problem',
                docs: {
                    description: 'Service classes must not directly construct repository instances.',
                },
                schema: [{
                    type: 'object',
                    properties: {
                        filePattern: { type: 'string' },
                    },
                    additionalProperties: false,
                }],
            },
            create(context) {
                const filename = context.getFilename();
                const options = context.options[0] ?? {};

                if (options.filePattern) {
                    if (!new RegExp(options.filePattern).test(filename)) {
                        return {};
                    }
                } else if (!isServiceFile(filename)) {
                    return {};
                }

                return {
                    NewExpression(node) {
                        const className = getNewExpressionName(node);

                        if (!className) {
                            return;
                        }

                        if (className === 'Repository' || className.endsWith('Repository')) {
                            context.report({
                                node,
                                message: `Service layer must not instantiate "${className}" directly. Obtain repositories via dependency injection.`,
                            });
                        }
                    },
                };
            },
        },
    },
};
