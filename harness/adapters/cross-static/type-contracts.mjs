import fs from 'node:fs';
import path from 'node:path';
import parser from '@typescript-eslint/parser';
import { isProductionSourcePath } from '../_shared/production-files.mjs';

function normalizePath(value) {
    return value.split(path.sep).join('/');
}

function listFiles(rootDir, predicate, files = []) {
    if (!fs.existsSync(rootDir)) {
        return files;
    }

    for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
        const entryPath = path.join(rootDir, entry.name);

        if (entry.isDirectory()) {
            if (!isProductionSourcePath(entryPath)) {
                continue;
            }
            listFiles(entryPath, predicate, files);
            continue;
        }

        if (isProductionSourcePath(entryPath) && predicate(entryPath)) {
            files.push(entryPath);
        }
    }

    return files;
}

function parseFile(filePath) {
    const code = fs.readFileSync(filePath, 'utf8');
    const ast = parser.parse(code, {
        sourceType: 'module',
        ecmaVersion: 2021,
        loc: true,
        range: true,
        ecmaFeatures: {
            jsx: true,
        },
    });

    return { code, ast };
}

function walkAst(node, visitor, parent = null) {
    if (!node || typeof node !== 'object') {
        return;
    }

    visitor(node, parent);

    for (const [key, value] of Object.entries(node)) {
        if (key === 'parent' || key === 'tokens' || key === 'comments') {
            continue;
        }

        if (Array.isArray(value)) {
            for (const item of value) {
                walkAst(item, visitor, node);
            }
            continue;
        }

        if (value && typeof value === 'object') {
            walkAst(value, visitor, node);
        }
    }
}

function unwrapTsExpression(node) {
    let current = node;

    while (
        current?.type === 'TSAsExpression'
        || current?.type === 'TSSatisfiesExpression'
        || current?.type === 'TSNonNullExpression'
    ) {
        current = current.expression;
    }

    return current;
}

function getPropertyName(node) {
    if (!node) {
        return null;
    }

    if (node.type === 'Identifier') {
        return node.name;
    }

    if (node.type === 'Literal' && typeof node.value === 'string') {
        return node.value;
    }

    return null;
}

function getStaticString(node) {
    const current = unwrapTsExpression(node);

    if (!current) {
        return null;
    }

    if (current.type === 'Literal' && typeof current.value === 'string') {
        return current.value;
    }

    if (current.type === 'TemplateLiteral' && current.expressions.length === 0) {
        return current.quasis.map((item) => item.value.cooked ?? '').join('');
    }

    if (current.type === 'TemplateLiteral') {
        let built = '';

        for (let index = 0; index < current.quasis.length; index += 1) {
            built += current.quasis[index].value.cooked ?? '';

            if (index < current.expressions.length) {
                built += ':param';
            }
        }

        return built;
    }

    return null;
}

function getStaticPrimitive(node) {
    const current = unwrapTsExpression(node);

    if (!current) {
        return null;
    }

    if (current.type === 'Literal' && ['string', 'number', 'boolean'].includes(typeof current.value)) {
        return current.value;
    }

    if (current.type === 'Literal' && current.value === null) {
        return null;
    }

    if (current.type === 'TemplateLiteral' && current.expressions.length === 0) {
        return current.quasis.map((item) => item.value.cooked ?? '').join('');
    }

    return undefined;
}

function getDecoratorName(decorator) {
    const expression = decorator.expression;

    if (expression?.type === 'Identifier') {
        return expression.name;
    }

    if (expression?.type === 'CallExpression' && expression.callee?.type === 'Identifier') {
        return expression.callee.name;
    }

    return null;
}

function getDecoratorArguments(decorator) {
    const expression = decorator.expression;

    if (expression?.type === 'CallExpression') {
        return expression.arguments ?? [];
    }

    return [];
}

function getTypeReferenceName(typeAnnotation) {
    const annotation = unwrapTsExpression(typeAnnotation?.typeAnnotation ?? typeAnnotation);

    if (!annotation) {
        return null;
    }

    if (annotation.type === 'TSTypeReference') {
        if (annotation.typeName?.type === 'Identifier') {
            return annotation.typeName.name;
        }

        if (annotation.typeName?.type === 'TSQualifiedName' && annotation.typeName.right?.type === 'Identifier') {
            return annotation.typeName.right.name;
        }
    }

    return null;
}

function extractReturnedExpression(fnNode) {
    if (!fnNode) {
        return null;
    }

    if (fnNode.body?.type && fnNode.body.type !== 'BlockStatement') {
        return fnNode.body;
    }

    for (const statement of fnNode.body?.body ?? []) {
        if (statement.type === 'ReturnStatement') {
            return statement.argument ?? null;
        }
    }

    return null;
}

function normalizePublicPath(prefix, controllerPath = '', routePath = '') {
    const joined = normalizePath(path.posix.join('/', prefix || '', controllerPath || '', routePath || ''));
    return joined.replace(/\/+/g, '/').replace(/\/:([^/]+)/g, '/:param').replace(/\/$/, '') || '/';
}

function countPathParams(routePath = '') {
    return (routePath.match(/\/:param/g) ?? []).length;
}

function cloneLiteralValues(literalValues = new Map()) {
    return new Map([...literalValues.entries()].map(([key, values]) => [key, new Set(values)]));
}

function makeObjectEvidence({ complete = true, source = 'unknown' } = {}) {
    return {
        kind: 'object',
        keys: new Set(),
        literalValues: new Map(),
        complete,
        source,
    };
}

function cloneObjectEvidence(evidence) {
    if (!evidence || evidence.kind !== 'object') {
        return null;
    }

    return {
        kind: 'object',
        keys: new Set(evidence.keys),
        literalValues: cloneLiteralValues(evidence.literalValues),
        complete: evidence.complete,
        source: evidence.source,
    };
}

