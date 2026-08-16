// BE-DUP-M-001-clone-ratio: token-normalized sliding-window clone detection over backend
// production source. Fills the metric gap for BE-DUP-C-001/002/003 (duplication drift_type),
// which currently has zero metric coverage. Detects Type-1 (exact) and Type-2 (renamed
// identifiers/literals, per Roy et al. 2009) clones; ratio = duplicate-covered lines / total
// token-bearing production lines.
import fs from 'node:fs';
import path from 'node:path';
import parser from '@typescript-eslint/parser';
import { isProductionSourcePath } from '../../../_shared/production-files.mjs';
import {
    appendBaselineDeltaFinding,
    buildMetricResult,
    computeDelta,
} from '../_shared/metric-result.mjs';

export const VERSION = '1.0.0';

const IDENTIFIER_PLACEHOLDER = '«ID»';
const LITERAL_PLACEHOLDER = '«LIT»';
const LITERAL_TOKEN_TYPES = new Set(['Numeric', 'String', 'Template', 'RegularExpression']);
// Defensive cap: a bucket this large means the window is a common boilerplate shape rather
// than a meaningful clone seed. Without this, a single hot bucket could produce O(k^2) pairs.
const MAX_BUCKET_SIZE = 40;

function toPosixPath(value) {
    return value.split(path.sep).join('/');
}

function listProductionFiles(projectRoot, sourceRoots, sourceExtensions) {
    const files = [];

    function walk(dir) {
        if (!fs.existsSync(dir)) {
            return;
        }

        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const entryPath = path.join(dir, entry.name);

            if (entry.isDirectory()) {
                walk(entryPath);
                continue;
            }

            if (!sourceExtensions.has(path.extname(entry.name)) || !isProductionSourcePath(entryPath)) {
                continue;
            }

            files.push(entryPath);
        }
    }

    for (const root of sourceRoots) {
        walk(path.resolve(projectRoot, root));
    }

    return files;
}

// Keywords/punctuators/operators carry structural meaning and stay verbatim; identifiers and
// literals collapse to placeholders so Type-2 clones (renamed vars/literals, same shape) hash
// identically to their Type-1 source.
function normalizeTokenValue(token) {
    if (token.type === 'Identifier' || token.type === 'JSXIdentifier') {
        return IDENTIFIER_PLACEHOLDER;
    }

    if (LITERAL_TOKEN_TYPES.has(token.type)) {
        return LITERAL_PLACEHOLDER;
    }

    return token.value;
}

function tokenizeFile(filePath, relativeFile) {
    const code = fs.readFileSync(filePath, 'utf8');
    const ast = parser.parse(code, {
        sourceType: 'module',
        ecmaVersion: 2022,
        loc: true,
        range: true,
        tokens: true,
        jsx: /\.[jt]sx$/.test(filePath),
    });

    return {
        relativeFile,
        tokens: ast.tokens.map((token) => ({
            normalized: normalizeTokenValue(token),
            line: token.loc.start.line,
        })),
    };
}

// Flatten every file's token stream into one addressable array, remembering each position's
// origin so windows/matches never spuriously cross a file boundary.
function buildCorpus(fileTokenLists) {
    const normalizedTokens = [];
    const origins = [];
    const allTokenLines = new Set();

    fileTokenLists.forEach((file, fileIndex) => {
        for (const token of file.tokens) {
            normalizedTokens.push(token.normalized);
            origins.push({ fileIndex, line: token.line });
            allTokenLines.add(`${file.relativeFile}:${token.line}`);
        }
    });

    return { normalizedTokens, origins, allTokenLines };
}

const stringHashCache = new Map();

function hashToken(value) {
    const cached = stringHashCache.get(value);
    if (cached !== undefined) {
        return cached;
    }

    let hash = 0;
    for (let i = 0; i < value.length; i++) {
        hash = (Math.imul(hash, 31) + value.charCodeAt(i)) | 0;
    }

    stringHashCache.set(value, hash);
    return hash;
}

function hashWindow(normalizedTokens, start, size) {
    let hash = 0;
    for (let i = start; i < start + size; i++) {
        hash = (Math.imul(hash, 31) + hashToken(normalizedTokens[i])) | 0;
    }
    return hash;
}

function sameFile(origins, a, b) {
    return origins[a].fileIndex === origins[b].fileIndex;
}

// Group every windowSize-token span (that doesn't straddle a file boundary) by hash.
function collectWindowBuckets(normalizedTokens, origins, windowSize) {
    const buckets = new Map();

    for (let i = 0; i + windowSize <= normalizedTokens.length; i++) {
        if (!sameFile(origins, i, i + windowSize - 1)) {
            continue;
        }

        const hash = hashWindow(normalizedTokens, i, windowSize);
        if (!buckets.has(hash)) {
            buckets.set(hash, []);
        }
        buckets.get(hash).push(i);
    }

    return buckets;
}

