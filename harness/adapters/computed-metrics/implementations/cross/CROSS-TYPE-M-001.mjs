import {
    appendBaselineDeltaFinding,
    buildMetricResult,
} from '../_shared/metric-result.mjs';

// Associated metric rule: CROSS-TYPE-M-001-contract-field-drift-density.
// Reuses CROSS-TYPE-C-001's own findings instead of re-scanning frontend/backend
// contracts. That constraint merges three tool_rule_ids into one finding list, so
// this metric splits it back apart by finding.evidence.source_rule_id to apply
// per-mismatch-kind weights (body-field drift weighted highest by default, since
// a missing/invalid body field is the kind most likely to be rejected outright by
// the backend — same reasoning as BE-ERR-M-001's weighted-density design).

export const VERSION = '1.0.0';

const DEFAULT_WEIGHTS = {
    'cross-static/frontend-route-param-arity-mismatch': 1,
    'cross-static/frontend-query-key-mismatch': 1,
    'cross-static/frontend-body-key-mismatch': 2,
};

function getRuleFindings(constraintsLayer, ruleId) {
    const findingsByRule = constraintsLayer?.findings_by_rule ?? {};
    const hits = findingsByRule[ruleId];

    return Array.isArray(hits) ? hits : [];
}

function evaluateFromConstraints(constraintsLayer, config = {}) {
    const sourceRuleId = config.source_rule_id ?? 'CROSS-TYPE-C-001-request-query-body-contract-alignment';
    const weights = { ...DEFAULT_WEIGHTS, ...(config.weights ?? {}) };
    const findings = getRuleFindings(constraintsLayer, sourceRuleId);
    const weightedMismatchCounts = {};
    let weightedMismatchTotal = 0;

    for (const finding of findings) {
        const mismatchKind = finding.evidence?.source_rule_id ?? 'unknown';
        const weight = Number(weights[mismatchKind] ?? 1);
        const entry = weightedMismatchCounts[mismatchKind] ?? { count: 0, weight, weighted: 0 };

        entry.count += 1;
        entry.weighted += weight;
        weightedMismatchCounts[mismatchKind] = entry;
        weightedMismatchTotal += weight;
    }

    const crossStaticMeta = constraintsLayer?.adapter_meta?.['cross-static'] ?? {};
    const contractPositionCount = Number(crossStaticMeta.contract_position_count ?? 0);
    const value = contractPositionCount > 0
        ? Number((weightedMismatchTotal / contractPositionCount).toFixed(6))
        : null;

    return {
        sourceRuleId,
        weights,
        weightedMismatchCounts,
        weightedMismatchTotal,
        contractPositionCount,
        routeParamPositionCount: Number(crossStaticMeta.route_param_position_count ?? 0),
        queryFieldPositionCount: Number(crossStaticMeta.query_field_position_count ?? 0),
        bodyFieldPositionCount: Number(crossStaticMeta.body_field_position_count ?? 0),
        value,
    };
}

export async function run({ constraintsLayer, config }) {
    const target = evaluateFromConstraints(constraintsLayer, config ?? {});
    const delta = null;

    const findings = appendBaselineDeltaFinding([
        `Weighted contract-field mismatches: ${target.weightedMismatchTotal}`,
        `Total contract positions (route-param + query + body): ${target.contractPositionCount}`,
        `Contract field drift density: ${target.value}`,
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
            formula: 'sum(weight_i * mismatch_count_i) / total_contract_position_count',
        },
    });
}
