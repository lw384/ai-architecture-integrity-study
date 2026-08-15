// Shared project model: parse each production source once, then resolve imports,
// aliases, and barrel exports for every backend rule.
import fs from 'node:fs';
import path from 'node:path';
import parser from '@typescript-eslint/parser';
import { isProductionSourcePath, normalizeSourcePath } from '../_shared/production-files.mjs';

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
const SKIP_DIRECTORIES = new Set(['node_modules', 'dist', 'build', 'coverage', '.git']);

export function toRelative(rootDir, filePath) {
    return normalizeSourcePath(path.relative(rootDir, filePath));
}

export function listProductionFiles(rootDir) {
    const files = [];
    const sourceRoot = path.join(rootDir, 'src');

    function visit(directory) {
        if (!fs.existsSync(directory)) {
            return;
        }

        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
            if (entry.isDirectory() && SKIP_DIRECTORIES.has(entry.name)) {
                continue;
            }

            const entryPath = path.join(directory, entry.name);

            if (entry.isDirectory()) {
                visit(entryPath);
                continue;
            }

            if (
                SOURCE_EXTENSIONS.includes(path.extname(entry.name))
                && isProductionSourcePath(toRelative(rootDir, entryPath))
            ) {
                files.push(entryPath);
            }
        }
    }

    visit(sourceRoot);
    return files.sort();
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
        } else if (child && typeof child === 'object') {
            walkAst(child, visitor, node);
        }
    }
}

export function decoratorName(decorator) {
    const expression = decorator?.expression;

    if (expression?.type === 'Identifier') {
        return expression.name;
    }

    if (expression?.type === 'CallExpression') {
        return expressionName(expression.callee);
    }

    return expressionName(expression);
}

export function expressionName(node) {
    if (node?.type === 'Identifier') {
        return node.name;
    }

    if (
        (node?.type === 'MemberExpression' || node?.type === 'OptionalMemberExpression')
        && !node.computed
        && node.property?.type === 'Identifier'
    ) {
        const prefix = expressionName(node.object);
        return prefix ? `${prefix}.${node.property.name}` : node.property.name;
    }

    return null;
}

export function getProperty(objectNode, name) {
    if (objectNode?.type !== 'ObjectExpression') {
        return null;
    }

    for (const property of objectNode.properties ?? []) {
        if (property.type !== 'Property') {
            continue;
        }

        const key = property.key?.type === 'Identifier'
            ? property.key.name
            : property.key?.type === 'Literal'
                ? property.key.value
                : null;

        if (key === name) {
            return property.value;
        }
    }

    return null;
}

export function classDeclarations(ast) {
    const declarations = [];

    for (const statement of ast.body ?? []) {
        if (statement.type === 'ClassDeclaration') {
            declarations.push(statement);
        } else if (statement.type === 'ExportNamedDeclaration' && statement.declaration?.type === 'ClassDeclaration') {
            declarations.push(statement.declaration);
        } else if (statement.type === 'ExportDefaultDeclaration' && statement.declaration?.type === 'ClassDeclaration') {
            declarations.push(statement.declaration);
        }
    }

    return declarations;
}

export function nodeLocation(file, node) {
    return {
        file: file.relative,
        line: node?.loc?.start?.line ?? 1,
        column: (node?.loc?.start?.column ?? 0) + 1,
    };
}

function readTsconfig(rootDir) {
    const candidates = ['tsconfig.json', 'tsconfig.app.json', 'tsconfig.build.json'];

    for (const name of candidates) {
        const filePath = path.join(rootDir, name);

        if (!fs.existsSync(filePath)) {
            continue;
        }

        try {
            const raw = fs.readFileSync(filePath, 'utf8').replace(/\/\*[\s\S]*?\*\/|(^|\s)\/\/.*$/gm, '$1');
            const config = JSON.parse(raw);
            const compiler = config.compilerOptions ?? {};
            return {
                baseUrl: path.resolve(rootDir, compiler.baseUrl ?? '.'),
                paths: compiler.paths ?? {},
            };
        } catch {
            return { baseUrl: rootDir, paths: {} };
        }
    }

    return { baseUrl: rootDir, paths: {} };
}

function trySourceFile(candidate) {
    const attempts = [
        candidate,
        ...SOURCE_EXTENSIONS.map((extension) => `${candidate}${extension}`),
        ...SOURCE_EXTENSIONS.map((extension) => path.join(candidate, `index${extension}`)),
    ];

    return attempts.find((attempt) => fs.existsSync(attempt) && fs.statSync(attempt).isFile()) ?? null;
}

