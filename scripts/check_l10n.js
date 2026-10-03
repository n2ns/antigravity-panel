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
    'Delete',
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
    'View',
    'Weekly',
];

// package.nls keys whose value must be identical in every language: brand names,
// plus every command title (command.*.title) found in the English package.nls.json.
const PROTECTED_NLS_BRAND_KEYS = [
    'extension.category',
    'views.tfa.sidebar.name',
    'viewsContainers.tfa-sidebar.title',
];
const PROTECTED_NLS_KEYS = [
    ...PROTECTED_NLS_BRAND_KEYS,
    ...Object.keys(JSON.parse(fs.readFileSync(path.join(ROOT, 'package.nls.json'), 'utf8')))
        .filter((k) => /^command\..+\.title$/.test(k)),
];

const errors = [];

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// VS Code accepts either a plain string or { "message", "comment" } as a value.
function message(v) {
    return typeof v === 'string' ? v : (v && v.message) || '';
}

function placeholders(v) {
    return (message(v).match(/\{\d+\}/g) || []).sort().join(',');
}

function compareLocales(bundleLocales, nlsLocales) {
    const mismatches = [];
    for (const l of bundleLocales) {
        if (!nlsLocales.includes(l)) mismatches.push(`locale ${JSON.stringify(l)} has a bundle.l10n file but no package.nls file`);
    }
    for (const l of nlsLocales) {
        if (!bundleLocales.includes(l)) mismatches.push(`locale ${JSON.stringify(l)} has a package.nls file but no bundle.l10n file`);
    }
    return mismatches;
}

function checkGroup(defaultFile, pattern, dir, protectedKeys, protectedValueOf) {
    const defaults = readJson(path.join(ROOT, dir, defaultFile));
    const defaultKeys = Object.keys(defaults);

    for (const k of protectedKeys) {
        if (!(k in defaults)) {
            errors.push(`${path.join(dir, defaultFile)}: protected label ${JSON.stringify(k)} is missing`);
        }
    }

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
            if (k in data && message(data[k]) !== message(protectedValueOf(k, defaults))) {
                errors.push(
                    `${rel}: protected label ${JSON.stringify(k)} must stay as ` +
                    `${JSON.stringify(message(protectedValueOf(k, defaults)))}, got ${JSON.stringify(message(data[k]))}`
                );
            }
        }
    }
    return files.map((f) => f.match(pattern)[1]);
}

function main() {
    const bundleLocales = checkGroup(
        'bundle.l10n.json',
        /^bundle\.l10n\.(.+)\.json$/,
        'l10n',
        PROTECTED_BUNDLE_LABELS,
        (k) => k
    );

    const nlsLocales = checkGroup(
        'package.nls.json',
        /^package\.nls\.(.+)\.json$/,
        '.',
        PROTECTED_NLS_KEYS,
        (k, defaults) => defaults[k]
    );

    errors.push(...compareLocales(bundleLocales, nlsLocales));

    if (errors.length > 0) {
        console.error(`l10n check FAILED (${errors.length} problem${errors.length > 1 ? 's' : ''}):`);
        for (const e of errors) console.error('  - ' + e);
        process.exit(1);
    }

    console.log(`l10n check OK: ${bundleLocales.length} languages (+ English default), all keys and protected labels consistent.`);
}

if (require.main === module) {
    main();
}

module.exports = {
    placeholders,
    compareLocales,
};
