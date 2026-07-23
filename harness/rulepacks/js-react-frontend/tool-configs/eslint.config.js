import { architecturePlugin } from './rules/index.js';

export default [
    {
        ignores: ['node_modules/**', 'dist/**', 'build/**', 'coverage/**'],
    },
    {
        files: ['**/*.js', '**/*.jsx', '**/*.cjs', '**/*.mjs'],
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
            }],
            'architecture/no-usestate-in-deep-child-components': 'error',
            'architecture/context-provider-only-in-controlled-locations': 'error',
            'architecture/route-definitions-only-in-routes-dir': ['error', {
                routes_dir: 'src/routes/',
            }],
            'architecture/route-must-map-to-page-component': ['error', {
                routes_dir: 'src/routes/',
            }],
        },
    },
];
