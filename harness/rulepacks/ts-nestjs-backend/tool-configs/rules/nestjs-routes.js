import {
    getDecoratorName,
    getLiteralStringValue,
    isControllerFile,
    isKebabCaseRoutePath,
    isMainFile,
} from './_helpers.js';

const HTTP_DECORATORS = new Set(['Get', 'Post', 'Put', 'Patch', 'Delete', 'Options', 'Head', 'All']);

function checkRouteLiteral(context, node, value, label) {
    if (value === null || isKebabCaseRoutePath(value)) {
        return;
    }

    context.report({
        node,
        message: `${label} path "${value}" must use kebab-case segments.`,
    });
}

export const nestjsRoutesPlugin = {
    rules: {
        'api-prefix-and-kebab-routes': {
            meta: {
                type: 'problem',
                docs: {
                    description: 'Resolved routes must use the global /api prefix and kebab-case path segments.',
                },
                schema: [{
                    type: 'object',
                    properties: {
                        requiredPrefix: { type: 'string' },
                    },
                    additionalProperties: false,
                }],
            },
            create(context) {
                const filename = context.getFilename();
                const options = context.options[0] ?? {};
                const requiredPrefix = options.requiredPrefix ?? 'api';
                const inspectMain = isMainFile(filename);
                const inspectController = isControllerFile(filename);
                let foundPrefix = false;

                if (!inspectMain && !inspectController) {
                    return {};
                }

                return {
                    CallExpression(node) {
                        if (!inspectMain) {
                            return;
                        }

                        if (
                            node.callee?.type === 'MemberExpression'
                            && node.callee.property?.type === 'Identifier'
                            && node.callee.property.name === 'setGlobalPrefix'
                        ) {
                            const prefixValue = getLiteralStringValue(node.arguments?.[0]);

                            if (prefixValue === requiredPrefix) {
                                foundPrefix = true;
                            }
                        }
                    },
                    'Program:exit'(node) {
                        if (inspectMain && !foundPrefix) {
                            context.report({
                                node,
                                message: `Application bootstrap must call app.setGlobalPrefix('${requiredPrefix}').`,
                            });
                        }
                    },
                    Decorator(node) {
                        if (!inspectController) {
                            return;
                        }

                        const decoratorName = getDecoratorName(node);

                        if (!decoratorName || (!HTTP_DECORATORS.has(decoratorName) && decoratorName !== 'Controller')) {
                            return;
                        }

                        const expr = node.expression;
                        const callExpr = expr?.type === 'CallExpression' ? expr : null;
                        const pathValue = getLiteralStringValue(callExpr?.arguments?.[0]);

                        if (pathValue === null) {
                            return;
                        }

                        const label = decoratorName === 'Controller' ? 'Controller' : `${decoratorName} route`;
                        checkRouteLiteral(context, callExpr?.arguments?.[0] ?? node, pathValue, label);
                    },
                };
            },
        },
    },
};
