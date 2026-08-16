import fs from 'node:fs';
import path from 'node:path';
import parser from '@typescript-eslint/parser';
import { isProductionSourcePath } from '../../../_shared/production-files.mjs';
import { evaluateStatic } from '../../../backend-static/project.mjs';
import { isKebabRoute } from '../../../backend-static/rules/routes.mjs';

const HTTP_DECORATORS = new Set(['Get', 'Post', 'Put', 'Patch', 'Delete', 'Options', 'Head', 'All']);
const MAPPED_TYPE_CALLS = new Set(['PartialType', 'PickType', 'OmitType', 'IntersectionType']);

export function toPosixPath(value) {
    return value.split(path.sep).join('/');
}

function walkDirectory(dirPath, onFile) {
    if (!fs.existsSync(dirPath)) {
        return;
    }

    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
        const entryPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
            walkDirectory(entryPath, onFile);
            continue;
        }

        onFile(entryPath);
    }
}

export function listFiles(rootDir, predicate) {
    const files = [];

    walkDirectory(rootDir, (filePath) => {
        if (predicate(filePath)) {
            files.push(filePath);
        }
    });

    return files;
}

export function parseTypescriptFile(filePath) {
    const code = fs.readFileSync(filePath, 'utf8');
    const ast = parser.parse(code, {
        sourceType: 'module',
        ecmaVersion: 2021,
        loc: true,
        range: true,
    });

    return { code, ast };
}

export function walkAst(node, visitor, parent = null) {
    if (!node || typeof node !== 'object') {
        return;
    }

    visitor(node, parent);

    for (const [key, child] of Object.entries(node)) {
        if (key === 'parent' || key === 'tokens' || key === 'comments') {
            continue;
        }

        if (Array.isArray(child)) {
            for (const item of child) {
                walkAst(item, visitor, node);
            }
            continue;
        }

        if (child && typeof child === 'object') {
            walkAst(child, visitor, node);
        }
    }
}

export function getDecoratorName(decorator) {
    const expr = decorator?.expression;

    if (!expr) {
        return null;
    }

    if (expr.type === 'Identifier') {
        return expr.name;
    }

    if (expr.type === 'CallExpression') {
        if (expr.callee?.type === 'Identifier') {
            return expr.callee.name;
        }

        if (expr.callee?.type === 'MemberExpression' && expr.callee.property?.type === 'Identifier') {
            return expr.callee.property.name;
        }
    }

    if (expr.type === 'MemberExpression' && expr.property?.type === 'Identifier') {
        return expr.property.name;
    }

    return null;
}

export function getLiteralStringValue(node) {
    if (!node) {
        return null;
    }

    if (node.type === 'Literal' && typeof node.value === 'string') {
        return node.value;
    }

    if (node.type === 'TemplateLiteral' && node.expressions.length === 0) {
        return node.quasis[0]?.value?.cooked ?? '';
    }

    return null;
}

function collectClassValidatorImports(programNode) {
    const imported = new Set();
    const namespaces = new Set();

    for (const stmt of programNode.body ?? []) {
        if (stmt.type !== 'ImportDeclaration' || stmt.source?.value !== 'class-validator') {
            continue;
        }

        for (const specifier of stmt.specifiers ?? []) {
            if (specifier.type === 'ImportSpecifier') {
                imported.add(specifier.local.name);
            }

            if (specifier.type === 'ImportNamespaceSpecifier') {
                namespaces.add(specifier.local.name);
            }
        }
    }

    return { imported, namespaces };
}

function isClassValidatorDecorator(decorator, validatorImports) {
    const expr = decorator?.expression;

    if (!expr) {
        return false;
    }

    if (expr.type === 'CallExpression') {
        const callee = expr.callee;

        if (callee?.type === 'Identifier') {
            return validatorImports.imported.has(callee.name);
        }

        if (
            callee?.type === 'MemberExpression'
            && callee.object?.type === 'Identifier'
            && callee.property?.type === 'Identifier'
        ) {
            return validatorImports.namespaces.has(callee.object.name);
        }
    }

    if (expr.type === 'Identifier') {
        return validatorImports.imported.has(expr.name);
    }

    return false;
}

function isRequestDtoClass(classNode) {
    const className = classNode.id?.name ?? '';

    if (!className.endsWith('Dto') || className.endsWith('ResponseDto')) {
        return false;
    }

    const superClass = classNode.superClass;

    if (superClass?.type === 'CallExpression') {
        const mappedTypeName = superClass.callee?.type === 'Identifier'
            ? superClass.callee.name
            : superClass.callee?.type === 'MemberExpression' && superClass.callee.property?.type === 'Identifier'
                ? superClass.callee.property.name
                : null;

        if (mappedTypeName && MAPPED_TYPE_CALLS.has(mappedTypeName)) {
            return false;
        }
    }

    return true;
}

