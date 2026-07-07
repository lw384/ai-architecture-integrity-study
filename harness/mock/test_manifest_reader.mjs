// harness/mock/test_manifest_reader.mjs
import path from 'node:path';
import { readManifest } from '../core/io/manifest_reader.mjs';

function main() {
    const readyPath = path.resolve(process.cwd(), 'mock/mock_manifest_ready.json');
    const runningPath = path.resolve(process.cwd(), 'mock/mock_manifest_running.json');

    console.log('--- 1. Testing READY manifest (Should warn about idempotency, then print data) ---');
    const data = readManifest(readyPath);
    console.log('Extracted Data:', data);

    console.log('\n--- 2. Testing RUNNING manifest (Should fail and exit with code 2) ---');
    readManifest(runningPath);
    console.log('This line should NEVER print!');
}

main();