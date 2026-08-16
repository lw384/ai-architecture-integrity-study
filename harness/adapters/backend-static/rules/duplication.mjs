// BE-DUP-C-001/002/003: each normalized business resource has one owner, deterministic
// policy constants/functions have one authoritative implementation, and equivalent
// production functions must not be copy-pasted.
import path from 'node:path';
import { decoratorName, evaluateStatic, sourceText, walkAst } from '../project.mjs';
import { findModuleDecorator, moduleParts, violation } from './shared.mjs';

const POLICY_NAME_RE = /(?:allowed|valid|transition|policy|invariant)|^(?:can|may|is|validate|assert|ensure|check)/i;

function normalizeResource(value, aliases = {}) {
    let normalized = String(value ?? '')
        .replace(/^\/+|\/+$/g, '')
        .split('/')
        .filter((segment) => !/^v\d+$/i.test(segment))
        .pop() ?? '';
    normalized = normalized
        .replace(/\.(?:module|controller|entity)$/i, '')
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .replace(/_/g, '-')
        .toLowerCase();
    if (normalized.endsWith('ies')) normalized = `${normalized.slice(0, -3)}y`;
    else if (normalized.endsWith('s') && !normalized.endsWith('ss')) normalized = normalized.slice(0, -1);
    return aliases[normalized] ?? normalized;
}

function firstDecoratorValue(file, classNode, name) {
    const decorator = (classNode.decorators ?? []).find((item) => decoratorName(item) === name);
    const call = decorator?.expression?.type === 'CallExpression' ? decorator.expression : null;
    return call ? evaluateStatic(file, call.arguments?.[0]) : undefined;
}

export function analyzeResourceOwners(project, config) {
    const findings = [];
    const groups = new Map();
    const aliases = config.resource_aliases ?? {};

    function add(kind, key, version, file, node, owner) {
        const groupKey = `${kind}:${normalizeResource(key, aliases)}:${version ?? ''}`;
        if (!groups.has(groupKey)) groups.set(groupKey, []);
        groups.get(groupKey).push({ kind, key: normalizeResource(key, aliases), version, file, node, owner });
    }

    for (const file of project.files) {
        const parts = moduleParts(file.relative);
        if (!parts) continue;

        if (/\.module\.ts$/.test(file.relative)) {
            add('module', path.basename(file.relative, '.module.ts'), null, file, findModuleDecorator(file) ?? file.ast, parts.owner);
        }

        if (/\.controller\.ts$/.test(file.relative)) {
            for (const classNode of file.classes) {
                const route = firstDecoratorValue(file, classNode, 'Controller');
                if (typeof route !== 'string') continue;
                const version = route.split('/').find((segment) => /^v\d+$/i.test(segment)) ?? null;
                add('controller-route', route, version, file, classNode, parts.owner);
            }
        }

        if (/\.entity\.ts$/.test(file.relative)) {
            for (const classNode of file.classes) {
                const table = firstDecoratorValue(file, classNode, 'Entity') ?? classNode.id?.name;
                if (table) add('entity-table', table, null, file, classNode, parts.owner);
            }
        }
    }

    for (const owners of groups.values()) {
        const first = owners[0];

        for (const duplicate of owners.slice(1)) {
            if (duplicate.file.relative === first.file.relative) continue;
            findings.push(violation('BE-DUP-C-001', duplicate.file, duplicate.node, {
                resource_key: duplicate.key,
                artifact_kind: duplicate.kind,
                first_owner: first.owner,
                duplicate_owner: duplicate.owner,
                first_file: first.file.relative,
                message: `Business resource ${duplicate.key} has competing ${duplicate.kind} owners.`,
            }));
        }
    }

    return findings;
}

function canonicalAst(node, parameterNames = new Map()) {
    // Exact normalized fingerprints avoid the false positives of fuzzy similarity.
    if (!node || typeof node !== 'object') return node;
    if (Array.isArray(node)) return node.map((item) => canonicalAst(item, parameterNames));

    if (node.type === 'Identifier' && parameterNames.has(node.name)) {
        return { type: 'Identifier', name: parameterNames.get(node.name) };
    }

    const result = {};
    for (const [key, value] of Object.entries(node)) {
        if (['loc', 'range', 'parent', 'tokens', 'comments', 'decorators', 'typeAnnotation', 'returnType'].includes(key)) continue;
        result[key] = canonicalAst(value, parameterNames);
    }
    return result;
}

function functionFingerprint(node) {
    const params = node.params ?? node.value?.params ?? [];
    const parameterNames = new Map();
    params.forEach((param, index) => {
        const subject = param.type === 'TSParameterProperty' ? param.parameter : param;
        if (subject?.type === 'Identifier') parameterNames.set(subject.name, `p${index}`);
    });
    const body = node.body ?? node.value?.body;
    return JSON.stringify(canonicalAst(body, parameterNames));
}

export function analyzePolicyAndCodeDuplication(project) {
    const findings = [];
    const policies = new Map();
    const functions = new Map();

    function register(map, key, entry, ruleId, payload) {
        if (!map.has(key)) {
            map.set(key, entry);
            return;
        }

        const first = map.get(key);
        if (first.file.relative === entry.file.relative) return;
        findings.push(violation(ruleId, entry.file, entry.node, {
            ...payload,
            first_file: first.file.relative,
        }));
    }

    for (const file of project.files) {
        walkAst(file.ast, (node) => {
            if (node.type === 'VariableDeclarator' && node.id?.type === 'Identifier' && POLICY_NAME_RE.test(node.id.name)) {
                if (!['ArrayExpression', 'ObjectExpression', 'NewExpression'].includes(node.init?.type)) return;
                const fingerprint = JSON.stringify(canonicalAst(node.init));
                const key = `constant:${node.id.name.toLowerCase()}:${fingerprint}`;
                register(policies, key, { file, node }, 'BE-DUP-C-002', {
                    policy_key: node.id.name,
                    implementation_kind: 'policy-constant',
                    message: `Policy ${node.id.name} has more than one authoritative implementation.`,
                });
            }

            const functionLike = ['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(node.type)
                || (node.type === 'MethodDefinition' && node.kind !== 'constructor');
            if (!functionLike) return;

            const name = node.id?.name ?? node.key?.name ?? null;
            const body = node.body ?? node.value?.body;
            const statements = body?.body ?? [];
            if (!body || statements.length === 0) return;
            const fingerprint = functionFingerprint(node);

            if (name && POLICY_NAME_RE.test(name)) {
                register(policies, `function:${name.toLowerCase()}:${fingerprint}`, { file, node }, 'BE-DUP-C-002', {
                    policy_key: name,
                    implementation_kind: 'policy-function',
                    message: `Policy ${name} has more than one authoritative implementation.`,
                });
                return;
            }

            if (sourceText(file, body).replace(/\s+/g, '').length < 24) return;
            register(functions, fingerprint, { file, node }, 'BE-DUP-C-003', {
                implementation_kind: 'function',
                function_name: name,
                message: 'Equivalent production functions must reuse one shared implementation.',
            });
        });
    }

    return findings;
}
