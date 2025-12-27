const fs = require('fs');
const path = require('path');

const rootDir = 'd:/DevSpace/Antigravity-panel';
const l10nDir = path.join(rootDir, 'l10n');
const fileNames = fs.readdirSync(l10nDir).filter(f => f.startsWith('bundle.l10n.') && f.endsWith('.json'));

const labelsToKeepEnglish = [
    "Rules",
    "MCP",
    "Allowlist",
    "Feedback",
    "Star",
    "Restart Service",
    "Reset Status",
    "Reload Window",
    "Auto-Accept",
    "Restart Agent Service"
];

fileNames.forEach(fileName => {
    const filePath = path.join(l10nDir, fileName);
    const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    // Add missing labels if they are not the base bundle
    labelsToKeepEnglish.forEach(label => {
        content[label] = label;
    });

    fs.writeFileSync(filePath, JSON.stringify(content, null, 4), 'utf8');
    console.log(`Verified labels in ${fileName}`);
});
