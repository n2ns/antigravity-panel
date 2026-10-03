import * as assert from 'assert';
import * as path from 'path';
import * as sinon from 'sinon';

// Plain require so the stubs hit the same fs object the scripts use
const fs = require('fs') as typeof import('fs');

const { placeholders, compareLocales } = require(
    path.resolve(process.cwd(), 'scripts/check_l10n.js')
) as {
    placeholders(v: unknown): string;
    compareLocales(bundleLocales: string[], nlsLocales: string[]): string[];
};

const { sync } = require(
    path.resolve(process.cwd(), 'scripts/sync-build.js')
) as {
    sync(): Promise<void>;
};

suite('Build Scripts Test Suite', () => {
    suite('check_l10n', () => {
        test('placeholders should accept the { message, comment } form', () => {
            assert.strictEqual(placeholders({ message: 'Used {1} of {0}', comment: 'quota' }), '{0},{1}');
            assert.strictEqual(placeholders('Used {1} of {0}'), '{0},{1}');
        });

        test('compareLocales should report locales present on one side only', () => {
            assert.deepStrictEqual(compareLocales(['de', 'fr'], ['de', 'fr']), []);
            const mismatches = compareLocales(['de', 'fr'], ['de', 'es']);
            assert.strictEqual(mismatches.length, 2);
            assert.ok(mismatches.some(m => m.includes('"fr"')));
            assert.ok(mismatches.some(m => m.includes('"es"')));
        });
    });

    suite('sync-build', () => {
        teardown(() => sinon.restore());

        test('should not throw when the target directory cannot be created', async () => {
            sinon.stub(console, 'log');
            const errorStub = sinon.stub(console, 'error');
            sinon.stub(fs, 'readdirSync').returns(['antigravity-panel.vsix'] as never);
            sinon.stub(fs, 'existsSync').callsFake(p => !String(p).endsWith('Toolkit-for-Antigravity'));
            sinon.stub(fs, 'mkdirSync').throws(new Error('EACCES: permission denied'));
            const copyStub = sinon.stub(fs, 'copyFileSync');

            await sync();

            assert.ok(errorStub.calledOnce);
            assert.ok(copyStub.notCalled);
        });
    });
});
