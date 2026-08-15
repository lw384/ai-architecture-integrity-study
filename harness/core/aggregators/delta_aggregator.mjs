// Index normalized metric or judgment results by their stable scope-qualified key.
function indexByKey(results) {
  return new Map(results.map((result) => [result.key, result]));
}

// Compare scored post results with their source values without inventing missing data.
function compareScoredLayer(fromResults, toResults) {
  const fromByKey = indexByKey(fromResults);

  return toResults.map((toResult) => {
    const fromResult = fromByKey.get(toResult.key);
    const comparable =
      typeof fromResult?.value === 'number' &&
      typeof toResult.value === 'number';

    return {
      key: toResult.key,
      name: toResult.name,
      scope: toResult.scope,
      from: fromResult?.value ?? null,
      to: toResult.value,
      delta: comparable ? toResult.value - fromResult.value : null,
      direction: toResult.direction,
      status: comparable ? 'available' : 'unavailable',
    };
  });
}

// Preserve duplicate findings by grouping each fingerprint into a multiset bucket.
function groupFindings(findings) {
  const groups = new Map();

  for (const finding of findings) {
    const group = groups.get(finding.fingerprint) ?? [];
    group.push(finding);
    groups.set(finding.fingerprint, group);
  }

  return groups;
}

// Remove the internal fingerprint before publishing a finding in a delta artifact.
function publicFinding(finding) {
  const { fingerprint, ...visibleFields } = finding;
  return visibleFields;
}

// Compute introduced, resolved, and unchanged findings using multiset semantics.
function compareConstraints(fromFindings, toFindings) {
  const fromGroups = groupFindings(fromFindings);
  const toGroups = groupFindings(toFindings);
  const introduced = [];
  const resolved = [];
  let unchangedCount = 0;

  for (const fingerprint of new Set([...fromGroups.keys(), ...toGroups.keys()])) {
    const before = fromGroups.get(fingerprint) ?? [];
    const after = toGroups.get(fingerprint) ?? [];
    const unchanged = Math.min(before.length, after.length);

    unchangedCount += unchanged;
    introduced.push(...after.slice(unchanged).map(publicFinding));
    resolved.push(...before.slice(unchanged).map(publicFinding));
  }

  return {
    before_count: fromFindings.length,
    after_count: toFindings.length,
    introduced_count: introduced.length,
    resolved_count: resolved.length,
    unchanged_count: unchangedCount,
    net_change: toFindings.length - fromFindings.length,
    introduced,
    resolved,
  };
}

// Compare every normalized layer between two evaluation snapshots.
function compareSnapshots(fromSnapshot, toSnapshot) {
  return {
    constraints: compareConstraints(
      fromSnapshot.constraints,
      toSnapshot.constraints,
    ),
    metrics: compareScoredLayer(fromSnapshot.metrics, toSnapshot.metrics),
    judgments: compareScoredLayer(
      fromSnapshot.judgments,
      toSnapshot.judgments,
    ),
  };
}

/**
 * Produce both task-local (pre to post) and cumulative (baseline to post) deltas.
 */
export function calculateDeltas({ baselineSnapshot, preSnapshot, postSnapshot }) {
  return {
    run_local: compareSnapshots(preSnapshot, postSnapshot),
    trajectory_cumulative: compareSnapshots(baselineSnapshot, postSnapshot),
  };
}
