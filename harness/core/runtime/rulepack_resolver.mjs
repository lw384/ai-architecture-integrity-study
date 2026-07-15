// Input: subject or cross-stack rulepack identifiers plus the rulepacks root directory.
// Output: resolved rulepack contexts with directory, manifest path, and parsed manifest data.
import Ajv from 'ajv';
import fs from 'node:fs';
import path from 'node:path';
import { load } from 'js-yaml';

const ajv = new Ajv({ allErrors: true, strict: false });
const rulepackSchema = JSON.parse(
    fs.readFileSync(new URL('../contracts/rulepack.schema.json', import.meta.url), 'utf8'),
);
const validateRulepackSchema = ajv.compile(rulepackSchema);

// Validate that a parsed value is a plain object.
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

// Flatten all declared rule paths from rules_matrix or rules.
function collectRulePaths(manifest) {
    if (manifest.rules_matrix) {
        return Object.values(manifest.rules_matrix).flatMap((entry) => [
            ...(entry.constraints ?? []),
            ...(entry.metrics ?? []),
            ...(entry.judgments ?? []),
        ]);
    }

    return [
        ...(manifest.rules?.constraints ?? []),
        ...(manifest.rules?.metrics ?? []),
        ...(manifest.rules?.judgments ?? []),
    ];
}

// Ensure that a referenced file exists on disk.
function assertFileExists(filePath, label) {
    if (!fs.existsSync(filePath)) {
        throw new Error(`[Harness Error] ${label} not found at ${filePath}`);
    }
}

// Resolve the on-disk directory for one rulepack ID.
export function resolveRulepackDirectory(rulepacksRoot, rulepackId) {
    const rulepackDir = path.join(rulepacksRoot, rulepackId);

    if (!fs.existsSync(rulepackDir)) {
        throw new Error(`[Harness Error] Rulepack directory not found at ${rulepackDir}`);
    }

    return rulepackDir;
}

// Read one rulepack manifest from disk.
export function readRulepackManifest(manifestPath) {
    assertFileExists(manifestPath, 'Rulepack manifest');

    const manifest = load(fs.readFileSync(manifestPath, 'utf8'));
    ensurePlainObject(manifest, `Rulepack manifest at ${manifestPath}`);

    return manifest;
}

// Validate the manifest against the rulepack JSON schema.
export function assertRulepackSchema(manifest) {
    const isValid = validateRulepackSchema(manifest);

    if (!isValid) {
        throw new Error(
            `[Harness Error] Rulepack manifest failed schema validation: ${formatSchemaErrors(validateRulepackSchema.errors)}`,
        );
    }
}

// Validate resolver-level consistency beyond schema shape.
export function assertResolvedRulepackConsistency({
    rulepackId,
    expectedVersion,
    rulepackDir,
    manifestPath,
    manifest,
}) {
    if (manifest.rulepack_id !== rulepackId) {
        throw new Error(
            `[Harness Error] Rulepack ID mismatch. Expected ${rulepackId}, received ${manifest.rulepack_id}.`,
        );
    }

    if (expectedVersion && manifest.version !== expectedVersion) {
        throw new Error(
            `[Harness Error] Rulepack version mismatch for ${rulepackId}. Expected ${expectedVersion}, received ${manifest.version}.`,
        );
    }

    for (const [adapterId, adapterDeclaration] of Object.entries(manifest.adapters ?? {})) {
        const configPath = path.resolve(rulepackDir, adapterDeclaration.config);
        assertFileExists(configPath, `Adapter config for ${adapterId}`);
    }

    for (const relativeRulePath of collectRulePaths(manifest)) {
        const rulePath = path.resolve(rulepackDir, relativeRulePath);
        assertFileExists(rulePath, `Rule declaration referenced by ${manifestPath}`);
    }
}

// Resolve one rulepack ID into a parsed rulepack context.
export function resolveRulepack({ rulepackId, expectedVersion, rulepacksRoot }) {
    const rulepackDir = resolveRulepackDirectory(rulepacksRoot, rulepackId);
    const manifestPath = path.join(rulepackDir, 'manifest.yaml');
    const manifest = readRulepackManifest(manifestPath);
    assertRulepackSchema(manifest);
    assertResolvedRulepackConsistency({
        rulepackId,
        expectedVersion,
        rulepackDir,
        manifestPath,
        manifest,
    });

    return {
        rulepackId,
        rulepackDir,
        manifestPath,
        manifest,
        kind: manifest.kind,
        version: manifest.version,
        adapters: manifest.adapters,
        ruleSources: collectRulePaths(manifest),
        metadata: manifest.metadata ?? {},
    };
}

// Resolve all subject rulepacks declared by the task config.
export function resolveSubjectRulepacks({ subjects, rulepacksRoot }) {
    return subjects.map((subject) => ({
        subjectId: subject.subject_id,
        ...resolveRulepack({
            rulepackId: subject.rulepack_id,
            expectedVersion: subject.rulepack_version,
            rulepacksRoot,
        }),
    }));
}

// Resolve the optional cross-stack rulepack declared by the task config.
export function resolveCrossStackRulepack({ crossStackConfig, rulepacksRoot }) {
    if (!crossStackConfig) {
        return null;
    }

    return resolveRulepack({
        rulepackId: crossStackConfig.rulepack_id,
        expectedVersion: crossStackConfig.rulepack_version,
        rulepacksRoot,
    });
}