function extractClassDeclarations(programNode) {
    const classes = [];

    for (const stmt of programNode.body ?? []) {
        if (stmt.type === 'ClassDeclaration') {
            classes.push(stmt);
            continue;
        }

        if (stmt.type === 'ExportNamedDeclaration' && stmt.declaration?.type === 'ClassDeclaration') {
            classes.push(stmt.declaration);
        }
    }

    return classes;
}

export function analyzeDtoValidatorCoverage(projectRoot, config = {}) {
    const dtoRoots = Array.isArray(config.dto_roots) && config.dto_roots.length > 0
        ? config.dto_roots
        : ['src/modules'];
    const details = [];

    for (const dtoRoot of dtoRoots) {
        const absoluteRoot = path.resolve(projectRoot, dtoRoot);

        for (const filePath of listFiles(
            absoluteRoot,
            (candidate) => /(^|\/)dto\/.+\.ts$/.test(toPosixPath(candidate))
                && isProductionSourcePath(candidate),
        )) {
            const relativeFile = toPosixPath(path.relative(projectRoot, filePath));
            const { ast } = parseTypescriptFile(filePath);
            const validatorImports = collectClassValidatorImports(ast);

            for (const stmt of extractClassDeclarations(ast)) {
                if (stmt.type !== 'ClassDeclaration' || !isRequestDtoClass(stmt)) {
                    continue;
                }

                const className = stmt.id?.name ?? '<anonymous>';

                for (const element of stmt.body.body ?? []) {
                    if (element.type !== 'PropertyDefinition' || element.static) {
                        continue;
                    }

                    const propertyName = element.key?.type === 'Identifier'
                        ? element.key.name
                        : '<unknown>';
                    const hasValidator = (element.decorators ?? []).some((decorator) =>
                        isClassValidatorDecorator(decorator, validatorImports)
                    );

                    details.push({
                        file: relativeFile,
                        className,
                        propertyName,
                        hasValidator,
                        line: element.loc?.start?.line ?? null,
                    });
                }
            }
        }
    }

    const totalFields = details.length;
    const coveredFields = details.filter((item) => item.hasValidator).length;

    return {
        totalFields,
        coveredFields,
        ratio: totalFields === 0 ? 1 : Number((coveredFields / totalFields).toFixed(6)),
        details,
    };
}

function isRelevantMethodFile(filePath) {
    return /\.(controller|service|repository)\.ts$/.test(filePath)
        && isProductionSourcePath(filePath);
}

export function analyzeMethodParameters(projectRoot, config = {}) {
    const roots = Array.isArray(config.source_roots) && config.source_roots.length > 0
        ? config.source_roots
        : ['src'];
    const methods = [];

    for (const root of roots) {
        const absoluteRoot = path.resolve(projectRoot, root);

        for (const filePath of listFiles(absoluteRoot, (candidate) => isRelevantMethodFile(toPosixPath(candidate)))) {
            const relativeFile = toPosixPath(path.relative(projectRoot, filePath));
            const { ast } = parseTypescriptFile(filePath);

            walkAst(ast, (node) => {
                if (node.type !== 'MethodDefinition' || node.kind === 'constructor') {
                    return;
                }

                const methodName = node.key?.type === 'Identifier' ? node.key.name : '<unknown>';
                const parameterCount = node.value?.params?.length ?? 0;

                methods.push({
                    file: relativeFile,
                    methodName,
                    parameterCount,
                    line: node.loc?.start?.line ?? null,
                });
            });
        }
    }

    const violatingMethods = methods.filter((item) => item.parameterCount > (config.max_parameters ?? 3)).length;

    return {
        totalMethods: methods.length,
        violatingMethods,
        ratio: methods.length === 0 ? 0 : Number((violatingMethods / methods.length).toFixed(6)),
        details: methods,
    };
}

// analyzeMethodParameters() above is no longer wired to any rule as of the SIZE category's
// switch to cyclomatic complexity (BE-SIZE-M-001-cyclomatic-complexity-ratio); kept in the
// repo per the migration note rather than deleted.

const DECISION_STATEMENT_TYPES = new Set([
    'IfStatement',
    'WhileStatement',
    'DoWhileStatement',
    'ForStatement',
    'ForInStatement',
    'ForOfStatement',
]);
const FUNCTION_LIKE_TYPES = new Set(['FunctionExpression', 'ArrowFunctionExpression', 'FunctionDeclaration']);
const AST_TRAVERSAL_SKIP_KEYS = new Set(['parent', 'tokens', 'comments', 'loc', 'range']);