function mergeObjectEvidence(left, right) {
    if (!left && !right) {
        return null;
    }

    if (!left) {
        return cloneObjectEvidence(right);
    }

    if (!right) {
        return cloneObjectEvidence(left);
    }

    const merged = makeObjectEvidence({
        complete: left.complete && right.complete,
        source: left.source,
    });

    for (const key of left.keys) {
        merged.keys.add(key);
    }

    for (const key of right.keys) {
        merged.keys.add(key);
    }

    for (const [key, values] of left.literalValues.entries()) {
        merged.literalValues.set(key, new Set(values));
    }

    for (const [key, values] of right.literalValues.entries()) {
        const existing = merged.literalValues.get(key) ?? new Set();

        for (const value of values) {
            existing.add(value);
        }

        merged.literalValues.set(key, existing);
    }

    return merged;
}

function makeScalarEvidence(values = []) {
    return {
        kind: 'scalar',
        literalValues: new Set(values.filter((value) => value !== undefined)),
    };
}

function cloneScalarEvidence(evidence) {
    if (!evidence || evidence.kind !== 'scalar') {
        return null;
    }

    return {
        kind: 'scalar',
        literalValues: new Set(evidence.literalValues),
    };
}

function mergeScalarEvidence(left, right) {
    if (!left && !right) {
        return null;
    }

    if (!left) {
        return cloneScalarEvidence(right);
    }

    if (!right) {
        return cloneScalarEvidence(left);
    }

    return {
        kind: 'scalar',
        literalValues: new Set([...left.literalValues, ...right.literalValues]),
    };
}

function addLiteralValue(objectEvidence, key, value) {
    if (value === undefined) {
        return;
    }

    const existing = objectEvidence.literalValues.get(key) ?? new Set();
    existing.add(value);
    objectEvidence.literalValues.set(key, existing);
}

function buildResolverFromExpression(node, bindings = new Map()) {
    const current = unwrapTsExpression(node);

    if (!current) {
        return null;
    }

    if (current.type === 'Identifier' && bindings.has(current.name)) {
        return bindings.get(current.name);
    }

    if (current.type === 'Literal' || current.type === 'TemplateLiteral') {
        const primitive = getStaticPrimitive(current);

        if (primitive !== undefined) {
            return {
                type: 'literal',
                value: primitive,
            };
        }
    }

    if (current.type === 'CallExpression' && current.callee?.type === 'MemberExpression') {
        const objectName = current.callee.object?.type === 'Identifier' ? current.callee.object.name : null;
        const propertyName = getPropertyName(current.callee.property);

        if (objectName === 'JSON' && propertyName === 'stringify') {
            return buildResolverFromExpression(current.arguments[0], bindings);
        }
    }

    if (current.type === 'ObjectExpression') {
        return {
            type: 'object',
            properties: current.properties.map((property) => {
                if (property.type === 'SpreadElement') {
                    return {
                        kind: 'spread',
                        resolver: buildResolverFromExpression(property.argument, bindings),
                    };
                }

                if (property.type === 'Property' && !property.computed) {
                    return {
                        kind: 'property',
                        key: getPropertyName(property.key),
                        resolver: buildResolverFromExpression(property.value, bindings),
                    };
                }

                return null;
            }).filter(Boolean),
        };
    }

    if (current.type === 'ConditionalExpression') {
        return {
            type: 'union',
            branches: [
                buildResolverFromExpression(current.consequent, bindings),
                buildResolverFromExpression(current.alternate, bindings),
            ].filter(Boolean),
        };
    }

    return null;
}

function evaluateResolver(resolver, argValues = []) {
    if (!resolver) {
        return null;
    }

    if (resolver.type === 'literal') {
        return makeScalarEvidence([resolver.value]);
    }

    if (resolver.type === 'arg') {
        const argValue = argValues[resolver.index];

        if (!argValue) {
            return null;
        }

        return argValue.kind === 'object' ? cloneObjectEvidence(argValue) : cloneScalarEvidence(argValue);
    }

    if (resolver.type === 'argField') {
        const argValue = argValues[resolver.index];

        if (!argValue || argValue.kind !== 'object') {
            return null;
        }

        const values = argValue.literalValues.get(resolver.field);
        return values ? makeScalarEvidence([...values]) : null;
    }

    if (resolver.type === 'argRest') {
        const argValue = argValues[resolver.index];

        if (!argValue || argValue.kind !== 'object') {
            return null;
        }

        const clone = cloneObjectEvidence(argValue);

        for (const omittedKey of resolver.omit) {
            clone.keys.delete(omittedKey);
            clone.literalValues.delete(omittedKey);
        }

        return clone;
    }

    if (resolver.type === 'union') {
        let merged = null;

        for (const branch of resolver.branches ?? []) {
            const evaluated = evaluateResolver(branch, argValues);

            if (!evaluated) {
                continue;
            }

            if (evaluated.kind === 'object') {
                merged = mergeObjectEvidence(merged, evaluated);
            } else {
                merged = mergeScalarEvidence(merged, evaluated);
            }
        }

        return merged;
    }

    if (resolver.type === 'object') {
        const evidence = makeObjectEvidence();

        for (const item of resolver.properties ?? []) {
            if (item.kind === 'property' && item.key) {
                evidence.keys.add(item.key);
                const propertyValue = evaluateResolver(item.resolver, argValues);

                if (propertyValue?.kind === 'scalar') {
                    for (const value of propertyValue.literalValues) {
                        addLiteralValue(evidence, item.key, value);
                    }
                }
                continue;
            }

            if (item.kind === 'spread') {
                const spreadValue = evaluateResolver(item.resolver, argValues);

                if (spreadValue?.kind === 'object') {
                    const merged = mergeObjectEvidence(evidence, spreadValue);
                    evidence.keys = merged.keys;
                    evidence.literalValues = merged.literalValues;
                    evidence.complete = evidence.complete && spreadValue.complete;
                } else {
                    evidence.complete = false;
                }
            }
        }

        return evidence;
    }

    return null;
}

