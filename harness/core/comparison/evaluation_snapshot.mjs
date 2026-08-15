// import path from 'node:path'; // Redundant after path normalization became field-based.

// Extract a comparable numeric value from either supported metric score shape.
function metricValue(metric) {
  if (typeof metric?.score === 'number') {
    return metric.score;
  }
  return typeof metric?.score?.value === 'number' ? metric.score.value : null;
}

// Normalize absolute and platform-specific paths into workspace-relative identities.
function normalizePath(value, workspacePath) {
  const normalized = value.replaceAll('\\', '/');
  const normalizedWorkspace = workspacePath?.replaceAll('\\', '/').replace(/\/$/, '');

  if (normalizedWorkspace && normalized.startsWith(`${normalizedWorkspace}/`)) {
    return normalized.slice(normalizedWorkspace.length + 1);
  }

  const subjectPath = normalized.match(/(?:^|\/)((?:backend|frontend)\/.*)$/);
  return subjectPath?.[1] ?? normalized;
}

// Normalize every recognized path field without mutating the original location.
function normalizeLocation(location, workspacePath) {
  if (!location || typeof location !== 'object') {
    return null;
  }

  const normalized = { ...location };
  for (const field of ['path', 'file', 'file_path']) {
    if (typeof normalized[field] === 'string') {
      normalized[field] = normalizePath(normalized[field], workspacePath);
    }
  }
  return normalized;
}

// Stabilize whitespace, separators, and embedded workspace paths in messages.
function normalizeMessage(message, workspacePath) {
  const compactMessage = String(message ?? '')
    .replaceAll('\\', '/')
    .replace(/\s+/g, ' ')
    .trim();
  return workspacePath
    ? compactMessage.replaceAll(workspacePath.replaceAll('\\', '/'), '<workspace>')
    : compactMessage;
}

// Serialize the fields that define one finding's comparison identity.
function findingFingerprint(finding) {
  return JSON.stringify({
    scope: finding.scope,
    rule_id: finding.rule_id,
    source_rule_id: finding.source_rule_id,
    location: finding.location,
    message: finding.message,
  });
}

// Normalize one finding and attach its internal multiset fingerprint.
function normalizeFinding(scope, finding, workspacePath) {
  const normalized = {
    scope,
    rule_id: finding.rule_id ?? 'unknown',
    source_rule_id: finding.evidence?.source_rule_id ?? null,
    location: normalizeLocation(finding.location, workspacePath),
    message: normalizeMessage(finding.message, workspacePath),
  };

  return { ...normalized, fingerprint: findingFingerprint(normalized) };
}

// Collect scope-qualified metric or judgment values for scored comparisons.
function collectMetrics(evaluation, layerName) {
  return evaluation.scopes.flatMap((scope) =>
    scope.layers[layerName].map((metric) => ({
      key: `${scope.scope_id}:${metric.name}`,
      name: metric.name,
      scope: scope.scope_id,
      value: metricValue(metric),
      direction: metric.score?.direction ?? null,
      status: metric.status,
    })),
  );
}

// Collect normalized constraint findings from every evaluation scope.
function collectConstraintFindings(evaluation) {
  const workspacePath = evaluation.target?.workspace_path ?? null;
  return evaluation.scopes.flatMap((scope) =>
    scope.layers.constraints.findings.map((finding) =>
      normalizeFinding(scope.scope_id, finding, workspacePath),
    ),
  );
}

/**
 * Convert a full evaluation into the minimal stable representation used by
 * delta calculation, removing workspace-specific and reporting-only details.
 */
export function buildEvaluationSnapshot(evaluation) {
  return {
    metrics: collectMetrics(evaluation, 'metrics'),
    judgments: collectMetrics(evaluation, 'judgments'),
    constraints: collectConstraintFindings(evaluation),
  };
}