// McCabe (1976): V(G) = 1 + decision points. Counts if/while/for/case/&&/||/ternary within one
// method body. Stops at nested function boundaries so a callback's branches are not folded
// into the enclosing method's score — each closure is its own unit of complexity.
function countDecisionPoints(node, isRoot = true) {
    if (!node || typeof node !== 'object') {
        return 0;
    }

    if (!isRoot && FUNCTION_LIKE_TYPES.has(node.type)) {
        return 0;
    }

    let count = 0;

    if (DECISION_STATEMENT_TYPES.has(node.type)) {
        count += 1;
    } else if (node.type === 'SwitchCase' && node.test !== null) {
        count += 1;
    } else if (node.type === 'LogicalExpression' && (node.operator === '&&' || node.operator === '||')) {
        count += 1;
    } else if (node.type === 'ConditionalExpression') {
        count += 1;
    }

    for (const [key, child] of Object.entries(node)) {
        if (AST_TRAVERSAL_SKIP_KEYS.has(key)) {
            continue;
        }

        if (Array.isArray(child)) {
            for (const item of child) {
                count += countDecisionPoints(item, false);
            }
        } else if (child && typeof child === 'object') {
            count += countDecisionPoints(child, false);
        }
    }

    return count;
}

export function analyzeCyclomaticComplexity(projectRoot, config = {}) {
    const roots = Array.isArray(config.source_roots) && config.source_roots.length > 0
        ? config.source_roots
        : ['src'];
    const maxComplexity = config.max_complexity ?? 10;
    const methods = [];

    for (const root of roots) {
        const absoluteRoot = path.resolve(projectRoot, root);

        for (const filePath of listFiles(absoluteRoot, (candidate) => isRelevantMethodFile(toPosixPath(candidate)))) {
            const relativeFile = toPosixPath(path.relative(projectRoot, filePath));
            const { ast } = parseTypescriptFile(filePath);

            walkAst(ast, (node) => {
                if (node.type !== 'MethodDefinition' || node.kind === 'constructor') {
                    return;
                }

                const methodName = node.key?.type === 'Identifier' ? node.key.name : '<unknown>';
                const complexity = 1 + countDecisionPoints(node.value?.body);

                methods.push({
                    file: relativeFile,
                    methodName,
                    complexity,
                    line: node.loc?.start?.line ?? null,
                });
            });
        }
    }

    const violatingMethods = methods.filter((item) => item.complexity > maxComplexity).length;
    const averageComplexity = methods.length === 0
        ? 0
        : Number((methods.reduce((sum, item) => sum + item.complexity, 0) / methods.length).toFixed(4));

    return {
        totalMethods: methods.length,
        violatingMethods,
        maxComplexity,
        averageComplexity,
        ratio: methods.length === 0 ? 0 : Number((violatingMethods / methods.length).toFixed(6)),
        details: methods,
    };
}

// Minimal same-file top-level binding collector — mirrors what
// adapters/backend-static/project.mjs's buildProject() records per file, just enough for the
// shared evaluateStatic() to resolve `const X = 'literal'; fn(X)`-style same-file references
// without pulling in that module's full import-graph machinery.
function collectTopLevelBindings(ast) {
    const constants = new Map();
    const functions = new Map();

    for (const statement of ast.body ?? []) {
        const declaration = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;

        if (declaration?.type === 'VariableDeclaration' && declaration.kind === 'const') {
            for (const item of declaration.declarations ?? []) {
                if (item.id?.type === 'Identifier') {
                    constants.set(item.id.name, item.init);
                }
            }
        }

        if (declaration?.type === 'FunctionDeclaration' && declaration.id?.name) {
            functions.set(declaration.id.name, declaration);
        }
    }

    return { constants, functions };
}