function createBindingMapFromParams(params = []) {
    const bindings = new Map();

    params.forEach((param, index) => {
        const current = unwrapTsExpression(param);

        if (current?.type === 'Identifier') {
            bindings.set(current.name, { type: 'arg', index });
            return;
        }

        if (current?.type === 'AssignmentPattern' && current.left?.type === 'Identifier') {
            bindings.set(current.left.name, { type: 'arg', index });
            return;
        }

        if (current?.type === 'ObjectPattern') {
            const omitted = [];

            for (const property of current.properties ?? []) {
                if (property.type === 'Property') {
                    const sourceKey = getPropertyName(property.key);
                    const localName = property.value?.type === 'Identifier'
                        ? property.value.name
                        : property.value?.type === 'AssignmentPattern' && property.value.left?.type === 'Identifier'
                            ? property.value.left.name
                            : null;

                    if (sourceKey && localName) {
                        bindings.set(localName, { type: 'argField', index, field: sourceKey });
                        omitted.push(sourceKey);
                    }
                }

                if (property.type === 'RestElement' && property.argument?.type === 'Identifier') {
                    bindings.set(property.argument.name, { type: 'argRest', index, omit: omitted });
                }
            }
        }
    });

    return bindings;
}

function collectHookBindingsFromVariableDeclarations(functionNode, baseBindings) {
    const bindings = new Map(baseBindings);

    for (const statement of functionNode.body?.body ?? []) {
        if (statement.type !== 'VariableDeclaration') {
            continue;
        }

        for (const declaration of statement.declarations ?? []) {
            if (!declaration.init?.type || declaration.id?.type !== 'ObjectPattern' || declaration.init.type !== 'Identifier') {
                continue;
            }

            const initBinding = bindings.get(declaration.init.name);

            if (!initBinding || initBinding.type !== 'arg') {
                continue;
            }

            const omitted = [];

            for (const property of declaration.id.properties ?? []) {
                if (property.type === 'Property') {
                    const sourceKey = getPropertyName(property.key);
                    const localName = property.value?.type === 'Identifier'
                        ? property.value.name
                        : property.value?.type === 'AssignmentPattern' && property.value.left?.type === 'Identifier'
                            ? property.value.left.name
                            : null;

                    if (sourceKey && localName) {
                        bindings.set(localName, { type: 'argField', index: initBinding.index, field: sourceKey });
                        omitted.push(sourceKey);
                    }
                }

                if (property.type === 'RestElement' && property.argument?.type === 'Identifier') {
                    bindings.set(property.argument.name, { type: 'argRest', index: initBinding.index, omit: omitted });
                }
            }
        }
    }

    return bindings;
}

function resolveApiMethodMember(callNode) {
    if (callNode?.callee?.type !== 'MemberExpression') {
        return null;
    }

    if (callNode.callee.object?.type !== 'Identifier') {
        return null;
    }

    const objectName = callNode.callee.object.name;
    const propertyName = getPropertyName(callNode.callee.property);

    if (!propertyName) {
        return null;
    }

    return `${objectName}.${propertyName}`;
}

function collectFrontendApiOperations(workspaceRoot, config) {
    const apiRoots = Array.isArray(config.frontend_api_roots)
        ? config.frontend_api_roots
        : ['frontend/src/api'];
    const operations = new Map();

    for (const root of apiRoots) {
        const absoluteRoot = path.resolve(workspaceRoot, root);
        const files = listFiles(absoluteRoot, (filePath) => /\.(js|jsx|ts|tsx)$/.test(filePath));

        for (const filePath of files) {
            const relativeFile = normalizePath(path.relative(workspaceRoot, filePath));
            const { ast } = parseFile(filePath);

            for (const statement of ast.body ?? []) {
                if (statement.type !== 'ExportNamedDeclaration') {
                    continue;
                }

                if (statement.declaration?.type !== 'VariableDeclaration') {
                    continue;
                }

                for (const declaration of statement.declaration.declarations ?? []) {
                    if (declaration.id?.type !== 'Identifier' || declaration.init?.type !== 'ObjectExpression') {
                        continue;
                    }

                    const apiObjectName = declaration.id.name;

                    for (const property of declaration.init.properties ?? []) {
                        if (property.type !== 'Property' || property.computed) {
                            continue;
                        }

                        const methodName = getPropertyName(property.key);
                        const functionNode = property.value;

                        if (!methodName || !functionNode?.type || !['ArrowFunctionExpression', 'FunctionExpression'].includes(functionNode.type)) {
                            continue;
                        }

                        const paramBindings = createBindingMapFromParams(functionNode.params);
                        const returned = extractReturnedExpression(functionNode);

                        if (returned?.type !== 'CallExpression' || returned.callee?.type !== 'Identifier' || returned.callee.name !== 'request') {
                            continue;
                        }

                        const apiPath = getStaticString(returned.arguments[0]);

                        if (!apiPath) {
                            continue;
                        }

                        let httpMethod = 'GET';
                        let queryResolver = null;
                        let bodyResolver = null;

                        const options = unwrapTsExpression(returned.arguments[1]);

                        if (options?.type === 'ObjectExpression') {
                            for (const optionProperty of options.properties ?? []) {
                                if (optionProperty.type !== 'Property' || optionProperty.computed) {
                                    continue;
                                }

                                const optionKey = getPropertyName(optionProperty.key);

                                if (optionKey === 'method') {
                                    httpMethod = (getStaticString(optionProperty.value) ?? httpMethod).toUpperCase();
                                }

                                if (optionKey === 'query') {
                                    queryResolver = buildResolverFromExpression(optionProperty.value, paramBindings);
                                }

                                if (optionKey === 'body') {
                                    bodyResolver = buildResolverFromExpression(optionProperty.value, paramBindings);
                                }
                            }
                        }

                        operations.set(`${apiObjectName}.${methodName}`, {
                            operationKey: `${apiObjectName}.${methodName}`,
                            file: relativeFile,
                            method: httpMethod,
                            path: normalizePublicPath('api', apiPath, ''),
                            pathParamCount: countPathParams(normalizePublicPath('api', apiPath, '')),
                            queryResolver,
                            bodyResolver,
                        });
                    }
                }
            }
        }
    }

    return operations;
}

