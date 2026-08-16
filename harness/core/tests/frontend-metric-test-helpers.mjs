import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export async function runFrontendMetric(run, files, config = {}) {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'frontend-metric-'));

    try {
        for (const [relativePath, content] of Object.entries(files)) {
            const filePath = path.join(rootDir, relativePath);
            fs.mkdirSync(path.dirname(filePath), { recursive: true });
            fs.writeFileSync(filePath, content, 'utf8');
        }

        return await run({ targetDir: rootDir, baselineDir: null, config });
    } finally {
        fs.rmSync(rootDir, { recursive: true, force: true });
    }
}
