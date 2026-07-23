export function computeDelta(targetValue, baselineValue, digits = null) {
    if (baselineValue === null || baselineValue === undefined) {
        return null;
    }

    const rawDelta = targetValue - baselineValue;

    if (typeof digits === 'number') {
        return Number(rawDelta.toFixed(digits));
    }

    return rawDelta;
}

export function appendBaselineDeltaFinding(findings, delta, options = {}) {
    const nextFindings = [...findings];
    const missingBaselineMessage = options.missingBaselineMessage
        ?? 'Baseline report unavailable; delta_vs_baseline set to null.';

    if (delta === null) {
        nextFindings.push(missingBaselineMessage);
        return nextFindings;
    }

    if (delta !== 0) {
        const deltaText = typeof options.formatDelta === 'function'
            ? options.formatDelta(delta)
            : `${delta > 0 ? '+' : ''}${delta}`;
        nextFindings.push(`Delta vs baseline: ${deltaText}`);
    }

    return nextFindings;
}

export function buildMetricResult({
    value,
    unit,
    direction = 'lower_is_better',
    delta,
    findings,
    rawArtifactPath,
    details,
}) {
    const result = {
        score: {
            value,
            unit,
            direction,
        },
        delta_vs_baseline: delta,
        findings,
        raw_artifact_path: rawArtifactPath,
    };

    if (details !== undefined) {
        result.details = details;
    }

    return result;
}
