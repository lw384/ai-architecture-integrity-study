// harness/core/io/evaluation_writer.mjs
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import fs from 'node:fs';
import path from 'node:path';

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const evaluationSchema = JSON.parse(
    fs.readFileSync(new URL('../contracts/evaluation.schema.json', import.meta.url), 'utf8'),
);
const validateEvaluationSchema = ajv.compile(evaluationSchema);

function formatSchemaErrors(errors = []) {
    return errors
        .map((error) => `${error.instancePath || '/'} ${error.message}`.trim())
        .join('; ');
}

function assertEvaluationSchema(evaluationData) {
    const isValid = validateEvaluationSchema(evaluationData);

    if (!isValid) {
        throw new Error(
            `[Harness Error] Evaluation failed schema validation: ${formatSchemaErrors(validateEvaluationSchema.errors)}`,
        );
    }
}

/**
 * Atomically writes a JSON file.
 * Writes to a temp file first, then renames it into place.
 */
function writeAtomically(filePath, dataObj) {
    const tempPath = `${filePath}.tmp.${Date.now()}`;
    const dir = path.dirname(filePath);

    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    // Write the full temp file first.
    fs.writeFileSync(tempPath, JSON.stringify(dataObj, null, 2), 'utf-8');

    // Atomically replace the target file.
    fs.renameSync(tempPath, filePath);
}

/**
 * Writes the evaluation result and updates the manifest.
 *
 * @param {Object} params
 * @param {string} params.evaluationPath - Target evaluation.json path.
 * @param {Object} params.evaluationData - Evaluation payload to write.
 * @param {string} params.manifestPath - Matching manifest.json path.
 */
export function writeEvaluation({ evaluationPath, evaluationData, manifestPath }) {
    // Handle re-evaluation overwrites.
    if (fs.existsSync(evaluationPath)) {
        try {
            const oldStat = fs.statSync(evaluationPath);
            // Keep the previous timestamp for traceability.
            evaluationData.re_evaluated_from = oldStat.mtime.toISOString();
            console.log(`[Harness] Overwriting existing evaluation. Marking re_evaluated_from: ${evaluationData.re_evaluated_from}`);
        } catch (err) {
            console.warn(`[Harness Warning] Failed to read old evaluation for re-eval mark: ${err.message}`);
        }
    }

    assertEvaluationSchema(evaluationData);

    // Write evaluation.json atomically.
    try {
        writeAtomically(evaluationPath, evaluationData);
        console.log(`[Harness] Successfully wrote evaluation report to ${evaluationPath}`);
    } catch (err) {
        console.error(`[Harness Error] Failed to write evaluation atomically: ${err.message}`);
        process.exit(1);
    }

    // Update the manifest atomically.
    if (manifestPath && fs.existsSync(manifestPath)) {
        try {
            const manifestRaw = fs.readFileSync(manifestPath, 'utf-8');
            const manifest = JSON.parse(manifestRaw);

            // Mark the manifest as evaluated.
            manifest.status = 'evaluated';

            // Append the event only once.
            manifest.events = manifest.events || [];
            if (!manifest.events.includes('evaluation_completed')) {
                manifest.events.push('evaluation_completed');
            }

            writeAtomically(manifestPath, manifest);
            console.log(`[Harness] Successfully updated manifest status to 'evaluated' at ${manifestPath}`);

        } catch (err) {
            console.error(`[Harness Error] Failed to update manifest atomically: ${err.message}`);
            process.exit(1);
        }
    } else {
        console.warn(`[Harness Warning] Manifest not found at ${manifestPath}, skipping manifest update.`);
    }
}