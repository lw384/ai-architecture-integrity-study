// Compute render-decision nesting once so FE-COM-C-002 and FE-COM-M-001
// consume identical per-component facts. Structural JSX ancestry is
// intentionally irrelevant: only control flow that selects rendered output
// contributes to this depth.
import { inventoryHelpers } from './inventory.mjs';

const LOGICAL_OPERATORS = new Set(['&&', '||', '??']);
const COMPONENT_WRAPPERS = new Set(['memo', 'forwardRef']);

function componentNameFromFile(relative) {
    const basename = relative.split('/').at(-1)?.replace(/\.[^.]+$/, '') ?? 'AnonymousComponent';
    return basename === 'index'
        ? relative.split('/').at(-2) ?? 'AnonymousComponent'
        : basename;
}

function expressionTailName(node) {
    if (node?.type === 'Identifier') return node.name;
    if (node?.type === 'MemberExpression' && !node.computed) return expressionTailName(node.property);
    return null;
}

function declaredName(file, node) {
    let current = node;
    let parent = file.parents.get(current);

    while (
        parent?.type === 'CallExpression'
        && parent.arguments.includes(current)
        && COMPONENT_WRAPPERS.has(expressionTailName(parent.callee))
    ) {
        current = parent;
        parent = file.parents.get(current);
    }

    if (parent?.type === 'VariableDeclarator' && parent.id?.type === 'Identifier') {
        return parent.id.name;
    }
    if (parent?.type === 'ExportDefaultDeclaration') {
        return componentNameFromFile(file.relative);
    }

    return null;
}

function classRenderDescriptor(file, record) {
    const method = record.parent;
    if (
        method?.type !== 'MethodDefinition'
        || method.key?.type !== 'Identifier'
        || method.key.name !== 'render'
    ) return null;

    const classBody = file.parents.get(method);
    const classNode = file.parents.get(classBody);
    const name = classNode?.id?.name
        ?? (file.parents.get(classNode)?.type === 'VariableDeclarator'
            ? file.parents.get(classNode).id?.name
            : null);

    return name && /^[A-Z]/.test(name)
        ? { name, node: classNode, root: record.node }
        : null;
}

function componentDescriptors(file) {
    const components = file.functionRecords
        .filter((record) => record.component)
        .map((record) => ({
            name: record.name,
            node: record.node,
            root: record.node,
        }));
    const knownRoots = new Set(components.map((component) => component.root));

    for (const record of file.functionRecords) {
        if (knownRoots.has(record.node) || !inventoryHelpers.containsJsx(record.node.body)) continue;

        const classDescriptor = classRenderDescriptor(file, record);
        const name = declaredName(file, record.node);
        const descriptor = classDescriptor ?? (
            name && /^[A-Z]/.test(name)
                ? { name, node: record.node, root: record.node }
                : null
        );

        if (descriptor) {
            components.push(descriptor);
            knownRoots.add(descriptor.root);
        }
    }

    if (components.length === 0 && file.isComponent) {
        components.push({
            name: componentNameFromFile(file.relative),
            node: file.ast,
            root: file.ast,
        });
    }

    return components;
}

function ownerOf(file, node, ownersByRoot, fallbackOwner = null) {
    let current = node;

    while (current) {
        if (ownersByRoot.has(current)) return ownersByRoot.get(current);
        current = file.parents.get(current);
    }

    return fallbackOwner;
}

function isWithin(file, node, ancestor) {
    let current = node;

    while (current) {
        if (current === ancestor) return true;
        current = file.parents.get(current);
    }

    return false;
}

function hasOwnedJsx(file, node, owner, jsxOwners) {
    return file.jsxElements.some((element) =>
        jsxOwners.get(element) === owner && isWithin(file, element, node));
}

function isLogicalChainChild(file, node) {
    const parent = file.parents.get(node);
    return parent?.type === 'LogicalExpression' && LOGICAL_OPERATORS.has(parent.operator);
}

function isRenderDecision(file, node, owner, jsxOwners) {
    if (node.type === 'IfStatement' || node.type === 'SwitchStatement') {
        return hasOwnedJsx(file, node, owner, jsxOwners);
    }

    if (node.type === 'ConditionalExpression') {
        return hasOwnedJsx(file, node, owner, jsxOwners);
    }

    if (
        node.type === 'LogicalExpression'
        && LOGICAL_OPERATORS.has(node.operator)
        && !isLogicalChainChild(file, node)
    ) {
        return hasOwnedJsx(file, node, owner, jsxOwners);
    }

    return false;
}

function isElseIf(file, node) {
    const parent = file.parents.get(node);
    return node.type === 'IfStatement' && parent?.type === 'IfStatement' && parent.alternate === node;
}

function decisionLabel(node) {
    return node.type === 'LogicalExpression'
        ? `${node.type}(${node.operator})`
        : node.type;
}

function decisionNesting(file, node, owner, relevantDecisions) {
    const path = [];
    let current = node;

    while (current) {
        if (relevantDecisions.has(current) && !isElseIf(file, current)) {
            path.push(decisionLabel(current));
        }
        if (current === owner.root) break;
        current = file.parents.get(current);
    }

    path.reverse();
    return { depth: path.length, path };
}

export function analyzeRenderDecisionDepthInventory(inventory) {
    const details = [];

    for (const file of inventory.files) {
        const components = componentDescriptors(file);
        if (components.length === 0) continue;

        const ownersByRoot = new Map(components.map((component) => [component.root, component]));
        const fallbackOwner = components.length === 1 && components[0].root === file.ast
            ? components[0]
            : null;
        const jsxOwners = new Map(file.jsxElements.map((element) => [
            element,
            ownerOf(file, element, ownersByRoot, fallbackOwner),
        ]));
        const relevantDecisions = new Map();

        for (const node of file.nodes) {
            const owner = ownerOf(file, node, ownersByRoot, fallbackOwner);
            if (!owner) continue;
            if (isRenderDecision(file, node, owner, jsxOwners)) {
                relevantDecisions.set(node, owner);
            }
        }

        const byOwner = new Map(components.map((component) => [component, {
            file: file.relative,
            component: component.name,
            componentNode: component.node,
            maxDecisionDepth: 0,
            decisionCount: 0,
            deepestDecisionNode: null,
            deepestDecision: null,
            decisionPath: [],
        }]));

        for (const [node, owner] of relevantDecisions) {
            const detail = byOwner.get(owner);
            detail.decisionCount += 1;
            const nesting = decisionNesting(file, node, owner, relevantDecisions);

            if (nesting.depth > detail.maxDecisionDepth) {
                detail.maxDecisionDepth = nesting.depth;
                detail.deepestDecisionNode = node;
                detail.deepestDecision = decisionLabel(node);
                detail.decisionPath = nesting.path;
            }
        }

        details.push(...byOwner.values());
    }

    return details.sort((left, right) =>
        left.file.localeCompare(right.file)
        || (left.componentNode?.range?.[0] ?? 0) - (right.componentNode?.range?.[0] ?? 0));
}
