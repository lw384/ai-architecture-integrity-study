import {
    DEFAULT_IGNORED_STRUCTURE_FILES,
    DEFAULT_TRANSPARENT_JSX_WRAPPERS,
    getEffectiveJsxPosition,
    isIgnoredStructureFile,
} from '../jsx-depth-utils.js';

export const businessJsxMaxDepthRule = {
    meta: {
        type: 'suggestion',
        schema: [{
            type: 'object',
            additionalProperties: false,
            properties: {
                max: { type: 'integer', minimum: 1 },
                transparent_wrappers: { type: 'array', items: { type: 'string' } },
                ignored_file_patterns: { type: 'array', items: { type: 'string' } },
            },
        }],
        messages: {
            jsxTooDeep: 'Render tree reaches {{actual}} effective JSX levels; the allowed maximum is {{max}}.',
        },
    },
    create(context) {
        const options = context.options[0] ?? {};
        const max = options.max ?? 5;
        const transparentWrappers = new Set(options.transparent_wrappers ?? DEFAULT_TRANSPARENT_JSX_WRAPPERS);
        const ignoredFilePatterns = options.ignored_file_patterns ?? DEFAULT_IGNORED_STRUCTURE_FILES;
        const filename = context.filename ?? context.getFilename();

        if (filename === '<input>' || isIgnoredStructureFile(filename, ignoredFilePatterns)) {
            return {};
        }

        const renderTrees = new Map();

        return {
            JSXElement(node) {
                const { depth, root } = getEffectiveJsxPosition(node, transparentWrappers);
                const currentMaximum = renderTrees.get(root);

                if (!currentMaximum || depth > currentMaximum.depth) {
                    renderTrees.set(root, { depth, node });
                }
            },
            'Program:exit'() {
                for (const { depth, node } of renderTrees.values()) {
                    if (depth > max) {
                        context.report({
                            node,
                            messageId: 'jsxTooDeep',
                            data: {
                                actual: String(depth),
                                max: String(max),
                            },
                        });
                    }
                }
            },
        };
    },
};
