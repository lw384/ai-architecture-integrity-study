import {
    appendBaselineDeltaFinding,
    buildMetricResult,
} from '../_shared/metric-result.mjs';

// Associated metric rule: CROSS-EP-M-001-endpoint-resolution-miss-ratio.
// Reuses CROSS-EP-C-001's own findings (unresolved call sites) together with
// cross-static's frontend_endpoint_count stat (total call sites) instead of
// re-scanning frontend API call sites — same reuse pattern as BE-ERR-M-001.

export const VERSION = '1.0.0';

function getRuleFindingCount(constraintsLayer, ruleId) {
    const findingsByRule = constraintsLayer?.findings_by_rule ?? {};
    const hits = findingsByRule[ruleId];

    return Array.isArray(hits) ? hits.length : 0;
}

function evaluateFromConstraints(constraintsLayer, config = {}) {
    const sourceRuleId = config.source_rule_id ?? 'CROSS-EP-C-001-frontend-api-url-resolves-to-backend-route';
    const unresolvedCallSiteCount = getRuleFindingCount(constraintsLayer, sourceRuleId);
    const crossStaticMeta = constraintsLayer?.adapter_meta?.['cross-static'] ?? {};
    const totalCallSiteCount = Number(crossStaticMeta.frontend_endpoint_count ?? 0);
    const value = totalCallSiteCount > 0
        ? Number((unresolvedCallSiteCount / totalCallSiteCount).toFixed(6))
        : null;

    return {
        sourceRuleId,
        unresolvedCallSiteCount,
        totalCallSiteCount,
        value,
    };
}

export async function run({ constraintsLayer, config }) {
    const target = evaluateFromConstraints(constraintsLayer, config ?? {});
    const delta = null;

    const findings = appendBaselineDeltaFinding([
        `Unresolved frontend call sites: ${target.unresolvedCallSiteCount}`,
        `Total frontend call sites: ${target.totalCallSiteCount}`,
        `Endpoint resolution miss ratio: ${target.value}`,
    ], delta);

    return buildMetricResult({
        value: target.value,
        unit: 'ratio',
        direction: 'lower_is_better',
        delta,
        findings,
        rawArtifactPath: config?.raw_artifact_path,
        details: {
            target,
            formula: 'unresolved_frontend_call_sites / total_frontend_call_sites',
        },
    });
}
