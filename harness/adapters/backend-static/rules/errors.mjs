// BE-ERR-C-001/002/003: service-layer exception handling. Services must not throw NestJS
// HTTP exceptions, must throw only the unified AppException, and must not silently swallow
// caught errors.
import { expressionName, walkAst } from '../project.mjs';
import {
    expressionType,
    importedSymbol,
    returnedExpression,
    targetFiles,
    variableInitializer,
    violation,
} from './shared.mjs';

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

function localClassMap(file) {
    return new Map(file.classes.filter((node) => node.id?.name).map((node) => [node.id.name, node]));
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

export function analyzeErrors(project, config) {
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
