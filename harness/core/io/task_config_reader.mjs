// Input: a task config YAML path.
// Output: a normalized task config object ready for planning.
import Ajv from 'ajv';
import fs from 'node:fs';
import { load } from 'js-yaml';

const ajv = new Ajv({ allErrors: true, strict: false });
const taskConfigSchema = JSON.parse(
    fs.readFileSync(new URL('../contracts/task_config.schema.json', import.meta.url), 'utf8'),
);
const validateTaskConfigSchema = ajv.compile(taskConfigSchema);

// Validate that a value is a plain object.
function ensurePlainObject(value, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`[Harness Error] ${label} must be an object.`);
    }
}

// Format Ajv validation errors into one readable message.
function formatSchemaErrors(errors = []) {
    return errors
        .map((error) => `${error.instancePath || '/'} ${error.message}`.trim())
        .join('; ');
}

// Parse the task config YAML file.
function parseTaskConfigFile(taskConfigPath) {
    const raw = fs.readFileSync(taskConfigPath, 'utf8');
    const config = load(raw);

    ensurePlainObject(config, 'Task config');

    return config;
}

// Validate the raw task config against the JSON schema.
function assertTaskConfigSchema(config) {
    const isValid = validateTaskConfigSchema(config);

    if (!isValid) {
        throw new Error(
            `[Harness Error] Task config failed schema validation: ${formatSchemaErrors(validateTaskConfigSchema.errors)}`,
        );
    }
}

// Normalize enabled rule lists across all layers.
function normalizeRuleSelection(enabled = {}) {
    return {
        constraints: Array.isArray(enabled.constraints) ? enabled.constraints : [],
        metrics: Array.isArray(enabled.metrics) ? enabled.metrics : [],
        judgments: Array.isArray(enabled.judgments) ? enabled.judgments : [],
    };
}

// Normalize an optional diff scope list.
function normalizeDiffScope(expectedDiffScope) {
    return Array.isArray(expectedDiffScope) ? expectedDiffScope : [];
}

// Validate the required top-level task config fields.
function validateTaskConfigShape(config) {
    if (!config.task_id) {
        throw new Error('[Harness Error] Task config is missing task_id.');
    }

    if (!Array.isArray(config.evaluation_scopes) || config.evaluation_scopes.length === 0) {
        throw new Error('[Harness Error] Task config must define at least one evaluation scope.');
    }
}

// Validate the required fields and identity of one evaluation scope.
function validateScopeShape(scope, seenScopeIds) {
    ensurePlainObject(scope, 'Each evaluation scope');

    if (!scope.scope_id || !scope.scope_type || !scope.root_path || !scope.rulepack_id) {
        throw new Error(
            '[Harness Error] Each evaluation scope must define scope_id, scope_type, root_path, and rulepack_id.',
        );
    }

    if (seenScopeIds.has(scope.scope_id)) {
        throw new Error(`[Harness Error] Duplicate evaluation scope ID: ${scope.scope_id}.`);
    }

    seenScopeIds.add(scope.scope_id);
}

// Normalize one rule execution scope.
function normalizeRuleScope(scope = {}) {
    return {
        ...scope,
        enabled: normalizeRuleSelection(scope.enabled),
        thresholds: scope.thresholds ?? {},
        expected_diff_scope: normalizeDiffScope(scope.expected_diff_scope),
        metadata: scope.metadata ?? {},
    };
}

// Normalize all scopes and reject duplicate IDs before planning.
function normalizeEvaluationScopes(scopes) {
    const seenScopeIds = new Set();
    return scopes.map((scope) => {
        validateScopeShape(scope, seenScopeIds);
        return normalizeRuleScope(scope);
    });
}

// Read and normalize the task config from YAML.
export function readTaskConfig(taskConfigPath) {
    if (!fs.existsSync(taskConfigPath)) {
        throw new Error(`[Harness Error] Task config not found at ${taskConfigPath}`);
    }

    const config = parseTaskConfigFile(taskConfigPath);
    assertTaskConfigSchema(config);
    validateTaskConfigShape(config);

    return {
        ...config,
        evaluation_scopes: normalizeEvaluationScopes(config.evaluation_scopes),
        judgment_config: config.judgment_config ?? null,
        execution: config.execution ?? {},
        metadata: config.metadata ?? {},
    };
}
