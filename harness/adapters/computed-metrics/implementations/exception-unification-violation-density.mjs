import fs from 'node:fs';
import path from 'node:path';
import {
    appendBaselineDeltaFinding,
    buildMetricResult,
} from './_shared/metric-result.mjs';

// Associated metric rule: BE-ERR-M-001-exception-unification-violation-density.
// Reuses findings already produced by BE-ERR-C-001/002/003 instead of re-running AST scans.

export const VERSION = '1.0.0';

function collectServiceFiles(rootDir) {
    const stack = [rootDir];
    const serviceFiles = [];

    while (stack.length > 0) {
        const current = stack.pop();

        let entries = [];
        try {
            entries = fs.readdirSync(current, { withFileTypes: true });
        } catch {
            continue;
        }

        for (const entry of entries) {
            const fullPath = path.join(current, entry.name);

            if (entry.isDirectory()) {
                if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'build') {
                    continue;
                }
                stack.push(fullPath);
                continue;
            }

            if (entry.isFile() && entry.name.endsWith('.service.ts')) {
                serviceFiles.push(fullPath);
            }
        }
    }

    return serviceFiles;
}

function getRuleFindingCount(constraintsLayer, ruleId) {
    const findingsByRule = constraintsLayer?.findings_by_rule ?? {};
    const hits = findingsByRule[ruleId];

    return Array.isArray(hits) ? hits.length : 0;
}

function evaluateFromConstraints(constraintsLayer, targetDir, config = {}) {
    const sourceRuleIds = config.source_rule_ids ?? [
        'BE-ERR-C-001-no-http-exception-in-service',
        'BE-ERR-C-002-throw-only-app-exception',
        'BE-ERR-C-003-no-silent-catch',
    ];

    const weights = config.weights ?? {};
    const weightedRuleCounts = {};
    let weightedViolationCount = 0;

    for (const ruleId of sourceRuleIds) {
        const count = getRuleFindingCount(constraintsLayer, ruleId);
        const weight = Number(weights[ruleId] ?? 1);
        weightedRuleCounts[ruleId] = {
            count,
            weight,
            weighted: count * weight,
        };
        weightedViolationCount += count * weight;
    }

    const serviceRoot = path.resolve(targetDir, config.service_root ?? 'src');
    const serviceFileCount = collectServiceFiles(serviceRoot).length;
    const denominator = Math.max(serviceFileCount, 1);
    const value = Number((weightedViolationCount / denominator).toFixed(6));

    return {
        value,
        sourceRuleIds,
        weightedRuleCounts,
        weightedViolationCount,
        serviceFileCount,
        denominator,
    };
}

export async function run({ targetDir, constraintsLayer, config }) {
    const target = evaluateFromConstraints(constraintsLayer, targetDir, config ?? {});
    const delta = null;

    const findings = appendBaselineDeltaFinding([
        `Weighted exception-rule violations: ${target.weightedViolationCount}`,
        `Service file count: ${target.serviceFileCount}`,
        `Exception unification violation density: ${target.value}`,
        `Source rules: ${target.sourceRuleIds.join(', ')}`,
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
            formula: 'sum(weight_i * violations_i) / max(1, service_file_count)',
        },
    });
}
