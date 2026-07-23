import fs from 'node:fs';
import path from 'node:path';

function ensureReportShape(report, label) {
    if (!report || typeof report !== 'object' || !Array.isArray(report.modules)) {
        throw new Error(`${label} must be a dep-cruiser JSON object with a modules array.`);
    }
}

function readReport(rootDir, reportPath) {
    const fullPath = path.join(rootDir, reportPath);

    if (!fs.existsSync(fullPath)) {
        throw new Error(`Dep-cruiser report not found at ${fullPath}`);
    }

    const report = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    ensureReportShape(report, `Report at ${fullPath}`);
    return report;
}

export function readRequiredReport(rootDir, reportPath, label = 'Target dep-cruiser report') {
    if (!rootDir) {
        throw new Error(`${label} root directory is required.`);
    }

    return readReport(rootDir, reportPath);
}

export function readOptionalReport(rootDir, reportPath) {
    if (!rootDir) {
        return null;
    }

    const fullPath = path.join(rootDir, reportPath);

    if (!fs.existsSync(fullPath)) {
        return null;
    }

    const report = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    ensureReportShape(report, `Report at ${fullPath}`);
    return report;
}

export function resolveMetricReports({ targetDir, baselineDir, config = {}, baselineOptional = false }) {
    const reportPath = config.report_path ?? 'reports/depcruise-raw.json';

    return {
        baselineReport: baselineOptional
            ? readOptionalReport(baselineDir, reportPath)
            : readRequiredReport(baselineDir, reportPath, 'Baseline dep-cruiser report'),
        targetReport: readRequiredReport(targetDir, reportPath),
    };
}