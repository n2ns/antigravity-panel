import * as assert from 'assert';
import { getDetailedOSVersion, getIdeProductVersion } from '../../shared/utils/platform';

suite('Platform Utils Test Suite', () => {
    test('getDetailedOSVersion should return a string containing platform and arch', () => {
        const version = getDetailedOSVersion();
        assert.strictEqual(typeof version, 'string');
        assert.ok(version.includes(process.arch), 'Should include architecture');
    });

    test('getDetailedOSVersion format check', () => {
        const version = getDetailedOSVersion();
        if (process.platform === 'win32') {
            assert.ok(version.includes('Windows'), 'Should identify as Windows');
        } else if (process.platform === 'darwin') {
            assert.ok(version.includes('macOS'), 'Should identify as macOS');
        } else if (process.platform === 'linux') {
            assert.ok(version.includes('Linux') || version.includes('Ubuntu') || version.includes('Debian') || version.includes('CentOS') || version.includes('Fedora'), 'Should identify as Linux or a Distribution');
        }
    });

    test('getIdeProductVersion should read ideVersion from product.json', () => {
        // Observed live: Antigravity product.json carries the product release in
        // "ideVersion" while "version" holds the VS Code base version
        const reader = () => JSON.stringify({ version: '1.107.0', ideVersion: '2.1.1' });
        assert.strictEqual(getIdeProductVersion('/app/root', reader), '2.1.1');
    });

    test('getIdeProductVersion should return undefined when field or file is missing', () => {
        assert.strictEqual(getIdeProductVersion('/app/root', () => JSON.stringify({ version: '1.107.0' })), undefined);
        assert.strictEqual(getIdeProductVersion('/app/root', () => { throw new Error('ENOENT'); }), undefined);
        assert.strictEqual(getIdeProductVersion('/app/root', () => 'not json'), undefined);
    });
});
