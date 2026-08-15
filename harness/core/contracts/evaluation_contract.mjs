import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import fs from 'node:fs';

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

const evaluationSchema = JSON.parse(
  fs.readFileSync(new URL('./evaluation.schema.json', import.meta.url), 'utf8'),
);
const validateEvaluation = ajv.compile(evaluationSchema);

// Render all Ajv failures as one readable Harness error message.
function formatSchemaErrors(errors = []) {
  return errors
    .map((error) => `${error.instancePath || '/'} ${error.message}`.trim())
    .join('; ');
}

// Enforce the single supported Evaluation v0.2 contract at read and write boundaries.
export function assertEvaluationSchema(evaluationData, label = 'Evaluation') {
  if (validateEvaluation(evaluationData)) {
    return;
  }

  throw new Error(
    `[Harness Error] ${label} failed schema validation: ` +
      formatSchemaErrors(validateEvaluation.errors),
  );
}
