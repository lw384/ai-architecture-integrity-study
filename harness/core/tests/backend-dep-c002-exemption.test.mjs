import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildProject } from '../../adapters/backend-static/project.mjs';
import { analyzeDependencies } from '../../adapters/backend-static/rules/dependencies.mjs';

// Covers the config-driven infrastructure_isolation_exempt_paths option added
// so seed scaffolding (which legitimately needs the real TypeORM entity
// class via dataSource.getRepository(Entity), not just its type) doesn't
// trip BE-DEP-C-002. See RULE_AUDIT.md's BE-DEP-C-002 section for the
// rationale and the alternatives that were ruled out.

function writeFiles(rootDir, files) {
    for (const [relativePath, content] of Object.entries(files)) {
        const filePath = path.join(rootDir, relativePath);
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, content, 'utf8');
    }
}

function buildTempProject(files) {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'be-dep-c002-exemption-'));
    writeFiles(rootDir, files);
    return { rootDir, project: buildProject(rootDir) };
}

const SEED_SCAFFOLDING_FILES = {
    'src/modules/users/user.entity.ts': `export class UserEntity {}`,
    'src/core/seed/seed.utils.ts': `
        import { UserEntity } from '../../modules/users/user.entity';
        export const touch = () => UserEntity;
    `,
};

test('BE-DEP-C-002 fires for src/core/seed/** with no exempt_paths configured (default, backward compatible)', () => {
    const { rootDir, project } = buildTempProject(SEED_SCAFFOLDING_FILES);

    try {
        const findings = analyzeDependencies(project, {});
        const hits = findings.filter((item) => item.ruleId === 'BE-DEP-C-002');

        assert.equal(hits.length, 1);
        assert.equal(hits[0].payload.resolved_target, 'src/modules/users/user.entity.ts');
    } finally {
        fs.rmSync(rootDir, { recursive: true, force: true });
    }
});

test('BE-DEP-C-002 does not fire for src/core/seed/** when the path is listed in infrastructure_isolation_exempt_paths', () => {
    const { rootDir, project } = buildTempProject(SEED_SCAFFOLDING_FILES);

    try {
        const findings = analyzeDependencies(project, {
            infrastructure_isolation_exempt_paths: ['^src/core/seed/'],
        });
        const hits = findings.filter((item) => item.ruleId === 'BE-DEP-C-002');

        assert.equal(hits.length, 0);
    } finally {
        fs.rmSync(rootDir, { recursive: true, force: true });
    }
});

test('the exemption is scoped by path, not blanket-disabled: an unrelated src/core/ file still fires', () => {
    const { rootDir, project } = buildTempProject({
        'src/modules/users/user.entity.ts': `export class UserEntity {}`,
        // NOT under src/core/seed/ — must remain a real violation even with
        // the seed exemption configured.
        'src/core/reporting.ts': `
            import { UserEntity } from '../modules/users/user.entity';
            export const touch = () => UserEntity;
        `,
    });

    try {
        const findings = analyzeDependencies(project, {
            infrastructure_isolation_exempt_paths: ['^src/core/seed/'],
        });
        const hits = findings.filter((item) => item.ruleId === 'BE-DEP-C-002');

        assert.equal(hits.length, 1);
        assert.equal(hits[0].location.file, 'src/core/reporting.ts');
    } finally {
        fs.rmSync(rootDir, { recursive: true, force: true });
    }
});

test('the exemption pattern requires the trailing slash: a same-prefix file like src/core/seed.ts still fires', () => {
    const { rootDir, project } = buildTempProject({
        'src/modules/users/user.entity.ts': `export class UserEntity {}`,
        'src/core/seed.ts': `
            import { UserEntity } from '../modules/users/user.entity';
            export const touch = () => UserEntity;
        `,
    });

    try {
        const findings = analyzeDependencies(project, {
            infrastructure_isolation_exempt_paths: ['^src/core/seed/'],
        });
        const hits = findings.filter((item) => item.ruleId === 'BE-DEP-C-002');

        assert.equal(hits.length, 1);
        assert.equal(hits[0].location.file, 'src/core/seed.ts');
    } finally {
        fs.rmSync(rootDir, { recursive: true, force: true });
    }
});
