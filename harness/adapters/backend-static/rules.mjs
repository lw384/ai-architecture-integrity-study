// Deterministic backend constraints built on the shared project model. Each
// violation carries stable, rule-specific evidence for fixture assertions.
import path from 'node:path';
import {
    decoratorName,
    evaluateStatic,
    expressionName,
    getProperty,
    nodeLocation,
    resolveExportTargets,
    sourceText,
    walkAst,
} from './project.mjs';

const HTTP_EXCEPTIONS = new Set([
    'HttpException',
    'BadRequestException',
    'UnauthorizedException',
    'NotFoundException',
    'ForbiddenException',
    'NotAcceptableException',
    'RequestTimeoutException',
    'ConflictException',
    'GoneException',
    'PayloadTooLargeException',
    'UnsupportedMediaTypeException',
    'UnprocessableEntityException',
    'InternalServerErrorException',
    'NotImplementedException',
    'BadGatewayException',
    'ServiceUnavailableException',
    'GatewayTimeoutException',
]);
const HTTP_DECORATORS = new Set(['Get', 'Post', 'Put', 'Patch', 'Delete', 'Options', 'Head', 'All']);
const REQUEST_PARAMETER_DECORATORS = new Set(['Body', 'Query', 'Param', 'Headers']);
const NON_VALUE_VALIDATORS = new Set(['IsOptional', 'ValidateIf', 'Allow']);
const POLICY_NAME_RE = /(?:allowed|valid|transition|policy|invariant)|^(?:can|may|is|validate|assert|ensure|check)/i;

function violation(ruleId, file, node, payload) {
    return { ruleId, location: nodeLocation(file, node), payload };
}

function moduleParts(relativePath) {
    const match = relativePath.match(/^src\/modules\/([^/]+)\/(.+)$/);
    return match ? { owner: match[1], rest: match[2] } : null;
}

function layerOf(relativePath) {
    const match = relativePath.match(/\.(controller|service|repository|entity)\.[cm]?[jt]sx?$/);
    return match?.[1] ?? null;
}

function isModuleEntry(relativePath) {
    const parts = moduleParts(relativePath);
    return Boolean(parts && (parts.rest === 'index.ts' || parts.rest === `${parts.owner}.module.ts`));
}

function targetFiles(project, edge) {
    return edge.ultimateTargets
        .map((target) => project.byPath.get(target))
        .filter(Boolean);
}

function collectExpressionIdentifiers(node, names = new Set()) {
    walkAst(node, (child) => {
        if (child.type === 'Identifier') {
            names.add(child.name);
        }
    });
    return names;
}

function pascalCase(value) {
    return value.split(/[-_]/).filter(Boolean).map((part) => part[0]?.toUpperCase() + part.slice(1)).join('');
}

function findModuleDecorator(file) {
    for (const classNode of file.classes) {
        const decorator = (classNode.decorators ?? []).find((item) => decoratorName(item) === 'Module');
        if (decorator) return decorator;
    }
    return null;
}

function moduleMetadataNames(decorator, propertyName) {
    const call = decorator?.expression?.type === 'CallExpression' ? decorator.expression : null;
    const argument = call?.arguments?.[0];
    return collectExpressionIdentifiers(getProperty(argument, propertyName));
}

function analyzeStructure(project) {
    const findings = [];

    for (const file of project.files.filter((item) => /^src\/modules\/[^/]+\/[^/]+\.module\.ts$/.test(item.relative))) {
        const parts = moduleParts(file.relative);
        const basename = path.basename(file.relative, '.module.ts');

        if (!parts || basename !== parts.owner) {
            continue;
        }

        const decorator = findModuleDecorator(file);
        if (!decorator) continue;

        const required = ['controller', 'service', 'repository'];
        const missingFiles = [];
        const missingRegistrations = [];
        const controllers = moduleMetadataNames(decorator, 'controllers');
        const providers = moduleMetadataNames(decorator, 'providers');

        for (const layer of required) {
            const relative = `src/modules/${parts.owner}/${parts.owner}.${layer}.ts`;
            const target = project.files.find((candidate) => candidate.relative === relative);

            if (!target) {
                missingFiles.push(relative);
                continue;
            }

            const importedNames = file.imports
                .filter((edge) => edge.resolved === target.path)
                .flatMap((edge) => edge.bindings.map((binding) => binding.local));
            const expectedName = `${pascalCase(parts.owner)}${pascalCase(layer)}`;
            const candidates = new Set([...importedNames, expectedName]);
            const metadata = layer === 'controller' ? controllers : providers;

            if (![...candidates].some((name) => metadata.has(name))) {
                missingRegistrations.push(`${layer}:${relative}`);
            }
        }

        if (missingFiles.length > 0 || missingRegistrations.length > 0) {
            findings.push(violation('BE-STRUCT-C-001', file, decorator, {
                module: parts.owner,
                missing_files: missingFiles,
                missing_registrations: missingRegistrations,
                message: `Business module ${parts.owner} must provide and register its controller, service, and repository.`,
            }));
        }
    }

    return findings;
}

