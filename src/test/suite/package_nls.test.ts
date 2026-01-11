
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

suite('Package NLS Alignment Test Suite', () => {
    let baseKeys: string[];
    let projectRoot: string;
    let nlsFiles: string[];

    setup(() => {
        // Find project root
        projectRoot = path.resolve(__dirname, '../../../');
        const baseFile = path.join(projectRoot, 'package.nls.json');

        if (!fs.existsSync(baseFile)) {
            throw new Error(`Base NLS file not found at ${baseFile}`);
        }

        const baseContent = JSON.parse(fs.readFileSync(baseFile, 'utf8'));
        baseKeys = Object.keys(baseContent);

        nlsFiles = fs.readdirSync(projectRoot).filter(f =>
            f.startsWith('package.nls.') && f.endsWith('.json') && f !== 'package.nls.json'
        );
    });

    test('All package.nls.<locale>.json files should have exactly matching keys with base bundle (1:1 alignment)', () => {
        assert.ok(nlsFiles.length >= 12, 'Should have all supported language files');

        nlsFiles.forEach(file => {
            const filePath = path.join(projectRoot, file);
            const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            const fileKeys = Object.keys(content);

            // Check for missing keys
            const missingKeys = baseKeys.filter(k => !fileKeys.includes(k));

            // Check for extra keys
            const extraKeys = fileKeys.filter(k => !baseKeys.includes(k));

            assert.strictEqual(
                missingKeys.length,
                0,
                `[${file}] Missing keys found in NLS file: \n${missingKeys.join('\n')}`
            );

            assert.strictEqual(
                extraKeys.length,
                0,
                `[${file}] Extra keys found in NLS file: \n${extraKeys.join('\n')}`
            );
        });
    });

    test('All placeholders in package.json should exist in package.nls.json', () => {
        const packageJsonPath = path.join(projectRoot, 'package.json');
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

        const placeholders = new Set<string>();

        function findPlaceholders(obj: any) {
            if (typeof obj === 'string' && obj.startsWith('%') && obj.endsWith('%')) {
                placeholders.add(obj.slice(1, -1));
            } else if (typeof obj === 'object' && obj !== null) {
                Object.values(obj).forEach(v => findPlaceholders(v));
            }
        }

        findPlaceholders(packageJson);

        placeholders.forEach(p => {
            assert.ok(
                baseKeys.includes(p),
                `Placeholder "%${p}%" found in package.json but missing from package.nls.json`
            );
        });
    });
});
