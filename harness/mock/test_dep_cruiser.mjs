// mock/test_dep_cruiser.mjs
import fs from 'node:fs';
import path from 'node:path';
import { run } from '../rulepacks/constraints/dep-cruiser-layer.mjs';

// 辅助函数：构造假的工作区
function createWorkspace(baseDir, files) {
    if (fs.existsSync(baseDir)) {
        fs.rmSync(baseDir, { recursive: true, force: true });
    }
    for (const [filePath, content] of Object.entries(files)) {
        const fullPath = path.join(baseDir, filePath);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, content);
    }
}

async function main() {
    const goodWorkspace = path.resolve(process.cwd(), '/tmp/harness-test-good');
    const badWorkspace = path.resolve(process.cwd(), '/tmp/harness-test-bad');

    // 1. 构造 Baseline Workspace (合规：Controller -> Service -> Repository)
    createWorkspace(goodWorkspace, {
        'src/user.repository.ts': `export class UserRepository {}`,
        'src/user.service.ts': `
      import { UserRepository } from './user.repository';
      export class UserService {}
    `,
        'src/user.controller.ts': `
      import { UserService } from './user.service';
      export class UserController {}
    `
    });

    // 2. 构造 Agent 修改后的违规 Workspace (违规：Controller 直接导入了 Repository)
    createWorkspace(badWorkspace, {
        'src/user.repository.ts': `export class UserRepository {}`,
        'src/user.controller.ts': `
      import { UserRepository } from './user.repository';
      export class UserController {}
    `
    });

    console.log('--- Testing Baseline Workspace (Should have 0 findings) ---');
    const goodResult = await run({ targetDir: goodWorkspace });
    console.log(`Status: ${goodResult.status}, Findings count: ${goodResult.findings.length}`);
    if (goodResult.findings.length > 0) console.log(goodResult.findings);

    console.log('\n--- Testing Bad Workspace (Should have 1 finding) ---');
    const badResult = await run({ targetDir: badWorkspace });
    console.log(`Status: ${badResult.status}, Findings count: ${badResult.findings.length}`);
    if (badResult.findings.length > 0) console.log(badResult.findings);
}

main();