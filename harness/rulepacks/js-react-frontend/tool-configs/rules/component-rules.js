export const businessJsxMaxDepthRule = {
    meta: {
        type: 'suggestion',
        schema: [{
            type: 'object',
            additionalProperties: false,
            properties: {
                max: { type: 'integer', minimum: 1 },
                transparent_wrappers: { type: 'array', items: { type: 'string' } },
            },
        }],
        messages: {
            jsxTooDeep: 'JSX nesting should not exceed {{max}} levels (business-logic depth, ignoring transparent wrappers).',
        },
    },
    create(context) {
        const options = context.options[0] ?? {};
        const max = options.max ?? 5;
        const transparentWrappers = new Set(options.transparent_wrappers ?? [
            'Popper', 'Portal', 'Modal', 'Backdrop',
            'ClickAwayListener', 'Fade', 'Grow', 'Zoom', 'Slide', 'Collapse',
            'Transitions',
        ]);

        function isTransparentWrapper(node) {
            if (node.type === 'JSXFragment') {
                return true;
            }

            if (node.type === 'JSXElement') {
                const name = node.openingElement.name;
                if (name.type === 'JSXIdentifier') {
                    return transparentWrappers.has(name.name);
                }
            }

            return false;
        }

        function isRenderPropCallback(node) {
            let current = node.parent;
            while (current) {
                if (current.type === 'JSXExpressionContainer' && current.parent?.type === 'JSXElement') {
                    if (
                        current.expression.type === 'ArrowFunctionExpression'
                        || current.expression.type === 'FunctionExpression'
                    ) {
                        return true;
                    }
                }
                current = current.parent;
            }
            return false;
        }

        function getBusinessJsxDepth(node) {
            let depth = 0;
            let current = node;

            while (current) {
                if (
                    (current.type === 'JSXElement' || current.type === 'JSXFragment')
                    && !isTransparentWrapper(current)
                ) {
                    depth += 1;
                }

                current = current.parent;
            }

            return depth;
        }

        return {
            JSXElement(node) {
                if (isRenderPropCallback(node)) {
                    return;
                }

                const depth = getBusinessJsxDepth(node);

                if (depth <= max) {
                    return;
                }

                let parent = node.parent;
                let parentDepth = 0;
                while (parent) {
                    if (
                        (parent.type === 'JSXElement' || parent.type === 'JSXFragment')
                        && !isTransparentWrapper(parent)
                    ) {
                        parentDepth += 1;
                    }
                    parent = parent.parent;
                }

                if (parentDepth > max) {
                    return;
                }

                context.report({
                    node,
                    messageId: 'jsxTooDeep',
                    data: { max: String(max) },
                });
            },
        };
    },
};
