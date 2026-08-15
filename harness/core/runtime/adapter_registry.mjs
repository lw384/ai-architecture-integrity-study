// Input: one rulepack directory plus its adapter declarations.
// Output: a registry of executable adapter instances keyed by adapter ID.
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Resolve the shared adapters root directory.
function resolveAdaptersRoot(rulepackDir, explicitAdaptersRoot) {
    if (explicitAdaptersRoot) {
        return explicitAdaptersRoot;
    }

    return path.resolve(rulepackDir, '..', '..', 'adapters');
}

// Resolve the module path for one adapter declaration.
function resolveAdapterModulePath({ adapterId, adapterDeclaration, rulepackDir, adaptersRoot }) {
    if (adapterDeclaration.source.includes('/')) {
        return path.resolve(rulepackDir, adapterDeclaration.source);
    }

    return path.join(adaptersRoot, adapterDeclaration.source || adapterId, 'adapter.mjs');
}

// Load adapter modules and build a callable adapter registry.
export async function buildAdapterRegistry({ rulepackDir, adaptersDeclaration, adaptersRoot }) {
    const resolvedAdaptersRoot = resolveAdaptersRoot(rulepackDir, adaptersRoot);
    const registry = new Map();

    for (const [adapterId, adapterDeclaration] of Object.entries(adaptersDeclaration ?? {})) {
        const modulePath = resolveAdapterModulePath({
            adapterId,
            adapterDeclaration,
            rulepackDir,
            adaptersRoot: resolvedAdaptersRoot,
        });

        const moduleUrl = pathToFileURL(modulePath).href;
        const adapterModule = await import(moduleUrl);
        const run = adapterModule.runAdapter || adapterModule.run;

        if (typeof run !== 'function') {
            throw new Error(
                `[Harness Error] Adapter ${adapterId} at ${modulePath} does not export runAdapter or run.`,
            );
        }

        registry.set(adapterId, {
            configPath: path.resolve(rulepackDir, adapterDeclaration.config),
            run,
        });
    }

    return registry;
}
