import { exec } from 'child_process';
import { promisify } from 'util';
import { readdir } from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);
const LOC_EXTENSIONS = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

/**
 * Run a shell command, returning { stdout, stderr, code }.
 * With ignoreError:true, failures are returned as data instead of thrown.
 */
export async function runCommand(cmd, cwd = process.cwd(), { ignoreError = false } = {}) {
  try {
    const { stdout, stderr } = await execAsync(cmd, {
      cwd,
      maxBuffer: 20 * 1024 * 1024,
      env: { ...process.env }
    });
    return { stdout, stderr, code: 0 };
  } catch (err) {
    if (ignoreError) {
      return { stdout: err.stdout ?? '', stderr: err.stderr ?? '', code: err.code ?? 1 };
    }
    throw err;
  }
}

/**
 * Recursively count lines of code in .ts/.tsx/.js/.jsx/.mjs/.cjs files,
 * skipping node_modules and hidden directories.
 */
export async function countLOC(dir) {
  let total = 0;

  async function walk(d) {
    let entries;
    try {
      entries = await readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const fullPath = path.join(d, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && LOC_EXTENSIONS.test(entry.name)) {
        try {
          const { stdout } = await execAsync(`wc -l < "${fullPath}"`);
          total += parseInt(stdout.trim(), 10) || 0;
        } catch {
          // skip unreadable files
        }
      }
    }
  }

  await walk(dir);
  return total;
}

/** Normalise a raw count to per-1000 lines of code. */
export function perKLOC(count, loc) {
  if (!loc) return 0;
  return parseFloat((count / (loc / 1000)).toFixed(2));
}
