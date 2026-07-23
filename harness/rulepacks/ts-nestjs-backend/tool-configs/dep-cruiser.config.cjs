// Rulepack-local dep-cruiser rules for the ts-nestjs-backend subject.
// This file extends the shared adapter defaults and only adds stack-specific
// forbidden rules.
//
// How to add a new rule:
// 1. Append one object to forbidden.
// 2. Give it a stable name that matches the rule YAML evidence_sources.
// 3. Keep shared runtime options out of this file; put only subject-specific
//    dep-cruiser rules here.
const base = require('../../../adapters/dep-cruiser/config.cjs');

module.exports = {
	...base,
	forbidden: [
		...base.forbidden,
		// BE-DEP-C-004: No circular dependencies
		{
			name: 'BE-DEP-C-004-no-circular',
			severity: 'error',
			comment: 'Disallow circular dependencies in the subject graph.',
			from: {},
			to: { circular: true },
		},
		{
			name: 'BE-DOM-C-001-no-cross-module-deep-import',
			severity: 'error',
			comment: 'Cross-module imports must go through module.ts or index.ts',
			from: {
				path: '^src/modules?/([^/]+)/',
			},
			to: {
				path: '^src/modules?/([^/]+)/(.+)',
				pathNot: [
					'^src/modules?/$1/',
					'^src/modules?/[^/]+/(index|[^/]+\\.module)\\.ts$',
				],
			},
		},
		{
			name: 'ARCH-005-upward-service-to-controller',
			severity: 'error',
			comment: 'Service files must not import controller files.',
			from: { path: 'src/.*\\.service\\.' },
			to: { path: 'src/.*\\.controller\\.' },
		},
		{
			name: 'AI-DEBT-001-hallucinated-imports',
			severity: 'error',
			comment: 'Flag unresolved imports as likely hallucinated dependencies.',
			from: {},
			to: { couldNotResolve: true },
		},
	],
};
