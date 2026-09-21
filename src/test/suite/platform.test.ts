import * as assert from 'assert';
import fs from 'fs';
import * as os from 'os';
import * as sinon from 'sinon';
import { getDetailedOSVersion, getIdeProductInfo } from '../../shared/utils/platform';

suite('Platform Utils Test Suite', () => {
    test('getDetailedOSVersion should return a string containing platform and arch', () => {
        const version = getDetailedOSVersion();
        assert.strictEqual(typeof version, 'string');
        assert.ok(version.includes(process.arch), 'Should include architecture');
    });

    test('getDetailedOSVersion format check', () => {
        const sandbox = sinon.createSandbox();
        try {
            if (process.platform === 'linux') {
                sandbox.stub(fs, 'existsSync').withArgs('/etc/os-release').returns(true);
                sandbox.stub(fs, 'readFileSync').withArgs('/etc/os-release', 'utf8').returns('PRETTY_NAME="openSUSE Tumbleweed"');
            }
            const version = getDetailedOSVersion();
            if (process.platform === 'win32') {
                assert.ok(version.includes('Windows'), 'Should identify as Windows');
            } else if (process.platform === 'darwin') {
                assert.ok(version.includes('macOS'), 'Should identify as macOS');
            } else if (process.platform === 'linux') {
                assert.strictEqual(version, `openSUSE Tumbleweed (Kernel ${os.release()}, ${process.arch})`);
            }
        } finally {
            sandbox.restore();
        }
    });

    test('getIdeProductInfo should read identity and ideVersion from product.json', () => {
        // Observed live: Antigravity product.json carries the product release in
        // "ideVersion" while "version" holds the VS Code base version
        const reader = () => JSON.stringify({ nameLong: 'Antigravity', applicationName: 'antigravity', version: '1.107.0', ideVersion: '2.1.1' });
        assert.deepStrictEqual(getIdeProductInfo('/app/root', reader), {
            productName: 'Antigravity', applicationName: 'antigravity', productVersion: '2.1.1'
        });
    });

    test('getIdeProductInfo should preserve identity without an Antigravity product version', () => {
        assert.deepStrictEqual(getIdeProductInfo('/app/root', () => JSON.stringify({ nameLong: 'Visual Studio Code', applicationName: 'code', version: '1.107.0' })), {
            productName: 'Visual Studio Code', applicationName: 'code', productVersion: undefined
        });
    });

    test('getIdeProductInfo should tolerate missing fields or unreadable files', () => {
        assert.deepStrictEqual(getIdeProductInfo('/app/root', () => JSON.stringify({ version: '1.107.0' })), {
            productName: undefined, applicationName: undefined, productVersion: undefined
        });
        assert.deepStrictEqual(getIdeProductInfo('/app/root', () => { throw new Error('ENOENT'); }), {});
        assert.deepStrictEqual(getIdeProductInfo('/app/root', () => 'not json'), {});
    });
});