function aliasCandidates(specifier, tsconfig) {
    const candidates = [];

    for (const [pattern, replacements] of Object.entries(tsconfig.paths)) {
        const starIndex = pattern.indexOf('*');
        const prefix = starIndex === -1 ? pattern : pattern.slice(0, starIndex);
        const suffix = starIndex === -1 ? '' : pattern.slice(starIndex + 1);

        if (!specifier.startsWith(prefix) || !specifier.endsWith(suffix)) {
            continue;
        }

        const captured = specifier.slice(prefix.length, specifier.length - suffix.length);

        for (const replacement of replacements) {
            candidates.push(path.resolve(tsconfig.baseUrl, replacement.replace('*', captured)));
        }
    }

    return candidates;
}

function resolveImportPath(project, fromFile, specifier) {
    if (typeof specifier !== 'string') {
        return null;
    }

    const candidates = [];

    if (specifier.startsWith('.')) {
        candidates.push(path.resolve(path.dirname(fromFile.path), specifier));
    } else if (specifier.startsWith('src/')) {
        candidates.push(path.resolve(project.rootDir, specifier));
    } else {
        candidates.push(...aliasCandidates(specifier, project.tsconfig));
    }

    for (const candidate of candidates) {
        const resolved = trySourceFile(candidate);

        if (resolved && resolved.startsWith(project.rootDir)) {
            return resolved;
        }
    }

    return null;
}

export function resolveExportTargets(project, fromFile, specifier, importedNames = new Set(['*'])) {
    const resolved = resolveImportPath(project, fromFile, specifier);
    return resolved ? exportTargets(project, resolved, importedNames) : [];
}

function importBindings(node) {
    const bindings = [];

    for (const specifier of node.specifiers ?? []) {
        if (specifier.type === 'ImportSpecifier') {
            bindings.push({
                local: specifier.local.name,
                imported: specifier.imported?.name ?? specifier.imported?.value ?? specifier.local.name,
                kind: specifier.importKind ?? node.importKind ?? 'value',
            });
        } else if (specifier.type === 'ImportDefaultSpecifier') {
            bindings.push({ local: specifier.local.name, imported: 'default', kind: node.importKind ?? 'value' });
        } else if (specifier.type === 'ImportNamespaceSpecifier') {
            bindings.push({ local: specifier.local.name, imported: '*', kind: node.importKind ?? 'value' });
        }
    }

    return bindings;
}

function collectFileFacts(project, filePath) {
    const code = fs.readFileSync(filePath, 'utf8');
    const ast = parser.parse(code, {
        sourceType: 'module',
        ecmaVersion: 2022,
        loc: true,
        range: true,
        jsx: filePath.endsWith('.tsx') || filePath.endsWith('.jsx'),
    });
    const file = {
        path: filePath,
        relative: toRelative(project.rootDir, filePath),
        code,
        ast,
        classes: classDeclarations(ast),
        imports: [],
        constants: new Map(),
        functions: new Map(),
        importBindings: new Map(),
    };

    for (const statement of ast.body ?? []) {
        const declaration = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;

        if (declaration?.type === 'VariableDeclaration' && declaration.kind === 'const') {
            for (const item of declaration.declarations ?? []) {
                if (item.id?.type === 'Identifier') {
                    file.constants.set(item.id.name, item.init);
                }
            }
        }

        if (declaration?.type === 'FunctionDeclaration' && declaration.id?.name) {
            file.functions.set(declaration.id.name, declaration);
        }

        if (statement.type === 'ImportDeclaration') {
            const edge = {
                node: statement,
                sourceNode: statement.source,
                source: statement.source.value,
                kind: statement.importKind ?? 'value',
                bindings: importBindings(statement),
                dynamic: false,
            };
            file.imports.push(edge);

            for (const binding of edge.bindings) {
                file.importBindings.set(binding.local, { ...binding, source: edge.source });
            }
        }
    }

    walkAst(ast, (node) => {
        if (node.type === 'ImportExpression' && node.source?.type === 'Literal') {
            file.imports.push({
                node,
                sourceNode: node.source,
                source: node.source.value,
                kind: 'value',
                bindings: [],
                dynamic: true,
            });
        }
    });

    return file;
}

