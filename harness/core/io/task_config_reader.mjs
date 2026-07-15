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

    if (!Array.isArray(config.subjects) || config.subjects.length === 0) {
        throw new Error('[Harness Error] Task config must define at least one subject.');
    }
}

// Validate the required fields for one subject block.
function validateSubjectShape(subject) {
    ensurePlainObject(subject, 'Each subject');

    if (!subject.subject_id || !subject.root_path || !subject.rulepack_id) {
        throw new Error('[Harness Error] Each subject must define subject_id, root_path, and rulepack_id.');
    }
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

// Normalize one subject block from the task config.
function normalizeSubject(subject) {
    validateSubjectShape(subject);

    return normalizeRuleScope(subject);
}

// Normalize the optional cross-stack block.
function normalizeCrossStackConfig(crossStackConfig) {
    if (!crossStackConfig) {
        return null;
    }
    return normalizeRuleScope(crossStackConfig);
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
        subjects: config.subjects.map(normalizeSubject),
        cross_stack: normalizeCrossStackConfig(config.cross_stack),
        judgment_config: config.judgment_config ?? null,
        execution: config.execution ?? {},
        metadata: config.metadata ?? {},
    };
}