// Grow a matching pair of windows token-by-token past the seed length, as long as both sides
// keep agreeing and neither crosses its own file boundary. Returns the shared match length.
function extendMatch(normalizedTokens, origins, seedA, seedB, windowSize) {
    let length = windowSize;

    while (
        seedA + length < normalizedTokens.length
        && seedB + length < normalizedTokens.length
        && sameFile(origins, seedA, seedA + length)
        && sameFile(origins, seedB, seedB + length)
        && normalizedTokens[seedA + length] === normalizedTokens[seedB + length]
    ) {
        length += 1;
    }

    return length;
}

function markCoveredLines(coveredLines, origins, fileTokenLists, start, length) {
    for (let i = start; i < start + length; i++) {
        const { fileIndex, line } = origins[i];
        coveredLines.add(`${fileTokenLists[fileIndex].relativeFile}:${line}`);
    }
}

function detectClones(fileTokenLists, config) {
    const minTokens = config.min_tokens ?? 50;
    const minLines = config.min_lines ?? 5;
    const { normalizedTokens, origins, allTokenLines } = buildCorpus(fileTokenLists);
    const buckets = collectWindowBuckets(normalizedTokens, origins, minTokens);
    const coveredLines = new Set();
    const matches = [];

    for (const positions of buckets.values()) {
        if (positions.length < 2 || positions.length > MAX_BUCKET_SIZE) {
            continue;
        }

        for (let a = 0; a < positions.length; a++) {
            for (let b = a + 1; b < positions.length; b++) {
                const seedA = positions[a];
                const seedB = positions[b];

                // Two overlapping windows in the same file are the same occurrence being
                // re-detected by the slide, not two independent copies.
                if (sameFile(origins, seedA, seedB) && Math.abs(seedA - seedB) < minTokens) {
                    continue;
                }

                const length = extendMatch(normalizedTokens, origins, seedA, seedB, minTokens);
                const lineSpanA = origins[Math.min(seedA + length - 1, normalizedTokens.length - 1)].line
                    - origins[seedA].line + 1;

                if (length < minTokens && lineSpanA < minLines) {
                    continue;
                }

                markCoveredLines(coveredLines, origins, fileTokenLists, seedA, length);
                markCoveredLines(coveredLines, origins, fileTokenLists, seedB, length);

                if (matches.length < 20) {
                    matches.push({
                        tokens: length,
                        lines: lineSpanA,
                        occurrenceA: {
                            file: fileTokenLists[origins[seedA].fileIndex].relativeFile,
                            line: origins[seedA].line,
                        },
                        occurrenceB: {
                            file: fileTokenLists[origins[seedB].fileIndex].relativeFile,
                            line: origins[seedB].line,
                        },
                    });
                }
            }
        }
    }

    return {
        coveredLines,
        totalTokenBearingLines: allTokenLines.size,
        matches,
    };
}

function summarize(projectRoot, config = {}) {
    const sourceRoots = Array.isArray(config.source_roots) && config.source_roots.length > 0
        ? config.source_roots
        : ['src'];
    const sourceExtensions = new Set(
        Array.isArray(config.source_extensions) && config.source_extensions.length > 0
            ? config.source_extensions
            : ['.ts', '.tsx'],
    );
    const files = listProductionFiles(projectRoot, sourceRoots, sourceExtensions);
    const fileTokenLists = files.map((filePath) =>
        tokenizeFile(filePath, toPosixPath(path.relative(projectRoot, filePath)))
    );
    const { coveredLines, totalTokenBearingLines, matches } = detectClones(fileTokenLists, config);
    const duplicatedLines = coveredLines.size;
    const ratio = totalTokenBearingLines === 0
        ? 0
        : Number((duplicatedLines / totalTokenBearingLines).toFixed(6));

    return {
        ratio,
        duplicatedLines,
        totalTokenBearingLines,
        fileCount: files.length,
        matches,
    };
}

export async function run({ targetDir, baselineDir, config }) {
    const target = summarize(targetDir, config ?? {});
    const baseline = baselineDir && fs.existsSync(baselineDir) ? summarize(baselineDir, config ?? {}) : null;
    const delta = computeDelta(target.ratio, baseline?.ratio, 6);

    const findings = appendBaselineDeltaFinding([
        `Duplicated lines: ${target.duplicatedLines}/${target.totalTokenBearingLines} (${target.ratio})`,
        `Clone matches found: ${target.matches.length}${target.matches.length >= 20 ? '+ (sample capped)' : ''}`,
    ], delta, {
        missingBaselineMessage: 'Baseline is unavailable; delta_vs_baseline is set to null.',
    });

    return buildMetricResult({
        value: target.ratio,
        unit: 'ratio',
        direction: 'lower_is_better',
        delta,
        findings,
        rawArtifactPath: config?.raw_artifact_path,
        details: {
            target,
            baseline,
            formula: 'duplicated_lines_covered / total_token_bearing_production_lines',
        },
    });
}
