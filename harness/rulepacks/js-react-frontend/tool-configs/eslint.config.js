import { architecturePlugin } from './rules/index.js';

export default [
    {
        ignores: ['node_modules/**', 'dist/**', 'build/**', 'coverage/**'],
    },
    {
        files: ['**/*.js', '**/*.jsx', '**/*.cjs', '**/*.mjs'],
        linterOptions: {
            reportUnusedDisableDirectives: 'error',
        },
        languageOptions: {
            ecmaVersion: 2021,
            sourceType: 'module',
            parserOptions: {
                ecmaFeatures: {
                    jsx: true,
                },
            },
        },
        plugins: {
            architecture: architecturePlugin,
        },
        rules: {
            'max-lines': ['error', {
                max: 300,
                skipBlankLines: true,
                skipComments: true,
            }],
            'architecture/business-jsx-max-depth': ['error', {
                max: 5,
                transparent_wrappers: [
                    'Popper', 'Portal', 'Modal', 'Backdrop',
                    'ClickAwayListener', 'Fade', 'Grow', 'Zoom', 'Slide', 'Collapse',
                    'Transitions',
                ],
                ignored_file_patterns: [
                    '**/*.test.*', '**/*.spec.*', '**/*.stories.*',
                    '**/__tests__/**', 'src/test/**', '**/generated/**',
                ],
            }],
            'architecture/no-usestate-in-deep-child-components': 'error',
            'architecture/context-provider-only-in-controlled-locations': 'error',
            'architecture/route-definitions-only-in-routes-dir': ['error', {
                routes_dir: 'src/routes/',
            }],
            'architecture/route-must-map-to-page-component': ['error', {
                routes_dir: 'src/routes/',
            }],
            'architecture/no-raw-jsx-style': 'error',
            'architecture/global-styles-only-in-approved-locations': ['error', {
                allowedGlobalStyleImports: [
                    'src/styles/**/*.css',
                    'src/styles/**/*.scss',
                    'src/styles/**/*.sass',
                    'src/assets/third-party/**/*.css',
                    'src/assets/third-party/**/*.scss',
                ],
            }],
            'architecture/network-calls-only-in-approved-modules': ['error', {
                allowedPaths: [
                    'src/api/**/*.js',
                    'src/api/**/*.jsx',
                    'src/api/**/*.ts',
                    'src/api/**/*.tsx',
                    'src/pages/**/*Queries.js',
                    'src/pages/**/*Queries.jsx',
                    'src/pages/**/*Queries.ts',
                    'src/pages/**/*Queries.tsx',
                    'src/contexts/RouteAccessContext.jsx',
                    'src/contexts/RouteAccessContext.tsx',
                ],
            }],
            'architecture/useeffect-requires-dependency-array': 'error',
            'architecture/no-global-event-bus': 'error',
        },
    },
];