function collectFrontendHookMappings(workspaceRoot, config) {
    const hookRoots = Array.isArray(config.frontend_hook_roots)
        ? config.frontend_hook_roots
        : ['frontend/src/pages'];
    const queryHooks = new Map();
    const mutationHooks = new Map();

    for (const root of hookRoots) {
        const absoluteRoot = path.resolve(workspaceRoot, root);
        const files = listFiles(absoluteRoot, (filePath) => /Queries\.(js|jsx|ts|tsx)$/.test(filePath));

        for (const filePath of files) {
            const { ast } = parseFile(filePath);

            for (const statement of ast.body ?? []) {
                if (statement.type !== 'ExportNamedDeclaration') {
                    continue;
                }

                const functionNode = statement.declaration;

                if (!functionNode?.type || functionNode.type !== 'FunctionDeclaration' || !functionNode.id?.name) {
                    continue;
                }

                const hookName = functionNode.id.name;
                const hookParamBindings = collectHookBindingsFromVariableDeclarations(
                    functionNode,
                    createBindingMapFromParams(functionNode.params),
                );

                walkAst(functionNode.body, (node) => {
                    if (node.type !== 'CallExpression' || node.callee?.type !== 'Identifier') {
                        return;
                    }

                    if (node.callee.name === 'useQuery') {
                        const firstArg = unwrapTsExpression(node.arguments[0]);

                        if (firstArg?.type !== 'ObjectExpression') {
                            return;
                        }

                        const queryFnProperty = firstArg.properties.find((property) =>
                            property?.type === 'Property'
                            && !property.computed
                            && getPropertyName(property.key) === 'queryFn');

                        if (!queryFnProperty?.value) {
                            return;
                        }

                        const queryFnExpression = extractReturnedExpression(queryFnProperty.value);
                        const apiOperationKey = resolveApiMethodMember(queryFnExpression);

                        if (!apiOperationKey || queryHooks.has(hookName)) {
                            return;
                        }

                        queryHooks.set(hookName, {
                            hookName,
                            operationKey: apiOperationKey,
                            argResolvers: (queryFnExpression.arguments ?? []).map((arg) =>
                                buildResolverFromExpression(arg, hookParamBindings),
                            ),
                        });
                    }

                    if (node.callee.name === 'useMutation') {
                        const firstArg = unwrapTsExpression(node.arguments[0]);

                        if (firstArg?.type !== 'ObjectExpression') {
                            return;
                        }

                        const mutationFnProperty = firstArg.properties.find((property) =>
                            property?.type === 'Property'
                            && !property.computed
                            && getPropertyName(property.key) === 'mutationFn');

                        if (!mutationFnProperty?.value) {
                            return;
                        }

                        const mutationFnExpression = extractReturnedExpression(mutationFnProperty.value);
                        const apiOperationKey = resolveApiMethodMember(mutationFnExpression);

                        if (!apiOperationKey || mutationHooks.has(hookName)) {
                            return;
                        }

                        const mutationBindings = createBindingMapFromParams(mutationFnProperty.value.params ?? []);

                        mutationHooks.set(hookName, {
                            hookName,
                            operationKey: apiOperationKey,
                            argResolvers: (mutationFnExpression.arguments ?? []).map((arg) =>
                                buildResolverFromExpression(arg, mutationBindings),
                            ),
                        });
                    }
                });
            }
        }
    }

    return { queryHooks, mutationHooks };
}

function getClassPropertyNodes(classNode) {
    return classNode.body?.body?.filter((node) =>
        node.type === 'PropertyDefinition' || node.type === 'ClassProperty'
    ) ?? [];
}

function resolveValidatorType(decorators = []) {
    const names = new Set((decorators ?? []).map((decorator) => getDecoratorName(decorator)));

    if (names.has('IsArray')) {
        return 'array';
    }

    if (names.has('IsBoolean')) {
        return 'boolean';
    }

    if (names.has('IsNumber') || names.has('IsInt')) {
        return 'number';
    }

    if (names.has('IsUUID') || names.has('IsString') || names.has('IsEmail') || names.has('IsUrl')) {
        return 'string';
    }

    if (names.has('IsDateString')) {
        return 'string';
    }

    return null;
}

function collectBackendEnumRegistry(workspaceRoot, config) {
    const roots = Array.isArray(config.backend_type_scan_roots)
        ? config.backend_type_scan_roots
        : ['backend/src'];
    const registry = new Map();

    for (const root of roots) {
        const absoluteRoot = path.resolve(workspaceRoot, root);
        const files = listFiles(absoluteRoot, (filePath) => /\.ts$/.test(filePath) && !/\.spec\./.test(filePath));

        for (const filePath of files) {
            const { ast } = parseFile(filePath);

            for (const statement of ast.body ?? []) {
                if (statement.type === 'ExportNamedDeclaration' && statement.declaration?.type === 'TSEnumDeclaration') {
                    const enumName = statement.declaration.id?.name;
                    const values = statement.declaration.members
                        .map((member) => getStaticPrimitive(member.initializer))
                        .filter((value) => value !== undefined);

                    if (enumName && values.length > 0) {
                        registry.set(enumName, new Set(values));
                    }
                }
            }
        }
    }

    return registry;
}

