const SERVICE_FILE_RE = /\.service\.ts$/;
const CONTROLLER_FILE_RE = /\.controller\.ts$/;
const REPOSITORY_FILE_RE = /\.repository\.ts$/;
const SPEC_FILE_RE = /\.(spec|test)\.ts$/;
const DTO_FILE_RE = /(^|\/)dto\/.+\.ts$/;
const MAIN_FILE_RE = /(^|\/)main\.ts$/;

export function isServiceFile(filename) {
    return SERVICE_FILE_RE.test(filename);
}

export function isControllerFile(filename) {
    return CONTROLLER_FILE_RE.test(filename);
}

export function isRepositoryFile(filename) {
    return REPOSITORY_FILE_RE.test(filename);
}

export function isSpecFile(filename) {
    return SPEC_FILE_RE.test(filename);
}

export function isDtoFile(filename) {
    return DTO_FILE_RE.test(filename);
}

export function isMainFile(filename) {
    return MAIN_FILE_RE.test(filename);
}

export function getThrownClassName(argument) {
    if (argument?.type === 'NewExpression') {
        if (argument.callee?.type === 'Identifier') {
            return argument.callee.name;
        }

        if (argument.callee?.type === 'MemberExpression') {
            return getCalleeString(argument.callee);
        }
    }

    return null;
}

export function getCalleeString(callee) {
    if (!callee) {
        return '';
    }

    if (callee.type === 'Identifier') {
        return callee.name;
    }

    if (callee.type === 'MemberExpression') {
        const objectPart = getCalleeString(callee.object);
        const propertyPart = callee.property?.type === 'Identifier'
            ? callee.property.name
            : callee.property?.type === 'Literal'
                ? String(callee.property.value)
                : '';

        return objectPart && propertyPart ? `${objectPart}.${propertyPart}` : objectPart || propertyPart;
    }

    return '';
}

export function isEffectivelyEmptyBlock(block, { allowedCallees = [] } = {}) {
    if (!block || block.type !== 'BlockStatement') {
        return false;
    }

    const body = block.body ?? [];

    if (body.length === 0) {
        return true;
    }

    return body.every((stmt) => {
        if (stmt.type !== 'ExpressionStatement') {
            return false;
        }

        const expr = stmt.expression;

        if (!expr || expr.type !== 'CallExpression') {
            return false;
        }

        const calleeName = getCalleeString(expr.callee);

        return allowedCallees.some((pattern) => (
            typeof pattern === 'string' ? calleeName === pattern : pattern.test(calleeName)
        ));
    });
}

export function collectIdentifiers(node, collectedNames = new Set()) {
    if (!node || typeof node !== 'object') {
        return collectedNames;
    }

    if (node.type === 'Identifier') {
        collectedNames.add(node.name);
    }

    for (const key of Object.keys(node)) {
        if (key === 'parent') {
            continue;
        }

        const child = node[key];

        if (Array.isArray(child)) {
            for (const item of child) {
                collectIdentifiers(item, collectedNames);
            }
        } else if (child && typeof child === 'object') {
            collectIdentifiers(child, collectedNames);
        }
    }

    return collectedNames;
}

export function findNearestCatchClause(node) {
    let current = node?.parent ?? null;

    while (current) {
        if (current.type === 'CatchClause') {
            return current;
        }

        current = current.parent ?? null;
    }

    return null;
}

export function isForbiddenSymbol(name, suffixes = []) {
    if (!name || typeof name !== 'string') {
        return false;
    }

    return suffixes.some((suffix) => name.endsWith(suffix));
}

export function isForbiddenSourcePath(sourceValue, sourcePatterns = []) {
    if (!sourceValue || typeof sourceValue !== 'string') {
        return false;
    }

    return sourcePatterns.some((pattern) => pattern.test(sourceValue));
}

export function getModuleDecoratorArgument(decoratorNode) {
    const expr = decoratorNode?.expression;

    if (!expr || expr.type !== 'CallExpression') {
        return null;
    }

    const callee = expr.callee;
    const calleeName = callee?.type === 'Identifier'
        ? callee.name
        : callee?.type === 'MemberExpression' && callee.property?.type === 'Identifier'
            ? callee.property.name
            : null;

    if (calleeName !== 'Module') {
        return null;
    }

    const arg = expr.arguments?.[0];

    if (!arg || arg.type !== 'ObjectExpression') {
        return null;
    }

    return arg;
}

export function getObjectProperty(objectExpr, propertyName) {
    if (!objectExpr || objectExpr.type !== 'ObjectExpression') {
        return null;
    }

    for (const prop of objectExpr.properties) {
        if (prop.type !== 'Property') {
            continue;
        }

        const key = prop.key;
        const keyName = key.type === 'Identifier'
            ? key.name
            : key.type === 'Literal'
                ? String(key.value)
                : null;

        if (keyName === propertyName) {
            return prop.value;
        }
    }

    return null;
}

export function extractIdentifierNamesFromArray(arrayExpr) {
    const names = [];

    if (!arrayExpr || arrayExpr.type !== 'ArrayExpression') {
        return names;
    }

    for (const element of arrayExpr.elements) {
        if (!element) {
            continue;
        }

        if (element.type === 'Identifier') {
            names.push({ name: element.name, node: element });
        }
    }

    return names;
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

export function getClassExtendsCallName(node) {
    const superClass = node?.superClass;

    if (!superClass) {
        return null;
    }

    if (superClass.type === 'CallExpression') {
        if (superClass.callee?.type === 'Identifier') {
            return superClass.callee.name;
        }

        if (superClass.callee?.type === 'MemberExpression' && superClass.callee.property?.type === 'Identifier') {
            return superClass.callee.property.name;
        }
    }

    return null;
}

export function collectImportedNames(programNode, packageName) {
    const imported = new Set();
    const namespaces = new Set();

    for (const stmt of programNode?.body ?? []) {
        if (stmt.type !== 'ImportDeclaration' || stmt.source?.value !== packageName) {
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

export function isClassValidatorDecorator(decorator, validatorImports) {
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

export function isKebabCaseRoutePath(pathValue) {
    if (typeof pathValue !== 'string') {
        return true;
    }

    const trimmed = pathValue.trim();

    if (!trimmed || trimmed === '/') {
        return true;
    }

    const segments = trimmed.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);

    return segments.every((segment) => {
        if (!segment) {
            return true;
        }

        if (segment.startsWith(':')) {
            return /^[A-Za-z][A-Za-z0-9_]*$/.test(segment.slice(1));
        }

        return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(segment);
    });
}
