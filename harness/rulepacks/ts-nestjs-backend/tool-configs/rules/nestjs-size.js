import {
    isControllerFile,
    isRepositoryFile,
    isServiceFile,
    isSpecFile,
} from './_helpers.js';

function isProductionMethodFile(filename) {
    if (isSpecFile(filename)) {
        return false;
    }

    return isControllerFile(filename) || isServiceFile(filename) || isRepositoryFile(filename);
}

export const nestjsSizePlugin = {
    rules: {
        'max-method-parameters': {
            meta: {
                type: 'problem',
                docs: {
                    description: 'Production controller/service/repository methods must not exceed the max direct parameter count.',
                },
                schema: [{
                    type: 'object',
                    properties: {
                        max: { type: 'number' },
                    },
                    additionalProperties: false,
                }],
            },
            create(context) {
                const filename = context.getFilename();
                const options = context.options[0] ?? {};
                const max = options.max ?? 3;

                if (!isProductionMethodFile(filename)) {
                    return {};
                }

                return {
                    MethodDefinition(node) {
                        if (node.kind === 'constructor') {
                            return;
                        }

                        const params = node.value?.params ?? [];

                        if (params.length > max) {
                            const methodName = node.key?.type === 'Identifier' ? node.key.name : '<unknown>';

                            context.report({
                                node: node.key ?? node,
                                message: `Production method "${methodName}" has ${params.length} direct parameters; maximum allowed is ${max}.`,
                            });
                        }
                    },
                };
            },
        },
    },
};
