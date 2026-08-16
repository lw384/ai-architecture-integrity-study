// BE-TEST-C-001/BE-SIZE-C-001: services must obtain repositories through dependency injection
// (not direct construction), and production methods must not exceed the parameter limit.
import { expressionName, walkAst } from '../project.mjs';
import { expressionType, importedSymbol, layerOf, violation } from './shared.mjs';

export function analyzeTestabilityAndSize(project) {
    const findings = [];

    for (const file of project.files) {
        if (/\.service\.[cm]?[jt]s$/.test(file.relative)) {
            walkAst(file.ast, (node) => {
                if (node.type === 'NewExpression') {
                    const binding = importedSymbol(file, node.callee);
                    const name = expressionName(node.callee)?.split('.').pop() ?? '';
                    const edge = binding ? file.imports.find((item) => item.source === binding.source) : null;
                    const target = edge?.resolved ? project.byPath.get(edge.resolved) : null;
                    const repository = binding?.imported === 'Repository'
                        || /Repository$/.test(binding?.imported ?? name)
                        || layerOf(target?.relative ?? '') === 'repository';

                    if (repository) {
                        findings.push(violation('BE-TEST-C-001', file, node, {
                            constructed_symbol: name,
                            import_source: binding?.source ?? null,
                            message: 'Services must obtain repositories through dependency injection.',
                        }));
                    }
                }

                if (
                    node.type === 'CallExpression'
                    && expressionName(node.callee) === 'Reflect.construct'
                    && /Repository$/.test(expressionType(file, node.arguments?.[0]) ?? '')
                ) {
                    findings.push(violation('BE-TEST-C-001', file, node, {
                        constructed_symbol: expressionType(file, node.arguments?.[0]),
                        import_source: null,
                        message: 'Services must obtain repositories through dependency injection.',
                    }));
                }
            });
        }

        if (/\.(?:controller|service|repository)\.[cm]?[jt]s$/.test(file.relative)) {
            walkAst(file.ast, (node) => {
                if (node.type !== 'MethodDefinition' || node.kind === 'constructor') return;
                const count = node.value?.params?.length ?? 0;
                if (count <= 3) return;
                findings.push(violation('BE-SIZE-C-001', file, node.key ?? node, {
                    method: node.key?.name ?? '<computed>',
                    parameter_count: count,
                    maximum: 3,
                    message: 'Production methods may have at most three direct parameters.',
                }));
            });
        }
    }

    return findings;
}