function analyzeDependencies(project) {
    const findings = [];
    const forbiddenLayerPairs = new Set([
        'controller:controller',
        'controller:repository',
        'service:controller',
        'repository:controller',
        'repository:service',
        'entity:controller',
        'entity:service',
        'entity:repository',
    ]);

    for (const file of project.files) {
        const sourceModule = moduleParts(file.relative);
        const sourceLayer = layerOf(file.relative);

        for (const edge of file.imports) {
            const targets = targetFiles(project, edge);

            if (sourceModule && sourceLayer) {
                for (const target of targets) {
                    const targetModule = moduleParts(target.relative);
                    const targetLayer = layerOf(target.relative);

                    if (
                        targetModule?.owner === sourceModule.owner
                        && targetLayer
                        && forbiddenLayerPairs.has(`${sourceLayer}:${targetLayer}`)
                    ) {
                        findings.push(violation('BE-DEP-C-001', file, edge.sourceNode, {
                            from_layer: sourceLayer,
                            to_layer: targetLayer,
                            import_path: edge.source,
                            resolved_target: target.relative,
                            message: `${sourceLayer} must not depend directly on ${targetLayer}.`,
                        }));
                        break;
                    }
                }
            }

            if (/^src\/(?:common|core)\//.test(file.relative)) {
                const businessTarget = targets.find((target) => /^src\/modules\//.test(target.relative));

                if (businessTarget) {
                    findings.push(violation('BE-DEP-C-002', file, edge.sourceNode, {
                        import_path: edge.source,
                        resolved_target: businessTarget.relative,
                        dynamic: edge.dynamic,
                        message: 'common/core must not import business implementations from src/modules.',
                    }));
                }
            }

            if (
                /(?:^|\/)(?:guards?|interceptors?|filters?)(?:\/|$)|\.(?:guard|interceptor|filter)\.[cm]?[jt]s$/.test(file.relative)
            ) {
                const persistenceTarget = targets.find((target) => ['entity', 'repository'].includes(layerOf(target.relative)));

                if (persistenceTarget) {
                    findings.push(violation('BE-DEP-C-003', file, edge.sourceNode, {
                        import_path: edge.source,
                        resolved_target: persistenceTarget.relative,
                        target_layer: layerOf(persistenceTarget.relative),
                        message: 'Guards, interceptors, and filters must remain independent of module persistence.',
                    }));
                }
            }
        }
    }

    return findings;
}

function analyzeDomainBoundaries(project) {
    const findings = [];

    for (const file of project.files) {
        const sourceModule = moduleParts(file.relative);

        for (const edge of file.imports) {
            const directTarget = edge.resolved ? project.byPath.get(edge.resolved) : null;
            const targetModule = directTarget ? moduleParts(directTarget.relative) : null;

            if (
                sourceModule
                && targetModule
                && sourceModule.owner !== targetModule.owner
                && !isModuleEntry(directTarget.relative)
            ) {
                findings.push(violation('BE-DOM-C-001', file, edge.sourceNode, {
                    source_module: sourceModule.owner,
                    target_module: targetModule.owner,
                    import_path: edge.source,
                    resolved_target: directTarget.relative,
                    message: 'Cross-module imports must use index.ts or the target module file.',
                }));
            }
        }

        if (!isModuleEntry(file.relative)) {
            continue;
        }

        for (const statement of file.ast.body ?? []) {
            if (statement.type === 'ExportAllDeclaration' || statement.type === 'ExportNamedDeclaration') {
                if (statement.source?.value) {
                    const exportedNames = new Set((statement.specifiers ?? []).map((specifier) =>
                        specifier.local?.name ?? specifier.local?.value ?? '*'
                    ));
                    const resolvedFiles = resolveExportTargets(
                        project,
                        file,
                        statement.source.value,
                        exportedNames.size > 0 ? exportedNames : new Set(['*']),
                    ).map((target) => project.byPath.get(target)).filter(Boolean);
                    const forbiddenTarget = resolvedFiles.find((target) =>
                        ['repository', 'entity'].includes(layerOf(target.relative))
                    );
                    const forbiddenName = (statement.specifiers ?? []).find((specifier) =>
                        /(?:Repository|Entity)$/.test(specifier.exported?.name ?? specifier.local?.name ?? '')
                    );

                    if (forbiddenTarget || forbiddenName) {
                        findings.push(violation('BE-DOM-C-002', file, statement.source ?? statement, {
                            export_kind: 're-export',
                            exported_symbol: forbiddenName?.exported?.name
                                ?? statement.specifiers?.[0]?.exported?.name
                                ?? null,
                            resolved_target: forbiddenTarget?.relative ?? null,
                            message: 'Module entry points must not export repositories or entities.',
                        }));
                    }
                } else {
                    for (const specifier of statement.specifiers ?? []) {
                        const localName = specifier.local?.name;
                        const binding = file.importBindings.get(localName);
                        const target = binding
                            ? file.imports.find((edge) => edge.source === binding.source)?.resolved
                            : null;
                        const targetFile = target ? project.byPath.get(target) : null;

                        if (/(?:Repository|Entity)$/.test(localName ?? '') || ['repository', 'entity'].includes(layerOf(targetFile?.relative ?? ''))) {
                            findings.push(violation('BE-DOM-C-002', file, specifier, {
                                export_kind: 'named-export',
                                exported_symbol: specifier.exported?.name ?? localName,
                                resolved_target: targetFile?.relative ?? null,
                                message: 'Module entry points must not export repositories or entities.',
                            }));
                        }
                    }
                }
            }

            if (statement.type === 'ExportDefaultDeclaration') {
                const names = collectExpressionIdentifiers(statement.declaration);
                let forbiddenName = [...names].find((name) => /(?:Repository|Entity)$/.test(name)) ?? null;
                let forbiddenTarget = null;

                for (const name of names) {
                    const binding = file.importBindings.get(name);
                    const edge = binding ? file.imports.find((item) => item.source === binding.source) : null;
                    const target = targetFiles(project, edge ?? { ultimateTargets: [] }).find((item) =>
                        ['repository', 'entity'].includes(layerOf(item.relative))
                    );
                    if (!target) continue;
                    forbiddenName ??= name;
                    forbiddenTarget = target;
                    break;
                }

                if (forbiddenName || forbiddenTarget) {
                    findings.push(violation('BE-DOM-C-002', file, statement.declaration, {
                        export_kind: 'default-export',
                        exported_symbol: forbiddenName ?? 'default',
                        resolved_target: forbiddenTarget?.relative ?? null,
                        message: 'Module entry points must not export repositories or entities.',
                    }));
                }
            }
        }

        const moduleDecorator = findModuleDecorator(file);
        const exportedNames = moduleMetadataNames(moduleDecorator, 'exports');

        for (const name of exportedNames) {
            const binding = file.importBindings.get(name);
            const edge = binding ? file.imports.find((item) => item.source === binding.source) : null;
            const targetFile = targetFiles(project, edge ?? { ultimateTargets: [] }).find((target) =>
                ['repository', 'entity'].includes(layerOf(target.relative))
            );

            if (/(?:Repository|Entity)$/.test(name) || ['repository', 'entity'].includes(layerOf(targetFile?.relative ?? ''))) {
                findings.push(violation('BE-DOM-C-002', file, moduleDecorator, {
                    export_kind: 'nestjs-module-export',
                    exported_symbol: name,
                    resolved_target: targetFile?.relative ?? null,
                    message: 'Nest module exports must not expose repositories or entities.',
                }));
            }
        }
    }

    return findings;
}

function localClassMap(file) {
    return new Map(file.classes.filter((node) => node.id?.name).map((node) => [node.id.name, node]));
}

function returnedExpression(file, callNode) {
    if (callNode?.type !== 'CallExpression' || callNode.callee?.type !== 'Identifier') {
        return null;
    }

    const declared = file.functions.get(callNode.callee.name);
    const constant = file.constants.get(callNode.callee.name);
    const fn = declared ?? (['ArrowFunctionExpression', 'FunctionExpression'].includes(constant?.type) ? constant : null);
    if (!fn) return null;
    if (fn.body?.type !== 'BlockStatement') return fn.body ?? null;
    return fn.body.body.find((statement) => statement.type === 'ReturnStatement')?.argument ?? null;
}

function variableInitializer(file, name) {
    return file.constants.get(name) ?? null;
}

function expressionType(file, node, seen = new Set()) {
    if (!node) return null;

    if (node.type === 'NewExpression') {
        return expressionName(node.callee);
    }

    if (node.type === 'Identifier') {
        if (seen.has(node.name)) return null;
        const initializer = variableInitializer(file, node.name);
        return initializer ? expressionType(file, initializer, new Set([...seen, node.name])) : node.name;
    }

    if (node.type === 'CallExpression') {
        const returned = returnedExpression(file, node);
        return returned ? expressionType(file, returned, seen) : expressionName(node.callee);
    }

    return expressionName(node);
}

function importedSymbol(file, expression) {
    if (expression?.type === 'Identifier') {
        return file.importBindings.get(expression.name) ?? null;
    }

    if (expression?.type === 'MemberExpression' && expression.object?.type === 'Identifier') {
        const namespace = file.importBindings.get(expression.object.name);
        return namespace ? { ...namespace, imported: expression.property?.name } : null;
    }

    return null;
}

function isHttpExceptionClass(project, file, className, seen = new Set()) {
    const key = `${file.path}:${className}`;
    if (seen.has(key)) return false;
    seen.add(key);

    const directBinding = file.importBindings.get(className);
    if (directBinding?.source === '@nestjs/common' && HTTP_EXCEPTIONS.has(directBinding.imported)) return true;

    const localClass = localClassMap(file).get(className);
    if (localClass) {
        const superClass = localClass.superClass;
        const superBinding = importedSymbol(file, superClass);
        if (superBinding?.source === '@nestjs/common' && HTTP_EXCEPTIONS.has(superBinding.imported)) return true;
        if (superClass?.type === 'Identifier' && isHttpExceptionClass(project, file, superClass.name, seen)) return true;
    }

    const edge = directBinding ? file.imports.find((item) => item.source === directBinding.source) : null;
    for (const target of targetFiles(project, edge ?? { ultimateTargets: [] })) {
        const targetName = directBinding.imported === 'default' ? className : directBinding.imported;
        if (isHttpExceptionClass(project, target, targetName, seen)) return true;
    }

    return false;
}

function isHttpExceptionExpression(project, file, node) {
    const expression = node?.type === 'NewExpression' ? node.callee : node;
    const imported = importedSymbol(file, expression);

    if (imported?.source === '@nestjs/common' && HTTP_EXCEPTIONS.has(imported.imported)) {
        return true;
    }

    const typeName = expressionType(file, node)?.split('.').pop();
    if (typeName && isHttpExceptionClass(project, file, typeName)) return true;

    if (node?.type === 'Identifier') {
        const initializer = variableInitializer(file, node.name);
        return initializer ? isHttpExceptionExpression(project, file, initializer) : false;
    }

    if (node?.type === 'CallExpression') {
        const returned = returnedExpression(file, node);
        return returned ? isHttpExceptionExpression(project, file, returned) : false;
    }

    return false;
}

function isApprovedAppException(project, file, node, config) {
    if (node?.type === 'Identifier') {
        const initializer = variableInitializer(file, node.name);
        return initializer ? isApprovedAppException(project, file, initializer, config) : false;
    }

    if (node?.type === 'CallExpression') {
        const returned = returnedExpression(file, node);
        return returned ? isApprovedAppException(project, file, returned, config) : false;
    }

    if (node?.type !== 'NewExpression') {
        return false;
    }

    const binding = importedSymbol(file, node.callee);
    const patterns = config.app_exception_sources ?? ['app-exception', 'common/exceptions'];
    if (binding?.imported !== 'AppException') return false;
    if (patterns.some((pattern) => new RegExp(pattern).test(binding.source))) return true;
    const edge = file.imports.find((item) => item.source === binding.source);
    return targetFiles(project, edge ?? { ultimateTargets: [] }).some((target) =>
        patterns.some((pattern) => new RegExp(pattern).test(target.relative))
    );
}

function throwStatements(file) {
    const throws = [];
    walkAst(file.ast, (node) => {
        if (node.type === 'ThrowStatement') throws.push(node);
    });
    return throws;
}

function catchRethrows(file) {
    const allowed = new Set();
    walkAst(file.ast, (node) => {
        if (node.type !== 'CatchClause' || node.param?.type !== 'Identifier') return;
        walkAst(node.body, (child) => {
            if (child.type === 'ThrowStatement' && child.argument?.type === 'Identifier' && child.argument.name === node.param.name) {
                allowed.add(child);
            }
        });
    });
    return allowed;
}

function catchBehavior(node) {
    const statements = node.body?.body ?? [];
    if (statements.length === 0) return 'empty';

    let meaningful = false;

    for (const statement of statements) {
        if (['ThrowStatement', 'ReturnStatement', 'BreakStatement', 'ContinueStatement'].includes(statement.type)) {
            meaningful = true;
            continue;
        }

        if (statement.type === 'ExpressionStatement' && statement.expression?.type === 'CallExpression') {
            const callee = expressionName(statement.expression.callee) ?? '';
            if (!/^(?:console|logger|this\.logger)\./.test(callee)) meaningful = true;
            continue;
        }

        if (statement.type !== 'ExpressionStatement') meaningful = true;
    }

    return meaningful ? 'handled' : 'log-only';
}

function analyzeErrors(project, config) {
    const findings = [];

    for (const file of project.files.filter((item) => /\.service\.[cm]?[jt]s$/.test(item.relative))) {
        const allowedRethrows = catchRethrows(file);

        for (const node of throwStatements(file)) {
            const approvedAppException = isApprovedAppException(project, file, node.argument, config);

            if (!approvedAppException && isHttpExceptionExpression(project, file, node.argument)) {
                findings.push(violation('BE-ERR-C-001', file, node, {
                    thrown_type: expressionType(file, node.argument),
                    message: 'Services must not throw NestJS HTTP exceptions.',
                }));
            }

            if (!allowedRethrows.has(node) && !approvedAppException) {
                findings.push(violation('BE-ERR-C-002', file, node, {
                    thrown_type: expressionType(file, node.argument),
                    message: 'Service failures must use the project AppException.',
                }));
            }
        }

        walkAst(file.ast, (node) => {
            if (node.type !== 'CatchClause') return;
            const behavior = catchBehavior(node);

            if (behavior !== 'handled') {
                findings.push(violation('BE-ERR-C-003', file, node, {
                    behavior,
                    message: 'Catch blocks must handle, wrap, or rethrow errors.',
                }));
            }
        });
    }

    return findings;
}

function typeReferenceName(parameter) {
    const annotation = parameter?.typeAnnotation?.typeAnnotation;

    if (annotation?.type === 'TSTypeReference') {
        return annotation.typeName?.type === 'Identifier' ? annotation.typeName.name : null;
    }

    return null;
}

function classKey(file, className) {
    return `${file.path}:${className}`;
}

function findClass(project, file, localName) {
    const local = file.classes.find((node) => node.id?.name === localName);
    if (local) return { file, node: local };

    const binding = file.importBindings.get(localName);
    const edge = binding ? file.imports.find((item) => item.source === binding.source) : null;

    for (const targetPath of edge?.ultimateTargets ?? []) {
        const targetFile = project.byPath.get(targetPath);
        const importedName = binding.imported === 'default' ? localName : binding.imported;
        const targetClass = targetFile?.classes.find((node) => node.id?.name === importedName || binding.imported === 'default');
        if (targetClass) return { file: targetFile, node: targetClass };
    }

    return null;
}

function mappedBaseName(classNode) {
    const superClass = classNode.superClass;
    if (superClass?.type !== 'CallExpression') return null;
    if (!['PartialType', 'PickType', 'OmitType', 'IntersectionType'].includes(expressionName(superClass.callee))) return null;
    return superClass.arguments?.[0]?.type === 'Identifier' ? superClass.arguments[0].name : null;
}

function validatorDecorators(file, property) {
    const decorators = [];

    for (const decorator of property.decorators ?? []) {
        const expression = decorator.expression?.type === 'CallExpression'
            ? decorator.expression.callee
            : decorator.expression;
        const binding = importedSymbol(file, expression);

        if (binding?.source === 'class-validator') {
            decorators.push(binding.imported);
        }
    }

    return decorators;
}

function requestDtoClasses(project) {
    const queue = [];
    const selected = new Map();

    for (const file of project.files.filter((item) => /\.controller\.[cm]?[jt]s$/.test(item.relative))) {
        walkAst(file.ast, (node) => {
            if (!['MethodDefinition', 'TSDeclareMethod'].includes(node.type)) return;

            for (const parameter of node.value?.params ?? []) {
                const decorators = parameter.decorators ?? parameter.parameter?.decorators ?? [];
                if (!decorators.some((item) => REQUEST_PARAMETER_DECORATORS.has(decoratorName(item)))) continue;
                const name = typeReferenceName(parameter.parameter ?? parameter);
                const found = name ? findClass(project, file, name) : null;
                if (found) queue.push(found);
            }
        });
    }

    while (queue.length > 0) {
        const current = queue.shift();
        const name = current.node.id?.name ?? '<anonymous>';
        const key = classKey(current.file, name);
        if (selected.has(key)) continue;
        selected.set(key, current);

        const baseName = mappedBaseName(current.node);
        const base = baseName ? findClass(project, current.file, baseName) : null;
        if (base) queue.push(base);
    }

    return [...selected.values()];
}

function analyzeDtoContracts(project) {
    const findings = [];
    const dtos = requestDtoClasses(project);
    const partialBases = new Set();

    for (const dto of dtos) {
        const baseName = mappedBaseName(dto.node);
        const base = baseName ? findClass(project, dto.file, baseName) : null;
        if (base) partialBases.add(classKey(base.file, base.node.id?.name));
    }

    for (const { file, node } of dtos) {
        const inheritedOptional = partialBases.has(classKey(file, node.id?.name));

        for (const property of node.body?.body ?? []) {
            if (property.type !== 'PropertyDefinition' || property.static) continue;
            const propertyName = property.key?.type === 'Identifier' ? property.key.name : '<unknown>';
            const validators = validatorDecorators(file, property);

            if (validators.length === 0) {
                findings.push(violation('BE-CONTRACT-C-002', file, property.key ?? property, {
                    dto: node.id?.name ?? '<anonymous>',
                    property: propertyName,
                    validators: [],
                    message: 'Request DTO properties must use class-validator.',
                }));
            }

            const optional = property.optional || validators.includes('IsOptional') || inheritedOptional;
            const valueValidators = validators.filter((name) => !NON_VALUE_VALIDATORS.has(name));

            if (optional && valueValidators.length === 0) {
                findings.push(violation('BE-CONTRACT-C-003', file, property.key ?? property, {
                    dto: node.id?.name ?? '<anonymous>',
                    property: propertyName,
                    validators,
                    message: 'Optional request properties must validate supplied values.',
                }));
            }
        }
    }

    return findings;
}

function isValidationPipe(node) {
    return node?.type === 'NewExpression' && /(?:^|\.)ValidationPipe$/.test(expressionName(node.callee) ?? '');
}

function validationPipeOptions(file, node) {
    return isValidationPipe(node) ? evaluateStatic(file, node.arguments?.[0]) : undefined;
}

function analyzeValidationPipe(project) {
    const findings = [];
    const controllers = project.files.filter((file) => /\.controller\.[cm]?[jt]s$/.test(file.relative));
    const bootstrapFiles = project.files.filter((file) => /(?:^|\/)(?:main|app\.module)\.ts$/.test(file.relative));

    if (controllers.length === 0 && bootstrapFiles.length === 0) return findings;

    let valid = false;
    let firstPipe = null;

    function inspectPipe(file, node) {
        if (!isValidationPipe(node)) return;
        firstPipe ??= { file, node };
        const options = validationPipeOptions(file, node);
        if (options?.whitelist === true && options?.forbidNonWhitelisted === true) valid = true;
    }

    for (const file of project.files) {
        walkAst(file.ast, (node) => {
            if (
                node.type === 'CallExpression'
                && /(?:^|\.)useGlobalPipes$/.test(expressionName(node.callee) ?? '')
            ) {
                for (const argument of node.arguments ?? []) walkAst(argument, (child) => inspectPipe(file, child));
            }

            if (node.type === 'ObjectExpression') {
                const provider = getProperty(node, 'provide');
                const providerName = expressionName(provider) ?? evaluateStatic(file, provider);
                if (providerName !== 'APP_PIPE') return;
                walkAst(node, (child) => inspectPipe(file, child));
            }
        });
    }

    if (!valid) {
        const subject = firstPipe ?? (bootstrapFiles[0] ? { file: bootstrapFiles[0], node: bootstrapFiles[0].ast } : null);

        if (subject) {
            findings.push(violation('BE-CONTRACT-C-004', subject.file, subject.node, {
                whitelist: firstPipe ? validationPipeOptions(firstPipe.file, firstPipe.node)?.whitelist ?? null : null,
                forbid_non_whitelisted: firstPipe
                    ? validationPipeOptions(firstPipe.file, firstPipe.node)?.forbidNonWhitelisted ?? null
                    : null,
                message: 'ValidationPipe must enable whitelist and forbidNonWhitelisted.',
            }));
        }
    }

    return findings;
}

function isKebabRoute(value) {
    if (typeof value !== 'string') return false;
    const segments = value.trim().replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
    return segments.every((segment) => {
        if (/^v\d+$/i.test(segment)) return true;
        if (segment.startsWith(':')) return /^[A-Za-z][A-Za-z0-9_]*$/.test(segment.slice(1));
        if (segment === '*' || /^\{\*[A-Za-z][A-Za-z0-9_]*\}$/.test(segment)) return true;
        return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(segment);
    });
}

function routeValues(file, node) {
    const value = evaluateStatic(file, node);
    if (typeof value === 'string') return [value];
    if (Array.isArray(value) && value.every((item) => typeof item === 'string')) return value;
    return [];
}

function analyzeRoutes(project) {
    const findings = [];
    const controllers = project.files.filter((file) => /\.controller\.[cm]?[jt]s$/.test(file.relative));
    const main = project.files.find((file) => file.relative === 'src/main.ts');
    let prefix = null;
    let prefixNode = main?.ast ?? null;
    let prefixExclusions = [];

    if (main) {
        walkAst(main.ast, (node) => {
            if (
                node.type === 'CallExpression'
                && /(?:^|\.)setGlobalPrefix$/.test(expressionName(node.callee) ?? '')
            ) {
                prefixNode = node;
                prefix = evaluateStatic(main, node.arguments?.[0]);
                const options = evaluateStatic(main, node.arguments?.[1]);
                prefixExclusions = Array.isArray(options?.exclude) ? options.exclude : [];
            }
        });
    }

    if (controllers.length > 0 && String(prefix ?? '').replace(/^\/+|\/+$/g, '') !== 'api') {
        const subject = main ?? controllers[0];
        findings.push(violation('BE-ROUTE-C-001', subject, prefixNode ?? subject.ast, {
            issue: 'global-prefix',
            resolved_prefix: prefix ?? null,
            message: 'Public routes must use the global /api prefix.',
        }));
    }

    if (prefixExclusions.length > 0 && main) {
        findings.push(violation('BE-ROUTE-C-001', main, prefixNode, {
            issue: 'prefix-exclusion',
            excluded_routes: prefixExclusions,
            message: 'Public routes must not be excluded from the global /api prefix.',
        }));
    }

    for (const file of controllers) {
        walkAst(file.ast, (node) => {
            if (node.type !== 'Decorator') return;
            const name = decoratorName(node);
            if (name !== 'Controller' && !HTTP_DECORATORS.has(name)) return;
            const call = node.expression?.type === 'CallExpression' ? node.expression : null;
            if (!call || call.arguments.length === 0) return;
            const values = routeValues(file, call.arguments[0]);

            for (const value of values) {
                if (!isKebabRoute(value)) {
                    findings.push(violation('BE-ROUTE-C-001', file, call.arguments[0], {
                        issue: name === 'Controller' ? 'controller-path' : 'method-path',
                        decorator: name,
                        path: value,
                        message: `Route path ${value} must use kebab-case segments.`,
                    }));
                }
            }
        });
    }

    return findings;
}

function analyzeTestabilityAndSize(project) {
    const findings = [];

    for (const file of project.files) {
        if (/\.service\.[cm]?[jt]s$/.test(file.relative)) {
            walkAst(file.ast, (node) => {
                if (node.type === 'NewExpression') {
                    const binding = importedSymbol(file, node.callee);
                    const name = expressionName(node.callee)?.split('.').pop() ?? '';
                    const edge = binding ? file.imports.find((item) => item.source === binding.source) : null;
                    const target = edge?.resolved ? project.byPath.get(edge.resolved) : null;
                    const repository = binding?.imported === 'Repository'
                        || /Repository$/.test(binding?.imported ?? name)
                        || layerOf(target?.relative ?? '') === 'repository';

                    if (repository) {
                        findings.push(violation('BE-TEST-C-001', file, node, {
                            constructed_symbol: name,
                            import_source: binding?.source ?? null,
                            message: 'Services must obtain repositories through dependency injection.',
                        }));
                    }
                }

                if (
                    node.type === 'CallExpression'
                    && expressionName(node.callee) === 'Reflect.construct'
                    && /Repository$/.test(expressionType(file, node.arguments?.[0]) ?? '')
                ) {
                    findings.push(violation('BE-TEST-C-001', file, node, {
                        constructed_symbol: expressionType(file, node.arguments?.[0]),
                        import_source: null,
                        message: 'Services must obtain repositories through dependency injection.',
                    }));
                }
            });
        }

        if (/\.(?:controller|service|repository)\.[cm]?[jt]s$/.test(file.relative)) {
            walkAst(file.ast, (node) => {
                if (node.type !== 'MethodDefinition' || node.kind === 'constructor') return;
                const count = node.value?.params?.length ?? 0;
                if (count <= 3) return;
                findings.push(violation('BE-SIZE-C-001', file, node.key ?? node, {
                    method: node.key?.name ?? '<computed>',
                    parameter_count: count,
                    maximum: 3,
                    message: 'Production methods may have at most three direct parameters.',
                }));
            });
        }
    }

    return findings;
}

function normalizeResource(value, aliases = {}) {
    let normalized = String(value ?? '')
        .replace(/^\/+|\/+$/g, '')
        .split('/')
        .filter((segment) => !/^v\d+$/i.test(segment))
        .pop() ?? '';
    normalized = normalized
        .replace(/\.(?:module|controller|entity)$/i, '')
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .replace(/_/g, '-')
        .toLowerCase();
    if (normalized.endsWith('ies')) normalized = `${normalized.slice(0, -3)}y`;
    else if (normalized.endsWith('s') && !normalized.endsWith('ss')) normalized = normalized.slice(0, -1);
    return aliases[normalized] ?? normalized;
}

function firstDecoratorValue(file, classNode, name) {
    const decorator = (classNode.decorators ?? []).find((item) => decoratorName(item) === name);
    const call = decorator?.expression?.type === 'CallExpression' ? decorator.expression : null;
    return call ? evaluateStatic(file, call.arguments?.[0]) : undefined;
}

function analyzeResourceOwners(project, config) {
    const findings = [];
    const groups = new Map();
    const aliases = config.resource_aliases ?? {};

    function add(kind, key, version, file, node, owner) {
        const groupKey = `${kind}:${normalizeResource(key, aliases)}:${version ?? ''}`;
        if (!groups.has(groupKey)) groups.set(groupKey, []);
        groups.get(groupKey).push({ kind, key: normalizeResource(key, aliases), version, file, node, owner });
    }

    for (const file of project.files) {
        const parts = moduleParts(file.relative);
        if (!parts) continue;

        if (/\.module\.ts$/.test(file.relative)) {
            add('module', path.basename(file.relative, '.module.ts'), null, file, findModuleDecorator(file) ?? file.ast, parts.owner);
        }

        if (/\.controller\.ts$/.test(file.relative)) {
            for (const classNode of file.classes) {
                const route = firstDecoratorValue(file, classNode, 'Controller');
                if (typeof route !== 'string') continue;
                const version = route.split('/').find((segment) => /^v\d+$/i.test(segment)) ?? null;
                add('controller-route', route, version, file, classNode, parts.owner);
            }
        }

        if (/\.entity\.ts$/.test(file.relative)) {
            for (const classNode of file.classes) {
                const table = firstDecoratorValue(file, classNode, 'Entity') ?? classNode.id?.name;
                if (table) add('entity-table', table, null, file, classNode, parts.owner);
            }
        }
    }

    for (const owners of groups.values()) {
        const first = owners[0];

        for (const duplicate of owners.slice(1)) {
            if (duplicate.file.relative === first.file.relative) continue;
            findings.push(violation('BE-DUP-C-001', duplicate.file, duplicate.node, {
                resource_key: duplicate.key,
                artifact_kind: duplicate.kind,
                first_owner: first.owner,
                duplicate_owner: duplicate.owner,
                first_file: first.file.relative,
                message: `Business resource ${duplicate.key} has competing ${duplicate.kind} owners.`,
            }));
        }
    }

    return findings;
}

function canonicalAst(node, parameterNames = new Map()) {
    // Exact normalized fingerprints avoid the false positives of fuzzy similarity.
    if (!node || typeof node !== 'object') return node;
    if (Array.isArray(node)) return node.map((item) => canonicalAst(item, parameterNames));

    if (node.type === 'Identifier' && parameterNames.has(node.name)) {
        return { type: 'Identifier', name: parameterNames.get(node.name) };
    }

    const result = {};
    for (const [key, value] of Object.entries(node)) {
        if (['loc', 'range', 'parent', 'tokens', 'comments', 'decorators', 'typeAnnotation', 'returnType'].includes(key)) continue;
        result[key] = canonicalAst(value, parameterNames);
    }
    return result;
}

function functionFingerprint(node) {
    const params = node.params ?? node.value?.params ?? [];
    const parameterNames = new Map();
    params.forEach((param, index) => {
        const subject = param.type === 'TSParameterProperty' ? param.parameter : param;
        if (subject?.type === 'Identifier') parameterNames.set(subject.name, `p${index}`);
    });
    const body = node.body ?? node.value?.body;
    return JSON.stringify(canonicalAst(body, parameterNames));
}

function analyzePolicyAndCodeDuplication(project) {
    const findings = [];
    const policies = new Map();
    const functions = new Map();

    function register(map, key, entry, ruleId, payload) {
        if (!map.has(key)) {
            map.set(key, entry);
            return;
        }

        const first = map.get(key);
        if (first.file.relative === entry.file.relative) return;
        findings.push(violation(ruleId, entry.file, entry.node, {
            ...payload,
            first_file: first.file.relative,
        }));
    }

    for (const file of project.files) {
        walkAst(file.ast, (node) => {
            if (node.type === 'VariableDeclarator' && node.id?.type === 'Identifier' && POLICY_NAME_RE.test(node.id.name)) {
                if (!['ArrayExpression', 'ObjectExpression', 'NewExpression'].includes(node.init?.type)) return;
                const fingerprint = JSON.stringify(canonicalAst(node.init));
                const key = `constant:${node.id.name.toLowerCase()}:${fingerprint}`;
                register(policies, key, { file, node }, 'BE-DUP-C-002', {
                    policy_key: node.id.name,
                    implementation_kind: 'policy-constant',
                    message: `Policy ${node.id.name} has more than one authoritative implementation.`,
                });
            }

            const functionLike = ['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(node.type)
                || (node.type === 'MethodDefinition' && node.kind !== 'constructor');
            if (!functionLike) return;

            const name = node.id?.name ?? node.key?.name ?? null;
            const body = node.body ?? node.value?.body;
            const statements = body?.body ?? [];
            if (!body || statements.length === 0) return;
            const fingerprint = functionFingerprint(node);

            if (name && POLICY_NAME_RE.test(name)) {
                register(policies, `function:${name.toLowerCase()}:${fingerprint}`, { file, node }, 'BE-DUP-C-002', {
                    policy_key: name,
                    implementation_kind: 'policy-function',
                    message: `Policy ${name} has more than one authoritative implementation.`,
                });
                return;
            }

            if (sourceText(file, body).replace(/\s+/g, '').length < 24) return;
            register(functions, fingerprint, { file, node }, 'BE-DUP-C-003', {
                implementation_kind: 'function',
                function_name: name,
                message: 'Equivalent production functions must reuse one shared implementation.',
            });
        });
    }

    return findings;
}

export function analyzeBackendRules(project, config = {}) {
    return [
        ...analyzeStructure(project),
        ...analyzeDependencies(project),
        ...analyzeDomainBoundaries(project),
        ...analyzeErrors(project, config),
        ...analyzeDtoContracts(project),
        ...analyzeValidationPipe(project),
        ...analyzeRoutes(project),
        ...analyzeTestabilityAndSize(project),
        ...analyzeResourceOwners(project, config),
        ...analyzePolicyAndCodeDuplication(project),
    ];
}
