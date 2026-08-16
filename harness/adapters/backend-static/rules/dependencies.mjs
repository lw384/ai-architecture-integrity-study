// BE-DEP-C-001/002/003: intra-module layering, infrastructure isolation, and framework-layer
// purity. All three walk the same import edges, so they share one pass over project.files.
import { layerOf, moduleParts, targetFiles, violation } from './shared.mjs';

// Shared with computed-metrics/implementations/backend/BE-DEP-M-001.mjs so the metric's
// layering-violation count can never drift from what this constraint actually enforces.
export const FORBIDDEN_LAYER_PAIRS = new Set([
    'controller:controller',
    'controller:repository',
    'service:controller',
    'repository:controller',
    'repository:service',
    'entity:controller',
    'entity:service',
    'entity:repository',
]);

export function analyzeDependencies(project) {
    const findings = [];
    const forbiddenLayerPairs = FORBIDDEN_LAYER_PAIRS;

    for (const file of project.files) {
        const sourceModule = moduleParts(file.relative);
        const sourceLayer = layerOf(file.relative);

        for (const edge of file.imports) {
            const targets = targetFiles(project, edge);

            if (sourceModule && sourceLayer) {
                for (const target of targets) {
                    const targetModule = moduleParts(target.relative);
                    const targetLayer = layerOf(target.relative);

                    if (
                        targetModule?.owner === sourceModule.owner
                        && targetLayer
                        && forbiddenLayerPairs.has(`${sourceLayer}:${targetLayer}`)
                    ) {
                        findings.push(violation('BE-DEP-C-001', file, edge.sourceNode, {
                            from_layer: sourceLayer,
                            to_layer: targetLayer,
                            import_path: edge.source,
                            resolved_target: target.relative,
                            message: `${sourceLayer} must not depend directly on ${targetLayer}.`,
                        }));
                        break;
                    }
                }
            }

            if (/^src\/(?:common|core)\//.test(file.relative)) {
                const businessTarget = targets.find((target) => /^src\/modules\//.test(target.relative));

                if (businessTarget) {
                    findings.push(violation('BE-DEP-C-002', file, edge.sourceNode, {
                        import_path: edge.source,
                        resolved_target: businessTarget.relative,
                        dynamic: edge.dynamic,
                        message: 'common/core must not import business implementations from src/modules.',
                    }));
                }
            }

            if (
                /(?:^|\/)(?:guards?|interceptors?|filters?)(?:\/|$)|\.(?:guard|interceptor|filter)\.[cm]?[jt]s$/.test(file.relative)
            ) {
                const persistenceTarget = targets.find((target) => ['entity', 'repository'].includes(layerOf(target.relative)));

                if (persistenceTarget) {
                    findings.push(violation('BE-DEP-C-003', file, edge.sourceNode, {
                        import_path: edge.source,
                        resolved_target: persistenceTarget.relative,
                        target_layer: layerOf(persistenceTarget.relative),
                        message: 'Guards, interceptors, and filters must remain independent of module persistence.',
                    }));
                }
            }
        }
    }

    return findings;
}
