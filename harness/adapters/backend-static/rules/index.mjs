// Composes every backend-static rule-category analyzer into the single entry point the
// adapter calls. Category order matches the previous monolithic rules.mjs so finding order
// (and therefore any order-sensitive fixture assertions) stays unchanged.
import { analyzeStructure } from './structure.mjs';
import { analyzeDependencies } from './dependencies.mjs';
import { analyzeDomainBoundaries } from './domain-boundaries.mjs';
import { analyzeErrors } from './errors.mjs';
import { analyzeDtoContracts, analyzeValidationPipe } from './contracts.mjs';
import { analyzeRoutes } from './routes.mjs';
import { analyzeTestabilityAndSize } from './testability-size.mjs';
import { analyzeResourceOwners, analyzePolicyAndCodeDuplication } from './duplication.mjs';

export function analyzeBackendRules(project, config = {}) {
    return [
        ...analyzeStructure(project),
        ...analyzeDependencies(project),
        ...analyzeDomainBoundaries(project),
        ...analyzeErrors(project, config),
        ...analyzeDtoContracts(project),
        ...analyzeValidationPipe(project),
        ...analyzeRoutes(project),
        ...analyzeTestabilityAndSize(project),
        ...analyzeResourceOwners(project, config),
        ...analyzePolicyAndCodeDuplication(project),
    ];
}
