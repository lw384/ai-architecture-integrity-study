import process from 'node:process';
import importPlugin from 'eslint-plugin-import';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import { nestjsPlugin } from './rules/index.js';
export default [
    {
        ignores: ['node_modules/**', 'dist/**', 'build/**', 'coverage/**'],
    },
    {
        files: ['**/*.js', '**/*.cjs', '**/*.mjs'],
        languageOptions: {
            ecmaVersion: 2021,
            sourceType: 'module',
        },
        rules: {
            'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
            'no-undef': 'warn',
            'no-console': 'off',
            eqeqeq: 'warn',
        },
    },
    {
        files: ['**/*.ts', '**/*.tsx'],
        languageOptions: {
            parser: tsParser,
            ecmaVersion: 2021,
            sourceType: 'module',
        },
        plugins: {
            import: importPlugin,
            '@typescript-eslint': tsPlugin,
            nestjs: nestjsPlugin,
        },
        rules: {
            'no-unused-vars': 'off',
            'no-undef': 'off',
            'no-console': 'off',
            eqeqeq: 'warn',
            '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
            '@typescript-eslint/no-explicit-any': 'warn',
            'import/no-restricted-paths': ['error', {
                basePath: process.cwd(),
                zones: [
                    // BE-DEP-C-001: Infrastructure isolation
                    { target: './src/common/**/*', from: './src/modules/**/*', message: 'BE-DEP-C-001: common must not depend on modules' },
                    { target: './src/core/**/*', from: './src/modules/**/*', message: 'BE-DEP-C-001: core must not depend on modules' },

                    // BE-DEP-C-002: Intra-module layering
                    { target: './src/modules/**/*.controller.ts', from: './src/modules/**/*.controller.ts', message: 'BE-DEP-C-002: controllers should not import from other controllers' },
                    { target: './src/modules/**/*.service.ts', from: './src/modules/**/*.controller.ts', message: 'BE-DEP-C-002: services must not depend on controllers' },
                    { target: './src/modules/**/*.entity.ts', from: './src/modules/**/*.service.ts', message: 'BE-DEP-C-002: entities must not depend on services' },
                    { target: './src/modules/**/*.entity.ts', from: './src/modules/**/*.controller.ts', message: 'BE-DEP-C-002: entities must not depend on controllers' },
                    { target: './src/modules/**/*.entity.ts', from: './src/modules/**/*.repository.ts', message: 'BE-DEP-C-002: entities must not depend on repositories' },

                    // BE-DEP-C-003: Framework layer purity
                    { target: './src/common/guards/**/*', from: './src/modules/**/*.entity.ts', message: 'BE-DEP-C-003: guards must not depend on specific entities' },
                    { target: './src/common/interceptors/**/*', from: './src/modules/**/*.entity.ts', message: 'BE-DEP-C-003: interceptors must not depend on specific entities' },
                    { target: './src/common/filter/**/*', from: './src/modules/**/*.entity.ts', message: 'BE-DEP-C-003: filters must not depend on specific entities' },
                ],
            }],
            'nestjs/module-composition': ['error', {
                require_controller: true,
                require_service: true,
                require_repository: false,
            }],
            'nestjs/no-http-exception-in-service': ['error', {
                filePattern: '\\.service\\.ts$',
            }],
            'nestjs/throw-only-app-exception': ['error', {
                filePattern: '\\.service\\.ts$',
                allowedClasses: ['AppException'],
                allowRethrow: true,
            }],
            'nestjs/no-silent-catch': ['error', {
                filePattern: '\\.service\\.ts$',
                requireThrowOrHandle: true,
            }],
            'nestjs/no-repository-in-module-exports': ['error', {
                filePattern: '(\\.module\\.ts|/index\\.ts)$',
                forbiddenSuffixes: ['Repository', 'Entity'],
                forbiddenSourcePatterns: ['\\.repository(\\.ts)?$', '\\.entity(\\.ts)?$'],
                checkTypeOnlyExports: true,
                checkNestModuleExports: true,
            }],
        },
    },
];
