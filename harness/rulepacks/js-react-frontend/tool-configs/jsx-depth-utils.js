import { matchesAnyPath } from './rules/_helpers.js';

export const DEFAULT_TRANSPARENT_JSX_WRAPPERS = [
    'Popper', 'Portal', 'Modal', 'Backdrop',
    'ClickAwayListener', 'Fade', 'Grow', 'Zoom', 'Slide', 'Collapse',
    'Transitions',
];

export const DEFAULT_IGNORED_STRUCTURE_FILES = [
    '**/*.test.js',
    '**/*.test.jsx',
    '**/*.test.ts',
    '**/*.test.tsx',
    '**/*.spec.js',
    '**/*.spec.jsx',
    '**/*.spec.ts',
    '**/*.spec.tsx',
    '**/*.stories.js',
    '**/*.stories.jsx',
    '**/*.stories.ts',
    '**/*.stories.tsx',
    '**/__tests__/**',
    'src/test/**',
    '**/generated/**',
];

function getJsxName(nameNode) {
    if (nameNode?.type === 'JSXIdentifier') {
        return nameNode.name;
    }

    if (nameNode?.type === 'JSXMemberExpression') {
        const objectName = getJsxName(nameNode.object);
        const propertyName = getJsxName(nameNode.property);
        return objectName && propertyName ? `${objectName}.${propertyName}` : null;
    }

    return null;
}

function isRenderPropBoundary(node) {
    if (node?.type !== 'ArrowFunctionExpression' && node?.type !== 'FunctionExpression') {
        return false;
    }

    const expressionContainer = node.parent;
    if (expressionContainer?.type !== 'JSXExpressionContainer') {
        return false;
    }

    const containerParent = expressionContainer.parent;
    return containerParent?.type === 'JSXAttribute'
        || containerParent?.type === 'JSXElement'
        || containerParent?.type === 'JSXFragment';
}

export function isIgnoredStructureFile(filePath, ignoredPatterns = DEFAULT_IGNORED_STRUCTURE_FILES) {
    return matchesAnyPath(filePath, ignoredPatterns);
}

export function isTransparentJsxNode(node, transparentWrappers) {
    if (node?.type === 'JSXFragment') {
        return true;
    }

    if (node?.type !== 'JSXElement') {
        return false;
    }

    const elementName = getJsxName(node.openingElement?.name);
    if (elementName === 'Fragment' || elementName === 'React.Fragment') {
        return true;
    }

    return transparentWrappers.has(elementName);
}

/**
 * Return the effective depth and render-tree root for one JSX node.
 * Render-prop functions stop ancestor traversal, so their returned JSX is
 * evaluated independently instead of being ignored or added to the outer tree.
 */
export function getEffectiveJsxPosition(node, transparentWrappers) {
    let current = node;
    let depth = 0;
    let root = node;

    while (current) {
        if (isRenderPropBoundary(current)) {
            break;
        }

        if (current.type === 'JSXElement' || current.type === 'JSXFragment') {
            root = current;
            if (!isTransparentJsxNode(current, transparentWrappers)) {
                depth += 1;
            }
        }

        current = current.parent;
    }

    return { depth, root };
}
