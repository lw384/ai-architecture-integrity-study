// harness/core/io/manifest_reader.mjs
import fs from 'node:fs';

/**
 * Read the Python-generated run manifest and enforce its lifecycle state.
 * Runtime CLI commit values remain authoritative; this reader returns only
 * identity fields needed when assembling the final evaluation artifact.
 */
export function readManifest(manifestPath) {
    if (!fs.existsSync(manifestPath)) {
        console.error(`[Harness Error] Manifest file not found at ${manifestPath}`);
        // Exit code 2 identifies invalid target or manifest state.
        process.exit(2);
    }

    let manifest;
    try {
        const raw = fs.readFileSync(manifestPath, 'utf-8');
        manifest = JSON.parse(raw);
    } catch (error) {
        console.error(`[Harness Error] Failed to parse manifest JSON: ${error.message}`);
        process.exit(2);
    }

    // Only a ready manifest may enter the evaluation state transition.
    if (manifest.status !== 'ready_for_evaluation') {
        console.error(`[Harness Error] Refusing to evaluate. Manifest status is '${manifest.status}', expected 'ready_for_evaluation'.`);
        process.exit(2);
    }

    // Re-evaluation is allowed but remains visible in logs and output metadata.
    if (Array.isArray(manifest.events) && manifest.events.includes('evaluation_completed')) {
        console.warn(`[Harness Warning] Evaluation was already completed for this trajectory. Re-running evaluation idempotently.`);
    }

    // Keep only fields required by the evaluation orchestrator.
    const { task_id, baseline_commit, rulepack_id } = manifest;
    // const { pre_commit } = manifest; // Runtime CLI SHA is now authoritative.

    if (!task_id || !baseline_commit || !rulepack_id) {
        console.error(`[Harness Error] Manifest missing required fields: task_id, baseline_commit, or rulepack_id.`);
        process.exit(2);
    }

    return {
        task_id,
        // pre_commit: pre_commit || 'unknown', // Redundant after strict CLI parsing.
        baseline_commit,
        rulepack_id
    };
}