export function analyzeRoutes(projectRoot, config = {}) {
    const mainFileCandidates = Array.isArray(config.main_file_candidates) && config.main_file_candidates.length > 0
        ? config.main_file_candidates
        : [config.main_file ?? 'src/main.ts'];
    const controllerRoots = Array.isArray(config.controller_roots) && config.controller_roots.length > 0
        ? config.controller_roots
        : ['src/modules'];
    const requiredPrefix = config.required_prefix ?? 'api';
    let hasGlobalPrefix = false;
    const endpoints = [];

    for (const mainFile of mainFileCandidates) {
        const mainPath = path.resolve(projectRoot, mainFile);

        if (!fs.existsSync(mainPath)) {
            continue;
        }

        const { ast } = parseTypescriptFile(mainPath);
        const fileBindings = collectTopLevelBindings(ast);

        walkAst(ast, (node) => {
            if (
                node.type === 'CallExpression'
                && node.callee?.type === 'MemberExpression'
                && node.callee.property?.type === 'Identifier'
                && node.callee.property.name === 'setGlobalPrefix'
                && evaluateStatic(fileBindings, node.arguments?.[0]) === requiredPrefix
            ) {
                hasGlobalPrefix = true;
            }
        });
    }

    for (const root of controllerRoots) {
        const absoluteRoot = path.resolve(projectRoot, root);

        for (const filePath of listFiles(
            absoluteRoot,
            (candidate) => /\.controller\.ts$/.test(candidate) && isProductionSourcePath(candidate),
        )) {
            const relativeFile = toPosixPath(path.relative(projectRoot, filePath));
            const { ast } = parseTypescriptFile(filePath);
            const classes = extractClassDeclarations(ast);

            for (const classNode of classes) {
                const controllerDecorator = (classNode.decorators ?? []).find(
                    (decorator) => getDecoratorName(decorator) === 'Controller'
                );
                const controllerCall = controllerDecorator?.expression?.type === 'CallExpression'
                    ? controllerDecorator.expression
                    : null;
                const controllerPath = getLiteralStringValue(controllerCall?.arguments?.[0]) ?? '';

                for (const element of classNode.body.body ?? []) {
                    if (element.type !== 'MethodDefinition') {
                        continue;
                    }

                    for (const decorator of element.decorators ?? []) {
                        const name = getDecoratorName(decorator);

                        if (!name || !HTTP_DECORATORS.has(name)) {
                            continue;
                        }

                        const callExpr = decorator.expression?.type === 'CallExpression'
                            ? decorator.expression
                            : null;
                        const methodPath = getLiteralStringValue(callExpr?.arguments?.[0]) ?? '';
                        const violatesPath = !isKebabRoute(controllerPath) || !isKebabRoute(methodPath);

                        endpoints.push({
                            file: relativeFile,
                            methodName: element.key?.type === 'Identifier' ? element.key.name : '<unknown>',
                            controllerPath,
                            methodPath,
                            violatesPath,
                            line: element.loc?.start?.line ?? null,
                        });
                    }
                }
            }
        }
    }

    const violatingEndpoints = endpoints.filter((item) => !hasGlobalPrefix || item.violatesPath).length;

    return {
        hasGlobalPrefix,
        requiredPrefix,
        totalEndpoints: endpoints.length,
        violatingEndpoints,
        ratio: endpoints.length === 0 ? 0 : Number((violatingEndpoints / endpoints.length).toFixed(6)),
        details: endpoints,
    };
}

function isMockCounterCall(node) {
    if (node.callee?.type === 'MemberExpression' && node.callee.property?.type === 'Identifier') {
        const propertyName = node.callee.property.name;

        if (
            node.callee.object?.type === 'Identifier'
            && node.callee.object.name === 'jest'
            && (propertyName === 'mock' || propertyName === 'spyOn')
        ) {
            return true;
        }

        if (propertyName === 'useValue' || propertyName === 'useFactory' || propertyName === 'useClass') {
            return true;
        }
    }

    return false;
}

export function analyzeMockUsage(projectRoot, config = {}) {
    const testRoots = Array.isArray(config.test_roots) && config.test_roots.length > 0
        ? config.test_roots
        : ['src', 'test'];
    let testCases = 0;
    let mocks = 0;
    const details = [];

    for (const root of testRoots) {
        const absoluteRoot = path.resolve(projectRoot, root);

        for (const filePath of listFiles(absoluteRoot, (candidate) => /(?:^|[.-])(spec|test)\.ts$/.test(candidate))) {
            const relativeFile = toPosixPath(path.relative(projectRoot, filePath));
            const { ast } = parseTypescriptFile(filePath);
            let fileTests = 0;
            let fileMocks = 0;

            walkAst(ast, (node) => {
                if (node.type === 'CallExpression') {
                    if (node.callee?.type === 'Identifier' && (node.callee.name === 'it' || node.callee.name === 'test')) {
                        fileTests += 1;
                    }

                    if (isMockCounterCall(node)) {
                        fileMocks += 1;
                    }
                }

                if (node.type === 'Property') {
                    const keyName = node.key?.type === 'Identifier'
                        ? node.key.name
                        : node.key?.type === 'Literal'
                            ? String(node.key.value)
                            : null;

                    if (keyName === 'useValue' || keyName === 'useFactory' || keyName === 'useClass') {
                        fileMocks += 1;
                    }
                }
            });

            testCases += fileTests;
            mocks += fileMocks;
            details.push({
                file: relativeFile,
                testCases: fileTests,
                mocks: fileMocks,
            });
        }
    }

    return {
        testCases,
        mocks,
        ratio: testCases === 0 ? null : Number((mocks / testCases).toFixed(6)),
        details,
    };
}
