const SERVICE_FILE_RE = /\.service\.ts$/;

export function isServiceFile(filename) {
    return SERVICE_FILE_RE.test(filename);
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
