// BE-STRUCT-C-001: each business module under src/modules/<resource>/ must provide separate
// module, controller, service, and repository files and register the controller, service,
// and repository in @Module metadata.
import path from 'node:path';
import { findModuleDecorator, moduleMetadataNames, moduleParts, violation } from './shared.mjs';

function pascalCase(value) {
    return value.split(/[-_]/).filter(Boolean).map((part) => part[0]?.toUpperCase() + part.slice(1)).join('');
}

export function analyzeStructure(project) {
    const findings = [];
    // Filter for business modules with a valid module decorator and entry point.
    for (const file of project.files.filter((item) => /^src\/modules\/[^/]+\/[^/]+\.module\.ts$/.test(item.relative))) {
        const parts = moduleParts(file.relative);
        const basename = path.basename(file.relative, '.module.ts');

        if (!parts || basename !== parts.owner) {
            continue;
        }
        // select @Module decorator and validate that controller, service, and repository exist and are registered.
        const decorator = findModuleDecorator(file);
        if (!decorator) continue;

        const required = ['controller', 'service', 'repository'];
        const missingFiles = [];
        const missingRegistrations = [];
        const controllers = moduleMetadataNames(decorator, 'controllers');
        const providers = moduleMetadataNames(decorator, 'providers');

        for (const layer of required) {
            const relative = `src/modules/${parts.owner}/${parts.owner}.${layer}.ts`;
            const target = project.files.find((candidate) => candidate.relative === relative);

            if (!target) {
                missingFiles.push(relative);
                continue;
            }

            const importedNames = file.imports
                .filter((edge) => edge.resolved === target.path)
                .flatMap((edge) => edge.bindings.map((binding) => binding.local));
            const expectedName = `${pascalCase(parts.owner)}${pascalCase(layer)}`;
            const candidates = new Set([...importedNames, expectedName]);
            const metadata = layer === 'controller' ? controllers : providers;

            if (![...candidates].some((name) => metadata.has(name))) {
                missingRegistrations.push(`${layer}:${relative}`);
            }
        }

        if (missingFiles.length > 0 || missingRegistrations.length > 0) {
            findings.push(violation('BE-STRUCT-C-001', file, decorator, {
                module: parts.owner,
                missing_files: missingFiles,
                missing_registrations: missingRegistrations,
                message: `Business module ${parts.owner} must provide and register its controller, service, and repository.`,
            }));
        }
    }

    return findings;
}
