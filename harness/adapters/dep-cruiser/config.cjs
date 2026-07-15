// Shared dep-cruiser defaults.
// Runtime-specific values such as tsconfig, targets, cwd, and overrides are
// injected by the adapter at execution time.

module.exports = {
    options: {
        doNotFollow: { path: 'node_modules' },
        exclude: { path: '\.(spec|test)\.(js|ts)$|test/utils|dist|build' },
    },
    forbidden: [],
};