function collectBackendDtoRegistry(workspaceRoot, config, enumRegistry) {
    const dtoRoots = Array.isArray(config.backend_dto_roots)
        ? config.backend_dto_roots
        : ['backend/src/modules'];
    const registry = new Map();

    for (const root of dtoRoots) {
        const absoluteRoot = path.resolve(workspaceRoot, root);
        const files = listFiles(absoluteRoot, (filePath) => /\/dto\/.+\.ts$/.test(normalizePath(filePath)));

        for (const filePath of files) {
            const normalizedFile = normalizePath(path.relative(workspaceRoot, filePath));
            const { ast } = parseFile(filePath);

            for (const statement of ast.body ?? []) {
                const classNode = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;

                if (!classNode || classNode.type !== 'ClassDeclaration' || !classNode.id?.name) {
                    continue;
                }

                const dtoName = classNode.id.name;
                let partialBase = null;

                for (const heritage of classNode.superClass ? [classNode.superClass] : []) {
                    const current = unwrapTsExpression(heritage);

                    if (current?.type === 'CallExpression' && current.callee?.type === 'Identifier' && current.callee.name === 'PartialType') {
                        partialBase = current.arguments?.[0]?.type === 'Identifier' ? current.arguments[0].name : null;
                    }
                }

                const fields = new Map();

                for (const propertyNode of getClassPropertyNodes(classNode)) {
                    const fieldName = getPropertyName(propertyNode.key);

                    if (!fieldName) {
                        continue;
                    }

                    const decorators = propertyNode.decorators ?? [];
                    const decoratorNames = new Set(decorators.map((decorator) => getDecoratorName(decorator)));
                    let enumValues = null;

                    for (const decorator of decorators) {
                        if (getDecoratorName(decorator) !== 'IsEnum') {
                            continue;
                        }

                        const [enumArg] = getDecoratorArguments(decorator);
                        const enumName = enumArg?.type === 'Identifier' ? enumArg.name : null;

                        if (enumName && enumRegistry.has(enumName)) {
                            enumValues = [...enumRegistry.get(enumName)];
                        }
                    }

                    fields.set(fieldName, {
                        name: fieldName,
                        required: !(propertyNode.optional || decoratorNames.has('IsOptional')),
                        typeHint: resolveValidatorType(decorators),
                        enumValues,
                    });
                }

                registry.set(dtoName, {
                    dtoName,
                    file: normalizedFile,
                    partialBase,
                    fields,
                });
            }
        }
    }

    for (const dto of registry.values()) {
        if (!dto.partialBase || !registry.has(dto.partialBase)) {
            continue;
        }

        const base = registry.get(dto.partialBase);

        for (const [fieldName, field] of base.fields.entries()) {
            if (!dto.fields.has(fieldName)) {
                dto.fields.set(fieldName, {
                    ...field,
                    required: false,
                });
            }
        }

        for (const field of dto.fields.values()) {
            field.required = false;
        }
    }

    return registry;
}

function collectBackendTypeContracts(workspaceRoot, config, dtoRegistry) {
    const controllerRoots = Array.isArray(config.backend_controller_roots)
        ? config.backend_controller_roots
        : ['backend/src/modules'];
    const prefix = config.required_prefix ?? 'api';
    const methodDecorators = new Map([
        ['Get', 'GET'],
        ['Post', 'POST'],
        ['Put', 'PUT'],
        ['Patch', 'PATCH'],
        ['Delete', 'DELETE'],
    ]);
    const contracts = new Map();

    for (const root of controllerRoots) {
        const absoluteRoot = path.resolve(workspaceRoot, root);
        const files = listFiles(absoluteRoot, (filePath) => /\.controller\.ts$/.test(filePath));

        for (const filePath of files) {
            const { ast } = parseFile(filePath);
            let controllerPath = '';

            for (const statement of ast.body ?? []) {
                const classNode = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;

                if (!classNode || classNode.type !== 'ClassDeclaration') {
                    continue;
                }

                for (const decorator of classNode.decorators ?? []) {
                    if (getDecoratorName(decorator) === 'Controller') {
                        controllerPath = getStaticString(getDecoratorArguments(decorator)[0]) ?? '';
                    }
                }

                for (const member of classNode.body.body ?? []) {
                    if (member.type !== 'MethodDefinition') {
                        continue;
                    }

                    for (const decorator of member.decorators ?? []) {
                        const decoratorName = getDecoratorName(decorator);
                        const method = methodDecorators.get(decoratorName);

                        if (!method) {
                            continue;
                        }

                        const routePath = getStaticString(getDecoratorArguments(decorator)[0]) ?? '';
                        const fullPath = normalizePublicPath(prefix, controllerPath, routePath);
                        const contract = {
                            method,
                            path: fullPath,
                            pathParamCount: countPathParams(fullPath),
                            queryFields: new Map(),
                            bodyFields: new Map(),
                        };

                        for (const parameter of member.value?.params ?? []) {
                            for (const parameterDecorator of parameter.decorators ?? []) {
                                const parameterDecoratorName = getDecoratorName(parameterDecorator);
                                const decoratorArgs = getDecoratorArguments(parameterDecorator);

                                if (parameterDecoratorName === 'Query') {
                                    const queryName = getStaticString(decoratorArgs[0]);

                                    if (queryName) {
                                        contract.queryFields.set(queryName, {
                                            name: queryName,
                                            required: false,
                                            typeHint: null,
                                            enumValues: null,
                                        });
                                        continue;
                                    }

                                    const dtoName = getTypeReferenceName(parameter.typeAnnotation);
                                    const dto = dtoName ? dtoRegistry.get(dtoName) : null;

                                    for (const [fieldName, field] of dto?.fields ?? []) {
                                        contract.queryFields.set(fieldName, field);
                                    }
                                }

                                if (parameterDecoratorName === 'Body') {
                                    const dtoName = getTypeReferenceName(parameter.typeAnnotation);
                                    const dto = dtoName ? dtoRegistry.get(dtoName) : null;

                                    for (const [fieldName, field] of dto?.fields ?? []) {
                                        contract.bodyFields.set(fieldName, field);
                                    }
                                }
                            }
                        }

                        contracts.set(`${method} ${fullPath}`, contract);
                    }
                }
            }
        }
    }

    return contracts;
}

