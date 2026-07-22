import path from 'node:path';
import fs from 'node:fs';

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
                docs: { description: 'module.ts must not export Repository symbols' },
                schema: [{
                    type: 'object',
                    properties: {
                        forbiddenSuffixes: { type: 'array', items: { type: 'string' } },
                        filePattern: { type: 'string' },
                    },
                }],
            },
            create(context) {
                const filename = context.getFilename();
                const options = context.options[0] || {};
                const filePattern = new RegExp(options.filePattern || '\\.module\\.ts$');
                const forbidden = options.forbiddenSuffixes || ['Repository', 'Entity'];

                if (!filePattern.test(filename)) return {};
                const isForbidden = (name) =>
                    name && forbidden.some((s) => name.endsWith(s));

                return {
                    // export class FooRepository {}
                    ExportNamedDeclaration(node) {
                        if (node.declaration?.type === 'ClassDeclaration'
                            && isForbidden(node.declaration.id?.name)) {
                            context.report({
                                node,
                                message: `module.ts must not export "${node.declaration.id.name}"`,
                            });
                        }
                        // export { FooRepository } / export { FooRepository as X }
                        for (const spec of node.specifiers || []) {
                            if (isForbidden(spec.exported.name) || isForbidden(spec.local.name)) {
                                context.report({
                                    node: spec,
                                    message: `module.ts must not export "${spec.local.name}"`,
                                });
                            }
                        }
                    },
                    ExportAllDeclaration(node) {
                        if (/\.repository(\.ts)?$|\.entity(\.ts)?$/.test(node.source.value)) {
                            context.report({
                                node,
                                message: `module.ts must not re-export from "${node.source.value}"`,
                            });
                        }
                    },
                };
            }
        },
    }
}
