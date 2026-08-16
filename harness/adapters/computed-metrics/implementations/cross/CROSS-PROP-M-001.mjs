import {
    appendBaselineDeltaFinding,
    buildMetricResult,
} from '../_shared/metric-result.mjs';

// Associated metric rule: CROSS-PROP-M-001-propagation-incompleteness-ratio.
// Diff-driven, unlike CROSS-EP-M-001/CROSS-TYPE-M-001: it reuses the counterpart
// -surface enumeration cross-static already computed while evaluating
// CROSS-PROP-C-001 against the same preCommit/postCommit runtimeContext
// (propagation-contracts.mjs), rather than re-running its own diff pass — the
// metrics layer never receives runtimeContext directly, so this reuse is the
// only way to get a diff-aware result at metric time.

export const VERSION = '1.0.0';

function evaluateFromConstraints(constraintsLayer) {
    const crossStaticMeta = constraintsLayer?.adapter_meta?.['cross-static'] ?? {};
    const missingCounterpartSurfaceCount = Number(crossStaticMeta.propagation_counterpart_surface_missing ?? 0);
    const totalCounterpartSurfaceCount = Number(crossStaticMeta.propagation_counterpart_surface_total ?? 0);
    const triggeredResourceCount = Number(crossStaticMeta.propagation_triggered_resources ?? 0);
    const value = totalCounterpartSurfaceCount > 0
        ? Number((missingCounterpartSurfaceCount / totalCounterpartSurfaceCount).toFixed(6))
        : null;

    return {
        missingCounterpartSurfaceCount,
        totalCounterpartSurfaceCount,
        triggeredResourceCount,
        propagationReason: crossStaticMeta.propagation_reason ?? null,
        value,
    };
}

export async function run({ constraintsLayer, config }) {
    const target = evaluateFromConstraints(constraintsLayer);
    const delta = null;

    const findings = appendBaselineDeltaFinding([
        `Resources with an API-facing change: ${target.triggeredResourceCount}`,
        `Missing counterpart surfaces: ${target.missingCounterpartSurfaceCount}`,
        `Total counterpart surfaces: ${target.totalCounterpartSurfaceCount}`,
        `Propagation incompleteness ratio: ${target.value}`,
        ...(target.propagationReason ? [target.propagationReason] : []),
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
            formula: 'missing_counterpart_surfaces / total_counterpart_surfaces',
        },
    });
}