function exportTargets(project, filePath, importedNames, seen = new Set()) {
    // Follow only entry-point re-exports; ordinary source files remain terminal.
    const key = `${filePath}:${[...importedNames].sort().join(',')}`;

    if (seen.has(key)) {
        return [];
    }

    seen.add(key);
    const file = project.byPath.get(filePath);

    if (!file || path.basename(filePath) !== 'index.ts') {
        return [filePath];
    }

    const targets = [];

    for (const statement of file.ast.body ?? []) {
        if (!['ExportNamedDeclaration', 'ExportAllDeclaration'].includes(statement.type) || !statement.source?.value) {
            continue;
        }

        const resolved = resolveImportPath(project, file, statement.source.value);

        if (!resolved) {
            continue;
        }

        if (statement.type === 'ExportAllDeclaration') {
            targets.push(...exportTargets(project, resolved, importedNames, seen));
            continue;
        }

        const matching = (statement.specifiers ?? []).filter((specifier) => {
            const exported = specifier.exported?.name ?? specifier.exported?.value;
            return importedNames.has('*') || importedNames.has(exported);
        });

        if (matching.length > 0) {
            const nextNames = new Set(matching.map((specifier) => specifier.local?.name ?? specifier.local?.value));
            targets.push(...exportTargets(project, resolved, nextNames, seen));
        }
    }

    return targets.length > 0 ? [...new Set(targets)] : [filePath];
}

export function buildProject(rootDir) {
    const project = {
        rootDir: path.resolve(rootDir),
        tsconfig: readTsconfig(rootDir),
        files: [],
        byPath: new Map(),
        parseErrors: [],
    };

    for (const filePath of listProductionFiles(project.rootDir)) {
        try {
            const file = collectFileFacts(project, filePath);
            project.files.push(file);
            project.byPath.set(filePath, file);
        } catch (error) {
            project.parseErrors.push({ file: toRelative(project.rootDir, filePath), message: error.message });
        }
    }

    for (const file of project.files) {
        for (const edge of file.imports) {
            edge.resolved = resolveImportPath(project, file, edge.source);
            const names = new Set(edge.bindings.map((binding) => binding.imported));
            edge.ultimateTargets = edge.resolved
                ? exportTargets(project, edge.resolved, names.size > 0 ? names : new Set(['*']))
                : [];
        }
    }

    return project;
}

export function evaluateStatic(file, node, seen = new Set()) {
    // Resolve the small deterministic expression subset used by route and pipe config.
    if (!node) {
        return undefined;
    }

    if (node.type === 'Literal') {
        return node.value;
    }

    if (node.type === 'TemplateLiteral') {
        let value = '';

        for (let index = 0; index < node.quasis.length; index += 1) {
            value += node.quasis[index].value?.cooked ?? '';

            if (node.expressions[index]) {
                const expressionValue = evaluateStatic(file, node.expressions[index], seen);
                if (expressionValue === undefined) return undefined;
                value += String(expressionValue);
            }
        }

        return value;
    }

    if (node.type === 'Identifier') {
        if (seen.has(node.name)) {
            return undefined;
        }

        const initializer = file.constants.get(node.name);
        return initializer ? evaluateStatic(file, initializer, new Set([...seen, node.name])) : undefined;
    }

    if (node.type === 'ArrayExpression') {
        const values = node.elements.map((element) => evaluateStatic(file, element, seen));
        return values.some((value) => value === undefined) ? undefined : values;
    }

    if (node.type === 'ObjectExpression') {
        const result = {};

        for (const property of node.properties ?? []) {
            if (property.type === 'SpreadElement') {
                const spread = evaluateStatic(file, property.argument, seen);
                if (!spread || Array.isArray(spread) || typeof spread !== 'object') return undefined;
                Object.assign(result, spread);
                continue;
            }

            if (property.type !== 'Property') return undefined;
            const key = property.key?.type === 'Identifier' ? property.key.name : property.key?.value;
            const value = evaluateStatic(file, property.value, seen);
            if (key === undefined) return undefined;
            result[key] = value;
        }

        return result;
    }

    if (node.type === 'CallExpression' && node.callee?.type === 'Identifier') {
        const fn = file.functions.get(node.callee.name);
        const constant = file.constants.get(node.callee.name);
        const callable = fn ?? (constant?.type === 'ArrowFunctionExpression' ? constant : null);
        const body = callable?.body;
        const returnStatement = body?.type === 'BlockStatement'
            ? body.body.find((statement) => statement.type === 'ReturnStatement')
            : null;
        return body?.type === 'BlockStatement'
            ? (returnStatement ? evaluateStatic(file, returnStatement.argument, seen) : undefined)
            : evaluateStatic(file, body, seen);
    }

    if (node.type === 'ArrowFunctionExpression') {
        if (node.body.type === 'BlockStatement') {
            const returnStatement = node.body.body.find((statement) => statement.type === 'ReturnStatement');
            return returnStatement ? evaluateStatic(file, returnStatement.argument, seen) : undefined;
        }
        return evaluateStatic(file, node.body, seen);
    }

    return undefined;
}

export function sourceText(file, node) {
    if (!node?.range) {
        return '';
    }

    return file.code.slice(node.range[0], node.range[1]);
}
