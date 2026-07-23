import path from 'node:path';
import fs from 'node:fs';
import {
    extractIdentifierNamesFromArray,
    getModuleDecoratorArgument,
    getObjectProperty,
    isForbiddenSourcePath,
    isForbiddenSymbol,
} from './_helpers.js';

export const nestjsStructPlugin = {
    rules: {
        'module-composition': {
            meta: {
                type: 'problem',
                docs: {
                    description: 'Ensure each NestJS module has controller/service files',
                    category: 'Possible Errors',
                    recommended: true,
                },
                schema: [
                    {
                        type: 'object',
                        properties: {
                            require_controller: { type: 'boolean' },
                            require_service: { type: 'boolean' },
                            require_repository: { type: 'boolean' },
                        },
                        additionalProperties: false,
                    },
                ],
            },
            create(context) {
                const options = context.options[0] || {};
                const {
                    require_controller = true,
                    require_service = true,
                    require_repository = false,
                } = options;

                return {
                    Decorator(node) {
                        // 检测 @Module() 装饰器
                        if (node.expression.callee?.name === 'Module') {
                            const filename = context.filename;

                            // 仅检查 .module.ts 文件
                            if (!filename.includes('.module.ts')) {
                                return;
                            }

                            const moduleDir = path.dirname(filename);
                            const basename = path.basename(filename, '.module.ts');

                            // 检查所需文件
                            const requiredFiles = [];
                            const missingFiles = [];

                            if (require_controller) {
                                requiredFiles.push(`${basename}.controller.ts`);
                            }
                            if (require_service) {
                                requiredFiles.push(`${basename}.service.ts`);
                            }
                            if (require_repository) {
                                requiredFiles.push(`${basename}.repository.ts`);
                            }

                            // 检查文件是否存在
                            for (const file of requiredFiles) {
                                const filePath = path.join(moduleDir, file);
                                if (!fs.existsSync(filePath)) {
                                    missingFiles.push(file);
                                }
                            }

                            // 报告缺失的文件
                            if (missingFiles.length > 0) {
                                context.report({
                                    node,
                                    message: `Module "${basename}" is missing required files: ${missingFiles.join(', ')}. ` +
                                        `Module structure should include: ${requiredFiles.join(', ')}`,
                                });
                            }
                        }
                    },
                };
            },
        },
        'no-repository-in-module-exports': {
            meta: {
                type: 'problem',
                docs: {
                    description: 'Module entry files must not export persistence-layer symbols.',
                    category: 'architecture',
                    recommended: true,
                },
                schema: [
                    {
                        type: 'object',
                        properties: {
                            filePattern: {
                                type: 'string',
                                description: 'Regex identifying module entry files',
                            },
                            forbiddenSuffixes: {
                                type: 'array',
                                items: { type: 'string' },
                                description: 'Symbol suffixes treated as persistence-layer',
                            },
                            forbiddenSourcePatterns: {
                                type: 'array',
                                items: { type: 'string' },
                                description: 'Regex list for forbidden re-export source paths',
                            },
                            checkTypeOnlyExports: {
                                type: 'boolean',
                                description: 'If true, also check export type declarations',
                            },
                            checkNestModuleExports: {
                                type: 'boolean',
                                description: 'If true, also inspect @Module({ exports })',
                            },
                        },
                        additionalProperties: false,
                    },
                ],
                messages: {
                    namedExport: 'BE-DOM-C-002: module entry must not export persistence-layer symbol "{{name}}". Expose Service APIs instead.',
                    reExportSource: 'BE-DOM-C-002: module entry must not re-export from persistence-layer file "{{source}}".',
                    nestModuleExport: 'BE-DOM-C-002: @Module({ exports }) must not include persistence-layer symbol "{{name}}".',
                },
            },
            create(context) {
                const options = context.options[0] || {};
                const filePattern = new RegExp(options.filePattern || '(\\.module\\.ts|/index\\.ts)$');
                const forbiddenSuffixes = options.forbiddenSuffixes || ['Repository', 'Entity'];
                const forbiddenSourcePatterns = (
                    options.forbiddenSourcePatterns || ['\\.repository(\\.ts)?$', '\\.entity(\\.ts)?$']
                ).map((pattern) => new RegExp(pattern));
                const checkTypeOnlyExports = options.checkTypeOnlyExports ?? true;
                const checkNestModuleExports = options.checkNestModuleExports ?? true;
                const filename = context.getFilename();

                if (!filePattern.test(filename)) return {};

                return {
                    ExportNamedDeclaration(node) {
                        if (node.exportKind === 'type' && !checkTypeOnlyExports) {
                            return;
                        }

                        if (node.declaration) {
                            const declaration = node.declaration;
                            const symbolName = (
                                declaration.type === 'ClassDeclaration' ||
                                declaration.type === 'TSInterfaceDeclaration' ||
                                declaration.type === 'TSTypeAliasDeclaration'
                            ) && declaration.id
                                ? declaration.id.name
                                : null;

                            if (symbolName && isForbiddenSymbol(symbolName, forbiddenSuffixes)) {
                                context.report({
                                    node: declaration,
                                    messageId: 'namedExport',
                                    data: { name: symbolName },
                                });
                            }

                            return;
                        }

                        for (const specifier of node.specifiers || []) {
                            const localName = specifier.local?.name;
                            const exportedName = specifier.exported?.name;
                            const forbiddenName = [localName, exportedName].find((name) => isForbiddenSymbol(name, forbiddenSuffixes));

                            if (forbiddenName) {
                                context.report({
                                    node: specifier,
                                    messageId: 'namedExport',
                                    data: { name: forbiddenName },
                                });
                            }
                        }

                        if (node.source && isForbiddenSourcePath(node.source.value, forbiddenSourcePatterns)) {
                            context.report({
                                node: node.source,
                                messageId: 'reExportSource',
                                data: { source: node.source.value },
                            });
                        }
                    },
                    ExportAllDeclaration(node) {
                        if (node.source && isForbiddenSourcePath(node.source.value, forbiddenSourcePatterns)) {
                            context.report({
                                node,
                                messageId: 'reExportSource',
                                data: { source: node.source.value },
                            });
                        }
                    },
                    Decorator(node) {
                        if (!checkNestModuleExports) {
                            return;
                        }

                        const moduleArg = getModuleDecoratorArgument(node);

                        if (!moduleArg) {
                            return;
                        }

                        const exportsProp = getObjectProperty(moduleArg, 'exports');

                        if (!exportsProp) {
                            return;
                        }

                        const identifiers = extractIdentifierNamesFromArray(exportsProp);

                        for (const { name, node: idNode } of identifiers) {
                            if (isForbiddenSymbol(name, forbiddenSuffixes)) {
                                context.report({
                                    node: idNode,
                                    messageId: 'nestModuleExport',
                                    data: { name },
                                });
                            }
                        }
                    },
                };
            }
        },
    }
}
