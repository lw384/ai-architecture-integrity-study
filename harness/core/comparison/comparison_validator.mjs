// import path from 'node:path'; // Redundant after artifact identity switched to SHA-256.

import { readEvaluationArtifact } from '../io/evaluation_reader.mjs';

// Require a comparison artifact to use the current measurement definition.
function assertCompatibleProfile(artifact, expectedProfileHash, label) {
  const actualProfileHash = artifact.evaluation.evaluation_profile_hash;
  if (actualProfileHash !== expectedProfileHash) {
    throw new Error(
      `[Harness Error] ${label} evaluation profile mismatch. ` +
        `Expected ${expectedProfileHash}, received ${actualProfileHash}`,
    );
  }
}

// Reject artifacts produced by incomplete analyzers or invalid comparisons.
function assertUsableArtifact(artifact, label) {
  if (artifact.evaluation.execution_status !== 'completed') {
    throw new Error(
      `[Harness Error] ${label} evaluation is not complete: ` +
        artifact.evaluation.execution_status,
    );
  }
  if (artifact.evaluation.comparison_status !== 'valid') {
    throw new Error(
      `[Harness Error] ${label} evaluation has invalid comparison metadata`,
    );
  }
}

// Read one artifact and apply all common comparison-input validations.
function readAndValidate(pathValue, label, expectedProfileHash) {
  const artifact = readEvaluationArtifact(pathValue, label);
  assertUsableArtifact(artifact, label);
  assertCompatibleProfile(artifact, expectedProfileHash, label);
  return artifact;
}

/**
 * Load baseline and pre artifacts for trajectory mode.
 * Baseline must be a self evaluation; a distinct pre artifact must identify
 * the exact commit supplied as the current run's pre state.
 */
export function loadComparisonArtifacts(runtimeOptions, expectedProfileHash) {
  if (runtimeOptions.comparisonMode === 'self') {
    return { baseline: null, pre: null };
  }

  const baseline = readAndValidate(
    runtimeOptions.baselineEvaluationPath,
    'Baseline',
    expectedProfileHash,
  );
  const pre = readAndValidate(
    runtimeOptions.preEvaluationPath,
    'Pre',
    expectedProfileHash,
  );

  const sameArtifact = baseline.sha256 === pre.sha256;
  if (!sameArtifact && pre.evaluation.target.post_commit !== runtimeOptions.preCommit) {
    throw new Error(
      '[Harness Error] Pre evaluation commit mismatch. ' +
        `Expected ${runtimeOptions.preCommit}, received ` +
        pre.evaluation.target.post_commit,
    );
  }

  if (baseline.evaluation.comparison.mode !== 'self') {
    throw new Error('[Harness Error] Baseline evaluation must use self comparison mode');
  }

  return { baseline, pre };
}

// Reduce a loaded artifact to the immutable identity stored in comparison metadata.
export function describeArtifact(artifact) {
  return {
    path: artifact?.path ?? null,
    sha256: artifact?.sha256 ? `sha256:${artifact.sha256}` : null,
    run_id: artifact.evaluation.run_id,
    post_commit: artifact.evaluation.target.post_commit,
  };
}
