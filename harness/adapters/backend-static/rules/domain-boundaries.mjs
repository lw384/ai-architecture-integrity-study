// BE-DOM-C-001/002: cross-module imports must go through module entry files only, and module
// entry files must not re-export repository or entity implementations.
import { resolveExportTargets } from '../project.mjs';
import {
    collectExpressionIdentifiers,
    findModuleDecorator,
    isModuleEntry,
    layerOf,
    moduleMetadataNames,
    moduleParts,
    targetFiles,
    violation,
} from './shared.mjs';

export function analyzeDomainBoundaries(project) {
    const findings = [];

    for (const file of project.files) {
        const sourceModule = moduleParts(file.relative);

        for (const edge of file.imports) {
            const directTarget = edge.resolved ? project.byPath.get(edge.resolved) : null;
            const targetModule = directTarget ? moduleParts(directTarget.relative) : null;

            if (
                sourceModule
                && targetModule
                && sourceModule.owner !== targetModule.owner
                && !isModuleEntry(directTarget.relative)
            ) {
                findings.push(violation('BE-DOM-C-001', file, edge.sourceNode, {
                    source_module: sourceModule.owner,
                    target_module: targetModule.owner,
                    import_path: edge.source,
                    resolved_target: directTarget.relative,
                    message: 'Cross-module imports must use index.ts or the target module file.',
                }));
            }
        }

        if (!isModuleEntry(file.relative)) {
            continue;
        }

        for (const statement of file.ast.body ?? []) {
            if (statement.type === 'ExportAllDeclaration' || statement.type === 'ExportNamedDeclaration') {
                if (statement.source?.value) {
                    const exportedNames = new Set((statement.specifiers ?? []).map((specifier) =>
                        specifier.local?.name ?? specifier.local?.value ?? '*'
                    ));
                    const resolvedFiles = resolveExportTargets(
                        project,
                        file,
                        statement.source.value,
                        exportedNames.size > 0 ? exportedNames : new Set(['*']),
                    ).map((target) => project.byPath.get(target)).filter(Boolean);
                    const forbiddenTarget = resolvedFiles.find((target) =>
                        ['repository', 'entity'].includes(layerOf(target.relative))
                    );
                    const forbiddenName = (statement.specifiers ?? []).find((specifier) =>
                        /(?:Repository|Entity)$/.test(specifier.exported?.name ?? specifier.local?.name ?? '')
                    );

                    if (forbiddenTarget || forbiddenName) {
                        findings.push(violation('BE-DOM-C-002', file, statement.source ?? statement, {
                            export_kind: 're-export',
                            exported_symbol: forbiddenName?.exported?.name
                                ?? statement.specifiers?.[0]?.exported?.name
                                ?? null,
                            resolved_target: forbiddenTarget?.relative ?? null,
                            message: 'Module entry points must not export repositories or entities.',
                        }));
                    }
                } else {
                    for (const specifier of statement.specifiers ?? []) {
                        const localName = specifier.local?.name;
                        const binding = file.importBindings.get(localName);
                        const target = binding
                            ? file.imports.find((edge) => edge.source === binding.source)?.resolved
                            : null;
                        const targetFile = target ? project.byPath.get(target) : null;

                        if (/(?:Repository|Entity)$/.test(localName ?? '') || ['repository', 'entity'].includes(layerOf(targetFile?.relative ?? ''))) {
                            findings.push(violation('BE-DOM-C-002', file, specifier, {
                                export_kind: 'named-export',
                                exported_symbol: specifier.exported?.name ?? localName,
                                resolved_target: targetFile?.relative ?? null,
                                message: 'Module entry points must not export repositories or entities.',
                            }));
                        }
                    }
                }
            }

            if (statement.type === 'ExportDefaultDeclaration') {
                const names = collectExpressionIdentifiers(statement.declaration);
                let forbiddenName = [...names].find((name) => /(?:Repository|Entity)$/.test(name)) ?? null;
                let forbiddenTarget = null;

                for (const name of names) {
                    const binding = file.importBindings.get(name);
                    const edge = binding ? file.imports.find((item) => item.source === binding.source) : null;
                    const target = targetFiles(project, edge ?? { ultimateTargets: [] }).find((item) =>
                        ['repository', 'entity'].includes(layerOf(item.relative))
                    );
                    if (!target) continue;
                    forbiddenName ??= name;
                    forbiddenTarget = target;
                    break;
                }

                if (forbiddenName || forbiddenTarget) {
                    findings.push(violation('BE-DOM-C-002', file, statement.declaration, {
                        export_kind: 'default-export',
                        exported_symbol: forbiddenName ?? 'default',
                        resolved_target: forbiddenTarget?.relative ?? null,
                        message: 'Module entry points must not export repositories or entities.',
                    }));
                }
            }
        }

        const moduleDecorator = findModuleDecorator(file);
        const exportedNames = moduleMetadataNames(moduleDecorator, 'exports');

        for (const name of exportedNames) {
            const binding = file.importBindings.get(name);
            const edge = binding ? file.imports.find((item) => item.source === binding.source) : null;
            const targetFile = targetFiles(project, edge ?? { ultimateTargets: [] }).find((target) =>
                ['repository', 'entity'].includes(layerOf(target.relative))
            );

            if (/(?:Repository|Entity)$/.test(name) || ['repository', 'entity'].includes(layerOf(targetFile?.relative ?? ''))) {
                findings.push(violation('BE-DOM-C-002', file, moduleDecorator, {
                    export_kind: 'nestjs-module-export',
                    exported_symbol: name,
                    resolved_target: targetFile?.relative ?? null,
                    message: 'Nest module exports must not expose repositories or entities.',
                }));
            }
        }
    }

    return findings;
}
