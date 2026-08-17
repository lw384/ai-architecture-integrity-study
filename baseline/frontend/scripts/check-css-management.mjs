import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = path.join(frontendRoot, 'src');
const styleExtensionPattern = /\.(css|scss|sass)$/;
const moduleStylePattern = /\.module\.(css|scss|sass)$/;

const moduleRules = [
  {
    pattern: /#[\da-f]{3,8}\b|(?:rgb|hsl)a?\(/i,
    message: 'Theme colors in CSS Modules must use an --app-* variable.'
  },
  {
    pattern: /!important/,
    message: 'CSS Modules must not use !important.'
  },
  {
    pattern: /\.Mui[A-Z]/,
    message: 'CSS Modules must not override MUI implementation classes.'
  },
  {
    pattern: /var\(--(?:color|spacing-base|radius|shadow-soft)/,
    message: 'Legacy CSS tokens are not allowed; use an --app-* variable.'
  }
];

async function pathExists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nestedFiles = await Promise.all(
    entries.map((entry) => {
      const entryPath = path.join(directory, entry.name);
      return entry.isDirectory() ? listFiles(entryPath) : [entryPath];
    })
  );

  return nestedFiles.flat();
}

function relativePath(targetPath) {
  return path.relative(frontendRoot, targetPath);
}

async function checkTailwindIsAbsent(violations) {
  const configNames = ['tailwind.config.js', 'tailwind.config.cjs', 'tailwind.config.mjs', 'tailwind.config.ts'];

  for (const configName of configNames) {
    const configPath = path.join(frontendRoot, configName);
    if (await pathExists(configPath)) {
      violations.push(`${configName}: Tailwind configuration is not allowed.`);
    }
  }

  const packagePath = path.join(frontendRoot, 'package.json');
  const packageData = JSON.parse(await readFile(packagePath, 'utf8'));
  const dependencies = { ...packageData.dependencies, ...packageData.devDependencies };

  if (dependencies.tailwindcss) {
    violations.push('package.json: tailwindcss must not be installed.');
  }
}

async function checkStyleFile(filePath, violations) {
  const relativeFilePath = relativePath(filePath);
  const isThirdPartyStyle = relativeFilePath.startsWith(`src${path.sep}assets${path.sep}third-party${path.sep}`);
  const content = await readFile(filePath, 'utf8');

  if (/@(tailwind|apply)\b/.test(content)) {
    violations.push(`${relativeFilePath}: Tailwind directives are not allowed.`);
  }

  if (!moduleStylePattern.test(filePath)) {
    if (!isThirdPartyStyle) {
      violations.push(`${relativeFilePath}: application styles must use CSS Modules; global CSS belongs in MUI CssBaseline.`);
    }
    return;
  }

  for (const rule of moduleRules) {
    if (rule.pattern.test(content)) {
      violations.push(`${relativeFilePath}: ${rule.message}`);
    }
  }
}

async function main() {
  const violations = [];
  await checkTailwindIsAbsent(violations);

  const sourceFiles = await listFiles(sourceRoot);
  const styleFiles = sourceFiles.filter((filePath) => styleExtensionPattern.test(filePath));
  await Promise.all(styleFiles.map((filePath) => checkStyleFile(filePath, violations)));

  if (violations.length > 0) {
    console.error('CSS management checks failed:\n');
    for (const violation of violations.sort()) {
      console.error(`- ${violation}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`CSS management checks passed (${styleFiles.length} stylesheet files checked).`);
}

await main();
