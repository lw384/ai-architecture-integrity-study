import { execSync } from 'node:child_process';
import os from 'node:os';

// Execute a metadata command without allowing collection failures to abort evaluation.
function safeExec(command, fallback = 'unknown') {
  try {
    return execSync(command, { encoding: 'utf8', stdio: 'pipe' }).trim();
  } catch {
    return fallback;
  }
}

// Capture the runtime and analyzer versions required to reproduce this evaluation.
export function getEnvSnapshot({ rulepack = {} }) {
  return {
    node_version: process.version,
    pnpm_version: safeExec('pnpm --version'),
    harness_commit: safeExec('git rev-parse HEAD'),
    os: `${os.type()} ${os.release()} (${os.arch()})`,
    tool_versions: rulepack.tool_versions ?? {},
  };
}
