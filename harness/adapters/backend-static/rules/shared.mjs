// Helpers reused by two or more rule-category analyzers. Keep additions here limited to
// genuinely cross-category utilities; category-specific helpers stay in their own file.
import {
    decoratorName,
    expressionName,
    getProperty,
    nodeLocation,
    walkAst,
} from '../project.mjs';

export function violation(ruleId, file, node, payload) {
    return { ruleId, location: nodeLocation(file, node), payload };
}

export function moduleParts(relativePath) {
    const match = relativePath.match(/^src\/modules\/([^/]+)\/(.+)$/);
    return match ? { owner: match[1], rest: match[2] } : null;
}

export function layerOf(relativePath) {
    const match = relativePath.match(/\.(controller|service|repository|entity)\.[cm]?[jt]sx?$/);
    return match?.[1] ?? null;
}

export function isModuleEntry(relativePath) {
    const parts = moduleParts(relativePath);
    return Boolean(parts && (parts.rest === 'index.ts' || parts.rest === `${parts.owner}.module.ts`));
}

export function targetFiles(project, edge) {
    return edge.ultimateTargets
        .map((target) => project.byPath.get(target))
        .filter(Boolean);
}

export function collectExpressionIdentifiers(node, names = new Set()) {
    walkAst(node, (child) => {
        if (child.type === 'Identifier') {
            names.add(child.name);
        }
    });
    return names;
}

export function findModuleDecorator(file) {
    for (const classNode of file.classes) {
        const decorator = (classNode.decorators ?? []).find((item) => decoratorName(item) === 'Module');
        if (decorator) return decorator;
    }
    return null;
}

export function moduleMetadataNames(decorator, propertyName) {
    const call = decorator?.expression?.type === 'CallExpression' ? decorator.expression : null;
    const argument = call?.arguments?.[0];
    return collectExpressionIdentifiers(getProperty(argument, propertyName));
}

export function returnedExpression(file, callNode) {
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

export function variableInitializer(file, name) {
    return file.constants.get(name) ?? null;
}

export function expressionType(file, node, seen = new Set()) {
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

export function importedSymbol(file, expression) {
    if (expression?.type === 'Identifier') {
        return file.importBindings.get(expression.name) ?? null;
    }

    if (expression?.type === 'MemberExpression' && expression.object?.type === 'Identifier') {
        const namespace = file.importBindings.get(expression.object.name);
        return namespace ? { ...namespace, imported: expression.property?.name } : null;
    }

    return null;
}
