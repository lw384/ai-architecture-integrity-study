import {
    collectIdentifiers,
    findNearestCatchClause,
    getCalleeString,
    getThrownClassName,
    isEffectivelyEmptyBlock,
    isServiceFile,
} from './_helpers.js';

const NEST_HTTP_EXCEPTIONS = new Set([
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

function matchesFilePattern(filename, filePattern, defaultMatcher) {
    if (!filePattern) {
        return defaultMatcher(filename);
    }

    return new RegExp(filePattern).test(filename);
}

function analyzeCatchBody(body) {
    const LOG_CALLEES_RE = /^(console\.|logger\.|this\.logger\.)/;
    let hasThrow = false;
    let hasReturn = false;
    let hasNonLogStatement = false;
    const referencedNames = new Set();

    for (const stmt of body) {
        if (stmt.type === 'ThrowStatement') {
            hasThrow = true;
        }

        if (stmt.type === 'ReturnStatement') {
            hasReturn = true;
        }

        collectIdentifiers(stmt, referencedNames);

        if (stmt.type === 'ExpressionStatement' && stmt.expression?.type === 'CallExpression') {
            const callee = getCalleeString(stmt.expression.callee);
            if (!LOG_CALLEES_RE.test(callee)) {
                hasNonLogStatement = true;
            }
        } else if (stmt.type !== 'ExpressionStatement') {
            hasNonLogStatement = true;
        }
    }

    return {
        onlyLogs: !hasThrow && !hasReturn && !hasNonLogStatement,
        referencesError: (name) => referencedNames.has(name),
    };
}

export const nestjsErrorPlugin = {
    rules: {
        'no-http-exception-in-service': {
            meta: {
                type: 'problem',
                docs: { description: 'Service layer must not throw NestJS HTTP exceptions' },
                schema: [{
                    type: 'object',
                    properties: {
                        filePattern: { type: 'string' },
                        forbiddenClasses: { type: 'array', items: { type: 'string' } },
                    },
                    additionalProperties: false,
                }],
            },
            create(context) {
                const filename = context.getFilename();
                const options = context.options[0] ?? {};

                if (!matchesFilePattern(filename, options.filePattern, isServiceFile)) {
                    return {};
                }

                const forbidden = new Set(options.forbiddenClasses ?? [...NEST_HTTP_EXCEPTIONS]);

                return {
                    ThrowStatement(node) {
                        const className = getThrownClassName(node.argument);

                        if (className && forbidden.has(className)) {
                            context.report({
                                node,
                                message: `Service layer must not throw "${className}". Use AppException instead.`,
                            });
                        }
                    },
                };
            },
        },
        'throw-only-app-exception': {
            meta: {
                type: 'problem',
                docs: { description: 'Service layer must throw only the unified AppException' },
                schema: [{
                    type: 'object',
                    properties: {
                        filePattern: { type: 'string' },
                        allowedClasses: { type: 'array', items: { type: 'string' } },
                        allowRethrow: { type: 'boolean' },
                    },
                    additionalProperties: false,
                }],
            },
            create(context) {
                const filename = context.getFilename();
                const options = context.options[0] ?? {};

                if (!matchesFilePattern(filename, options.filePattern, isServiceFile)) {
                    return {};
                }

                const allowed = new Set(options.allowedClasses ?? ['AppException']);
                const allowRethrow = options.allowRethrow ?? true;

                return {
                    ThrowStatement(node) {
                        const arg = node.argument;

                        if (arg?.type === 'NewExpression') {
                            const className = getThrownClassName(arg);

                            if (!className || !allowed.has(className)) {
                                context.report({
                                    node,
                                    message: `Service layer must throw one of [${[...allowed].join(', ')}], got "${className ?? '<unknown>'}".`,
                                });
                            }

                            return;
                        }

                        if (arg?.type === 'Identifier' && allowRethrow) {
                            const catchClause = findNearestCatchClause(node);

                            if (catchClause?.param?.type === 'Identifier' && catchClause.param.name === arg.name) {
                                return;
                            }

                            context.report({
                                node,
                                message: 'Service layer must throw a new AppException, not re-throw arbitrary values.',
                            });
                            return;
                        }

                        context.report({
                            node,
                            message: 'Service layer must throw an AppException instance.',
                        });
                    },
                };
            },
        },
        'no-silent-catch': {
            meta: {
                type: 'problem',
                docs: { description: 'catch blocks must not silently swallow errors' },
                schema: [{
                    type: 'object',
                    properties: {
                        filePattern: { type: 'string' },
                        allowedLogCallees: { type: 'array', items: { type: 'string' } },
                        requireThrowOrHandle: { type: 'boolean' },
                    },
                    additionalProperties: false,
                }],
            },
            create(context) {
                const filename = context.getFilename();
                const options = context.options[0] ?? {};

                if (!matchesFilePattern(filename, options.filePattern, isServiceFile)) {
                    return {};
                }

                const requireThrowOrHandle = options.requireThrowOrHandle ?? true;
                const allowedLogCallees = options.allowedLogCallees ?? [
                    /^console\./,
                    /^logger\./,
                    /^this\.logger\./,
                ];

                return {
                    CatchClause(node) {
                        const bodyStatements = node.body?.body ?? [];

                        if (bodyStatements.length === 0) {
                            context.report({
                                node,
                                message: 'Empty catch block silently swallows errors.',
                            });
                            return;
                        }

                        if (requireThrowOrHandle && isEffectivelyEmptyBlock(node.body, { allowedCallees: allowedLogCallees })) {
                            context.report({
                                node,
                                message: 'catch block only logs the error without rethrowing or handling.',
                            });
                            return;
                        }

                        const behavior = analyzeCatchBody(bodyStatements);

                        if (requireThrowOrHandle && behavior.onlyLogs) {
                            context.report({
                                node,
                                message: 'catch block only logs the error without rethrowing or handling.',
                            });
                            return;
                        }

                        if (node.param?.type === 'Identifier' && !behavior.referencesError(node.param.name)) {
                            context.report({
                                node: node.param,
                                message: `Caught error "${node.param.name}" is never referenced.`,
                            });
                        }
                    },
                };
            },
        },
    },
};
