// BE-ROUTE-C-001: public backend routes must resolve under the global /api prefix and use
// kebab-case path segments in controller and method decorators.
import { decoratorName, evaluateStatic, expressionName, walkAst } from '../project.mjs';
import { violation } from './shared.mjs';

const HTTP_DECORATORS = new Set(['Get', 'Post', 'Put', 'Patch', 'Delete', 'Options', 'Head', 'All']);

// Exported so computed-metrics/implementations/backend/backend-source-analysis.mjs can reuse
// the exact same kebab-case rules (including version-segment and wildcard passthroughs)
// instead of maintaining a second, drifting copy.
export function isKebabRoute(value) {
    if (typeof value !== 'string') return false;
    const segments = value.trim().replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
    return segments.every((segment) => {
        if (/^v\d+$/i.test(segment)) return true;
        if (segment.startsWith(':')) return /^[A-Za-z][A-Za-z0-9_]*$/.test(segment.slice(1));
        if (segment === '*' || /^\{\*[A-Za-z][A-Za-z0-9_]*\}$/.test(segment)) return true;
        return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(segment);
    });
}

function routeValues(file, node) {
    const value = evaluateStatic(file, node);
    if (typeof value === 'string') return [value];
    if (Array.isArray(value) && value.every((item) => typeof item === 'string')) return value;
    return [];
}

export function analyzeRoutes(project) {
    const findings = [];
    const controllers = project.files.filter((file) => /\.controller\.[cm]?[jt]s$/.test(file.relative));
    const main = project.files.find((file) => file.relative === 'src/main.ts');
    let prefix = null;
    let prefixNode = main?.ast ?? null;
    let prefixExclusions = [];

    if (main) {
        walkAst(main.ast, (node) => {
            if (
                node.type === 'CallExpression'
                && /(?:^|\.)setGlobalPrefix$/.test(expressionName(node.callee) ?? '')
            ) {
                prefixNode = node;
                prefix = evaluateStatic(main, node.arguments?.[0]);
                const options = evaluateStatic(main, node.arguments?.[1]);
                prefixExclusions = Array.isArray(options?.exclude) ? options.exclude : [];
            }
        });
    }

    if (controllers.length > 0 && String(prefix ?? '').replace(/^\/+|\/+$/g, '') !== 'api') {
        const subject = main ?? controllers[0];
        findings.push(violation('BE-ROUTE-C-001', subject, prefixNode ?? subject.ast, {
            issue: 'global-prefix',
            resolved_prefix: prefix ?? null,
            message: 'Public routes must use the global /api prefix.',
        }));
    }

    if (prefixExclusions.length > 0 && main) {
        findings.push(violation('BE-ROUTE-C-001', main, prefixNode, {
            issue: 'prefix-exclusion',
            excluded_routes: prefixExclusions,
            message: 'Public routes must not be excluded from the global /api prefix.',
        }));
    }

    for (const file of controllers) {
        walkAst(file.ast, (node) => {
            if (node.type !== 'Decorator') return;
            const name = decoratorName(node);
            if (name !== 'Controller' && !HTTP_DECORATORS.has(name)) return;
            const call = node.expression?.type === 'CallExpression' ? node.expression : null;
            if (!call || call.arguments.length === 0) return;
            const values = routeValues(file, call.arguments[0]);

            for (const value of values) {
                if (!isKebabRoute(value)) {
                    findings.push(violation('BE-ROUTE-C-001', file, call.arguments[0], {
                        issue: name === 'Controller' ? 'controller-path' : 'method-path',
                        decorator: name,
                        path: value,
                        message: `Route path ${value} must use kebab-case segments.`,
                    }));
                }
            }
        });
    }

    return findings;
}
