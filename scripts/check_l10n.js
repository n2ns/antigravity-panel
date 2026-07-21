/**
 * Localization consistency checker.
 *
 * Validates all l10n/bundle.l10n.*.json and package.nls.*.json files against
 * their English defaults (bundle.l10n.json / package.nls.json):
 *
 *   1. Key sets must be identical (no missing or extra keys).
 *   2. Placeholders ({0}, {1}, ...) in a translation must match the source string.
 *   3. Protected technical labels must remain in English verbatim
 *      (see docs/LOCALIZATION_RULES.md, rule 1).
 *
 * Usage: node ./scripts/check_l10n.js   (exit code 1 on any violation)
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// Labels that must stay in English in every language (LOCALIZATION_RULES.md rule 1).
const PROTECTED_BUNDLE_LABELS = [
    'Allowlist',
    'Auto-Accept',
    'Brain',
    'Code Tracker',
    'Docs',
    'Feedback',
    'Flow',
    'MCP',
    'Prompt',
    'Reload Window',
    'Restart Service',
    'Rules',
    'Run Diagnostics',
    'Settings',
    'Show Details',
    'Star',
    'Usage History',
    'View',
];

// package.nls keys whose value must be identical in every language (brand names).
const PROTECTED_NLS_KEYS = [
    'extension.category',
    'views.tfa.sidebar.name',
    'viewsContainers.tfa-sidebar.title',
];

const errors = [];

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function placeholders(s) {
    return (s.match(/\{\d+\}/g) || []).sort().join(',');
}

function checkGroup(defaultFile, pattern, dir, protectedKeys, protectedValueOf) {
    const defaults = readJson(path.join(ROOT, dir, defaultFile));
    const defaultKeys = Object.keys(defaults);

    const files = fs.readdirSync(path.join(ROOT, dir))
        .filter((f) => pattern.test(f) && f !== defaultFile)
        .sort();

    for (const file of files) {
        const rel = path.join(dir, file);
        const data = readJson(path.join(ROOT, dir, file));

        for (const k of defaultKeys) {
            if (!(k in data)) errors.push(`${rel}: missing key ${JSON.stringify(k)}`);
        }
        for (const k of Object.keys(data)) {
            if (!(k in defaults)) errors.push(`${rel}: extra key ${JSON.stringify(k)}`);
        }

        for (const [k, v] of Object.entries(data)) {
            if (!(k in defaults)) continue;
            if (placeholders(defaults[k]) !== placeholders(v)) {
                errors.push(`${rel}: placeholder mismatch for ${JSON.stringify(k)}`);
            }
        }

        for (const k of protectedKeys) {
            if (k in data && data[k] !== protectedValueOf(k, defaults)) {
                errors.push(
                    `${rel}: protected label ${JSON.stringify(k)} must stay as ` +
                    `${JSON.stringify(protectedValueOf(k, defaults))}, got ${JSON.stringify(data[k])}`
                );
            }
        }
    }
    return files.length;
}

const bundleCount = checkGroup(
    'bundle.l10n.json',
    /^bundle\.l10n\..+\.json$/,
    'l10n',
    PROTECTED_BUNDLE_LABELS,
    (k) => k
);

const nlsCount = checkGroup(
    'package.nls.json',
    /^package\.nls\..+\.json$/,
    '.',
    PROTECTED_NLS_KEYS,
    (k, defaults) => defaults[k]
);

if (bundleCount !== nlsCount) {
    errors.push(
        `language count mismatch: ${bundleCount} bundle.l10n.*.json vs ${nlsCount} package.nls.*.json`
    );
}

if (errors.length > 0) {
    console.error(`l10n check FAILED (${errors.length} problem${errors.length > 1 ? 's' : ''}):`);
    for (const e of errors) console.error('  - ' + e);
    process.exit(1);
}

console.log(`l10n check OK: ${bundleCount} languages (+ English default), all keys and protected labels consistent.`);
