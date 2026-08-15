// Shared dep-cruiser defaults.
// Runtime-specific values such as tsconfig, targets, cwd, and overrides are
// injected by the adapter at execution time.

module.exports = {
    options: {
        doNotFollow: { path: 'node_modules' },
        exclude: {
            path: '(?:^|/)(?:__tests__|tests?|stories|generated|__generated__)(?:/|$)|\\.(?:spec|test|story|stories|generated)\\.(?:[cm]?[jt]sx?)$|(?:^|/)(?:dist|build)(?:/|$)',
        },
    },
    forbidden: [],
};
