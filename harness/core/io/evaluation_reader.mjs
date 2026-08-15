import { createHash } from 'node:crypto';
import fs from 'node:fs';

import { assertEvaluationSchema } from '../contracts/evaluation_contract.mjs';

// Hash raw artifact text so references remain content-addressed and immutable.
function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Read, parse, schema-validate, and hash one comparison artifact.
 * Returning the parsed evaluation together with its content identity prevents
 * downstream code from reopening or interpreting the file differently.
 */
export function readEvaluationArtifact(evaluationPath, label) {
  if (!evaluationPath || !fs.existsSync(evaluationPath)) {
    throw new Error(`[Harness Error] ${label} artifact not found: ${evaluationPath}`);
  }

  const raw = fs.readFileSync(evaluationPath, 'utf8');
  let evaluation;

  try {
    evaluation = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `[Harness Error] ${label} artifact is invalid JSON: ${error.message}`,
    );
  }

  assertEvaluationSchema(evaluation, `${label} artifact`);

  return {
    path: evaluationPath,
    sha256: sha256(raw),
    evaluation,
  };
}
