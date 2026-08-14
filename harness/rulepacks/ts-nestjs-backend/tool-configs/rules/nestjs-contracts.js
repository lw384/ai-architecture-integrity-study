import {
    collectImportedNames,
    getClassExtendsCallName,
    isClassValidatorDecorator,
    isDtoFile,
} from './_helpers.js';

function shouldInspectDtoClass(node) {
    const className = node.id?.name ?? '';

    if (!className.endsWith('Dto') || className.endsWith('ResponseDto')) {
        return false;
    }

    const extendsCallName = getClassExtendsCallName(node);

    if (extendsCallName === 'PartialType') {
        return false;
    }

    return true;
}

export const nestjsContractsPlugin = {
    rules: {
        'request-dto-must-use-validators': {
            meta: {
                type: 'problem',
                docs: {
                    description: 'Request DTO properties must use class-validator decorators.',
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
                const filePattern = options.filePattern ? new RegExp(options.filePattern) : null;

                if ((filePattern && !filePattern.test(filename)) || (!filePattern && !isDtoFile(filename))) {
                    return {};
                }

                let validatorImports = { imported: new Set(), namespaces: new Set() };

                return {
                    Program(node) {
                        validatorImports = collectImportedNames(node, 'class-validator');
                    },
                    ClassDeclaration(node) {
                        if (!shouldInspectDtoClass(node)) {
                            return;
                        }

                        for (const element of node.body.body ?? []) {
                            if (element.type !== 'PropertyDefinition' || element.static) {
                                continue;
                            }

                            const hasValidator = (element.decorators ?? []).some((decorator) =>
                                isClassValidatorDecorator(decorator, validatorImports)
                            );

                            if (!hasValidator) {
                                const propertyName = element.key?.type === 'Identifier'
                                    ? element.key.name
                                    : '<unknown>';

                                context.report({
                                    node: element.key ?? element,
                                    message: `Request DTO property "${propertyName}" must declare at least one class-validator decorator.`,
                                });
                            }
                        }
                    },
                };
            },
        },
    },
};