function resolveExpressionEvidence(node, env) {
    const current = unwrapTsExpression(node);

    if (!current) {
        return null;
    }

    if (current.type === 'Identifier') {
        if (env.objectVars.has(current.name)) {
            return cloneObjectEvidence(env.objectVars.get(current.name));
        }

        if (env.scalarVars.has(current.name)) {
            return cloneScalarEvidence(env.scalarVars.get(current.name));
        }
    }

    const primitive = getStaticPrimitive(current);

    if (primitive !== undefined) {
        return makeScalarEvidence([primitive]);
    }

    if (current.type === 'ObjectExpression') {
        const evidence = makeObjectEvidence();

        for (const property of current.properties ?? []) {
            if (property.type === 'Property' && !property.computed) {
                const key = getPropertyName(property.key);

                if (!key) {
                    continue;
                }

                evidence.keys.add(key);
                const valueEvidence = resolveExpressionEvidence(property.value, env);

                if (valueEvidence?.kind === 'scalar') {
                    for (const value of valueEvidence.literalValues) {
                        addLiteralValue(evidence, key, value);
                    }
                }
                continue;
            }

            if (property.type === 'SpreadElement') {
                const spreadEvidence = resolveExpressionEvidence(property.argument, env);

                if (spreadEvidence?.kind === 'object') {
                    const merged = mergeObjectEvidence(evidence, spreadEvidence);
                    evidence.keys = merged.keys;
                    evidence.literalValues = merged.literalValues;
                    evidence.complete = evidence.complete && spreadEvidence.complete;
                } else {
                    evidence.complete = false;
                }
            }
        }

        return evidence;
    }

    if (current.type === 'ConditionalExpression') {
        const consequent = resolveExpressionEvidence(current.consequent, env);
        const alternate = resolveExpressionEvidence(current.alternate, env);

        if (consequent?.kind === 'object' || alternate?.kind === 'object') {
            return mergeObjectEvidence(
                consequent?.kind === 'object' ? consequent : null,
                alternate?.kind === 'object' ? alternate : null,
            );
        }

        return mergeScalarEvidence(
            consequent?.kind === 'scalar' ? consequent : null,
            alternate?.kind === 'scalar' ? alternate : null,
        );
    }

    return null;
}

