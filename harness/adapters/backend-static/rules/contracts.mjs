// BE-CONTRACT-C-002/003/004: request DTO fields must use class-validator, optional fields
// must validate their supplied values, and the global ValidationPipe must whitelist input.
import { decoratorName, evaluateStatic, expressionName, getProperty, walkAst } from '../project.mjs';
import { importedSymbol, violation } from './shared.mjs';

const REQUEST_PARAMETER_DECORATORS = new Set(['Body', 'Query', 'Param', 'Headers']);
const NON_VALUE_VALIDATORS = new Set(['IsOptional', 'ValidateIf', 'Allow']);

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

export function analyzeDtoContracts(project) {
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

export function analyzeValidationPipe(project) {
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
