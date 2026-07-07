// mock/test_constraints.mjs
import path from 'node:path';
// 【修改点 1】因为脚本现在在 mock/ 目录下，所以相对路径要多退一层 (../)
import { runConstraints } from '../core/layers/constraints_runner.mjs';

async function main() {
    const taskConfig = {
        enabled: {
            constraints: ['eslint-strict-react', 'tsc-no-emit', 'non-existent-rule']
        }
    };

    const targetDir = '/tmp/dummy-workspace';

    // 【修改点 2】指向你根目录实际存在的 rulepacks 文件夹
    const rulepackDir = path.resolve(process.cwd(), 'rulepacks');

    console.log('--- Starting Constraints Runner ---');

    const results = await runConstraints({ targetDir, rulepackDir, taskConfig });

    console.log(JSON.stringify(results, null, 2));
}

main();