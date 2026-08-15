import path from 'node:path';

export const PRODUCTION_IGNORE_GLOBS = Object.freeze([
    '**/*.test.*',
    '**/*.spec.*',
    '**/*.story.*',
    '**/*.stories.*',
    '**/*.generated.*',
    '**/__tests__/**',
    '**/test/**',
    '**/tests/**',
    '**/stories/**',
    '**/generated/**',
    '**/__generated__/**',
]);

const TEST_DIRECTORY_NAMES = new Set(['test', 'tests', '__tests__']);
const STORY_DIRECTORY_NAMES = new Set(['stories']);
const GENERATED_DIRECTORY_NAMES = new Set(['generated', '__generated__']);
const TEST_FILE_RE = /\.(?:test|spec)\.[^/]+$/i;
const STORY_FILE_RE = /\.(?:story|stories)\.[^/]+$/i;
const GENERATED_FILE_RE = /\.generated\.[^/]+$/i;

export function normalizeSourcePath(value) {
    return String(value).split(path.sep).join('/');
}

function pathSegments(value) {
    return normalizeSourcePath(value).split('/').filter(Boolean);
}

export function isTestSourcePath(value) {
    const normalized = normalizeSourcePath(value);
    return TEST_FILE_RE.test(normalized)
        || pathSegments(normalized).some((segment) => TEST_DIRECTORY_NAMES.has(segment));
}

export function isStorySourcePath(value) {
    const normalized = normalizeSourcePath(value);
    return STORY_FILE_RE.test(normalized)
        || pathSegments(normalized).some((segment) => STORY_DIRECTORY_NAMES.has(segment));
}

export function isGeneratedSourcePath(value) {
    const normalized = normalizeSourcePath(value);
    return GENERATED_FILE_RE.test(normalized)
        || pathSegments(normalized).some((segment) => GENERATED_DIRECTORY_NAMES.has(segment));
}

export function isProductionSourcePath(value) {
    return !isTestSourcePath(value)
        && !isStorySourcePath(value)
        && !isGeneratedSourcePath(value);
}