function collectFrontendContractEvidences(workspaceRoot, config, apiOperations, hookMappings) {
    const roots = Array.isArray(config.frontend_type_scan_roots)
        ? config.frontend_type_scan_roots
        : ['frontend/src'];
    const evidences = [];

    for (const root of roots) {
        const absoluteRoot = path.resolve(workspaceRoot, root);
        const files = listFiles(
            absoluteRoot,
            (filePath) => /\.(js|jsx|ts|tsx)$/.test(filePath) && !/\/api\//.test(normalizePath(filePath)),
        );

        for (const filePath of files) {
            const relativeFile = normalizePath(path.relative(workspaceRoot, filePath));
            const { ast } = parseFile(filePath);

            walkAst(ast, (node) => {
                if (!['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(node.type)) {
                    return;
                }

                const objectVars = new Map();
                const scalarVars = new Map();
                const hookInstances = new Map();
                const stateVarBySetter = new Map();
                const env = { objectVars, scalarVars };

                walkAst(node.body, (child) => {
                    if (child.type === 'VariableDeclarator') {
                        if (
                            child.id?.type === 'ArrayPattern'
                            && child.id.elements?.length >= 2
                            && child.id.elements[0]?.type === 'Identifier'
                            && child.id.elements[1]?.type === 'Identifier'
                            && child.init?.type === 'CallExpression'
                            && child.init.callee?.type === 'Identifier'
                            && child.init.callee.name === 'useState'
                        ) {
                            const stateValue = resolveExpressionEvidence(child.init.arguments[0], env);

                            if (stateValue?.kind === 'object') {
                                objectVars.set(child.id.elements[0].name, stateValue);
                                stateVarBySetter.set(child.id.elements[1].name, child.id.elements[0].name);
                            }
                        }

                        if (child.id?.type === 'Identifier') {
                            const resolved = resolveExpressionEvidence(child.init, env);

                            if (resolved?.kind === 'object') {
                                objectVars.set(child.id.name, resolved);
                            }

                            if (resolved?.kind === 'scalar') {
                                scalarVars.set(child.id.name, resolved);
                            }

                            if (
                                child.init?.type === 'CallExpression'
                                && child.init.callee?.type === 'Identifier'
                                && hookMappings.mutationHooks.has(child.init.callee.name)
                            ) {
                                hookInstances.set(child.id.name, child.init.callee.name);
                            }
                        }
                    }
                });

                walkAst(node.body, (child) => {
                    if (child.type !== 'CallExpression') {
                        return;
                    }

                    if (child.callee?.type === 'Identifier' && stateVarBySetter.has(child.callee.name)) {
                        const stateVarName = stateVarBySetter.get(child.callee.name);
                        const previousState = objectVars.get(stateVarName) ?? makeObjectEvidence({ complete: false });
                        const arg = child.arguments[0];
                        let nextState = null;

                        if (arg?.type === 'ArrowFunctionExpression' || arg?.type === 'FunctionExpression') {
                            const updaterEnv = {
                                objectVars: new Map(objectVars),
                                scalarVars: new Map(scalarVars),
                            };
                            const firstParam = arg.params?.[0];

                            if (firstParam?.type === 'Identifier') {
                                updaterEnv.objectVars.set(firstParam.name, previousState);
                            }

                            nextState = resolveExpressionEvidence(extractReturnedExpression(arg), updaterEnv);
                        } else {
                            nextState = resolveExpressionEvidence(arg, env);
                        }

                        if (nextState?.kind === 'object') {
                            objectVars.set(stateVarName, mergeObjectEvidence(previousState, nextState));
                        }
                    }
                });

                walkAst(node.body, (child) => {
                    if (child.type !== 'CallExpression') {
                        return;
                    }

                    if (child.callee?.type === 'Identifier' && hookMappings.queryHooks.has(child.callee.name)) {
                        const hook = hookMappings.queryHooks.get(child.callee.name);
                        const operation = apiOperations.get(hook.operationKey);

                        if (!operation) {
                            return;
                        }

                        const hookArgValues = child.arguments.map((arg) => resolveExpressionEvidence(arg, env));
                        const apiArgValues = hook.argResolvers.map((resolver) => evaluateResolver(resolver, hookArgValues));

                        evidences.push({
                            sourceFile: relativeFile,
                            location: child.loc
                                ? { file: relativeFile, start: child.loc.start, end: child.loc.end }
                                : { file: relativeFile },
                            endpointKey: `${operation.method} ${operation.path}`,
                            path: operation.path,
                            method: operation.method,
                            pathParamCount: operation.pathParamCount,
                            queryEvidence: evaluateResolver(operation.queryResolver, apiArgValues),
                            bodyEvidence: evaluateResolver(operation.bodyResolver, apiArgValues),
                        });
                    }

                    if (
                        child.callee?.type === 'MemberExpression'
                        && child.callee.object?.type === 'Identifier'
                        && hookInstances.has(child.callee.object.name)
                    ) {
                        const propertyName = getPropertyName(child.callee.property);

                        if (!['mutate', 'mutateAsync'].includes(propertyName)) {
                            return;
                        }

                        const hook = hookMappings.mutationHooks.get(hookInstances.get(child.callee.object.name));
                        const operation = apiOperations.get(hook.operationKey);

                        if (!operation) {
                            return;
                        }

                        const mutationArgValues = child.arguments.map((arg) => resolveExpressionEvidence(arg, env));
                        const apiArgValues = hook.argResolvers.map((resolver) => evaluateResolver(resolver, mutationArgValues));

                        evidences.push({
                            sourceFile: relativeFile,
                            location: child.loc
                                ? { file: relativeFile, start: child.loc.start, end: child.loc.end }
                                : { file: relativeFile },
                            endpointKey: `${operation.method} ${operation.path}`,
                            path: operation.path,
                            method: operation.method,
                            pathParamCount: operation.pathParamCount,
                            queryEvidence: evaluateResolver(operation.queryResolver, apiArgValues),
                            bodyEvidence: evaluateResolver(operation.bodyResolver, apiArgValues),
                        });
                    }
                });
            });
        }
    }

    return evidences;
}

function classifyTypeMismatch(field, frontendValues = new Set()) {
    if (!field?.typeHint || frontendValues.size === 0) {
        return null;
    }

    for (const value of frontendValues) {
        if (value === null) {
            continue;
        }

        if (field.typeHint === 'string' && typeof value !== 'string') {
            return `expected string but saw ${typeof value}`;
        }

        if (field.typeHint === 'number' && typeof value !== 'number') {
            return `expected number but saw ${typeof value}`;
        }

        if (field.typeHint === 'boolean' && typeof value !== 'boolean') {
            return `expected boolean but saw ${typeof value}`;
        }

        if (field.typeHint === 'array' && !Array.isArray(value)) {
            return `expected array but saw ${typeof value}`;
        }
    }

    return null;
}

export function collectTypeRuleEvents(workspaceRoot, config) {
    const typeConfig = config.type_inventory ?? {};
    const enumRegistry = collectBackendEnumRegistry(workspaceRoot, typeConfig);
    const dtoRegistry = collectBackendDtoRegistry(workspaceRoot, typeConfig, enumRegistry);
    const backendContracts = collectBackendTypeContracts(workspaceRoot, typeConfig, dtoRegistry);
    const apiOperations = collectFrontendApiOperations(workspaceRoot, typeConfig);
    const hookMappings = collectFrontendHookMappings(workspaceRoot, typeConfig);
    const frontendEvidences = collectFrontendContractEvidences(workspaceRoot, typeConfig, apiOperations, hookMappings);
    const normalizedEvents = [];

    for (const evidence of frontendEvidences) {
        const backendContract = backendContracts.get(evidence.endpointKey);

        if (!backendContract) {
            continue;
        }

        if (evidence.pathParamCount !== backendContract.pathParamCount) {
            normalizedEvents.push({
                source_tool: 'cross-static',
                source_rule_id: 'cross-static/frontend-route-param-arity-mismatch',
                event_type: 'cross_contract_violation',
                location: evidence.location,
                payload: {
                    endpoint: evidence.endpointKey,
                    frontend_file: evidence.sourceFile,
                    reason: `route param count mismatch: frontend=${evidence.pathParamCount}, backend=${backendContract.pathParamCount}`,
                },
            });
        }

        const queryEvidence = evidence.queryEvidence?.kind === 'object' ? evidence.queryEvidence : null;

        if (queryEvidence) {
            for (const key of queryEvidence.keys) {
                if (!backendContract.queryFields.has(key)) {
                    normalizedEvents.push({
                        source_tool: 'cross-static',
                        source_rule_id: 'cross-static/frontend-query-key-mismatch',
                        event_type: 'cross_contract_violation',
                        location: evidence.location,
                        payload: {
                            endpoint: evidence.endpointKey,
                            frontend_file: evidence.sourceFile,
                            reason: `query field "${key}" is not defined by backend`,
                        },
                    });
                    continue;
                }

                const field = backendContract.queryFields.get(key);
                const frontendValues = queryEvidence.literalValues.get(key) ?? new Set();
                const typeMismatch = classifyTypeMismatch(field, frontendValues);

                if (typeMismatch) {
                    normalizedEvents.push({
                        source_tool: 'cross-static',
                        source_rule_id: 'cross-static/frontend-query-key-mismatch',
                        event_type: 'cross_contract_violation',
                        location: evidence.location,
                        payload: {
                            endpoint: evidence.endpointKey,
                            frontend_file: evidence.sourceFile,
                            reason: `query field "${key}" ${typeMismatch}`,
                        },
                    });
                }

                if (field.enumValues && frontendValues.size > 0) {
                    for (const value of frontendValues) {
                        if (!field.enumValues.includes(value)) {
                            normalizedEvents.push({
                                source_tool: 'cross-static',
                                source_rule_id: 'cross-static/frontend-query-key-mismatch',
                                event_type: 'cross_contract_violation',
                                location: evidence.location,
                                payload: {
                                    endpoint: evidence.endpointKey,
                                    frontend_file: evidence.sourceFile,
                                    reason: `query field "${key}" uses enum value "${value}" outside backend set [${field.enumValues.join(', ')}]`,
                                },
                            });
                        }
                    }
                }
            }
        }

        const bodyEvidence = evidence.bodyEvidence?.kind === 'object' ? evidence.bodyEvidence : null;

        if (bodyEvidence) {
            for (const key of bodyEvidence.keys) {
                if (!backendContract.bodyFields.has(key)) {
                    normalizedEvents.push({
                        source_tool: 'cross-static',
                        source_rule_id: 'cross-static/frontend-body-key-mismatch',
                        event_type: 'cross_contract_violation',
                        location: evidence.location,
                        payload: {
                            endpoint: evidence.endpointKey,
                            frontend_file: evidence.sourceFile,
                            reason: `body field "${key}" is not defined by backend DTO`,
                        },
                    });
                    continue;
                }

                const field = backendContract.bodyFields.get(key);
                const frontendValues = bodyEvidence.literalValues.get(key) ?? new Set();

                if (!field.required && frontendValues.has(null)) {
                    continue;
                }

                if (field.required && frontendValues.has(null)) {
                    normalizedEvents.push({
                        source_tool: 'cross-static',
                        source_rule_id: 'cross-static/frontend-body-key-mismatch',
                        event_type: 'cross_contract_violation',
                        location: evidence.location,
                        payload: {
                            endpoint: evidence.endpointKey,
                            frontend_file: evidence.sourceFile,
                            reason: `body field "${key}" is required by backend but frontend sends null`,
                        },
                    });
                }

                const typeMismatch = classifyTypeMismatch(field, frontendValues);

                if (typeMismatch) {
                    normalizedEvents.push({
                        source_tool: 'cross-static',
                        source_rule_id: 'cross-static/frontend-body-key-mismatch',
                        event_type: 'cross_contract_violation',
                        location: evidence.location,
                        payload: {
                            endpoint: evidence.endpointKey,
                            frontend_file: evidence.sourceFile,
                            reason: `body field "${key}" ${typeMismatch}`,
                        },
                    });
                }

                if (field.enumValues && frontendValues.size > 0) {
                    for (const value of frontendValues) {
                        if (value !== null && !field.enumValues.includes(value)) {
                            normalizedEvents.push({
                                source_tool: 'cross-static',
                                source_rule_id: 'cross-static/frontend-body-key-mismatch',
                                event_type: 'cross_contract_violation',
                                location: evidence.location,
                                payload: {
                                    endpoint: evidence.endpointKey,
                                    frontend_file: evidence.sourceFile,
                                    reason: `body field "${key}" uses enum value "${value}" outside backend set [${field.enumValues.join(', ')}]`,
                                },
                            });
                        }
                    }
                }
            }

            if (bodyEvidence.complete) {
                for (const [fieldName, field] of backendContract.bodyFields.entries()) {
                    if (field.required && !bodyEvidence.keys.has(fieldName)) {
                        normalizedEvents.push({
                            source_tool: 'cross-static',
                            source_rule_id: 'cross-static/frontend-body-key-mismatch',
                            event_type: 'cross_contract_violation',
                            location: evidence.location,
                            payload: {
                                endpoint: evidence.endpointKey,
                                frontend_file: evidence.sourceFile,
                                reason: `required body field "${fieldName}" is missing from frontend payload`,
                            },
                        });
                    }
                }
            }
        }
    }

    return {
        normalizedEvents,
        stats: {
            backend_type_contract_count: backendContracts.size,
            frontend_type_evidence_count: frontendEvidences.length,
            dto_registry_size: dtoRegistry.size,
            enum_registry_size: enumRegistry.size,
            frontend_query_hook_count: hookMappings.queryHooks.size,
            frontend_mutation_hook_count: hookMappings.mutationHooks.size,
        },
    };
}
