/**
 * Server Integration Test Runner - runs only tests in suite/integration/
 *
 * Mocks the vscode API for a pure Node.js execution environment.
 */
import Mocha from 'mocha';
import * as path from 'path';
import { glob } from 'glob';
import Module from 'module';

// Mock vscode module for tests
const vscodeModulePath = path.resolve(__dirname, 'mocks', 'vscode.js');
// @ts-ignore
const originalRequire = Module.prototype.require;
// @ts-ignore
Module.prototype.require = function (id: string, ...args: any[]) {
    if (id === 'vscode') {
        // @ts-ignore
        return originalRequire.call(this, vscodeModulePath);
    }
    // @ts-ignore
    return originalRequire.apply(this, [id, ...args]);
};

async function run(): Promise<void> {
    const mocha = new Mocha({
        ui: 'tdd',
        color: true,
        timeout: 20000 // Server/handshake tests might require longer timeouts
    });

    const testsRoot = __dirname;

    try {
        // Run only integration test files
        const files = await glob('suite/integration/**/*.test.js', { cwd: testsRoot });

        if (files.length === 0) {
            console.log('No integration test files found');
            return;
        }

        console.log(`\n🧪 Running ${files.length} server integration test files in pure Node.js environment:\n`);
        files.forEach(f => console.log(`  ✓ ${f}`));
        console.log('');

        files.forEach(f => mocha.addFile(path.resolve(testsRoot, f)));

        return new Promise<void>((resolve, reject) => {
            mocha.run((failures: number) => {
                if (failures > 0) {
                    reject(new Error(`${failures} integration tests failed.`));
                } else {
                    resolve();
                }
            });
        });
    } catch (err) {
        console.error('Server test runner error:', err);
        throw err;
    }
}

run()
    .then(() => {
        console.log('\n✅ All server integration tests passed! (Pure Node.js environment)');
        process.exit(0);
    })
    .catch(err => {
        console.error('\n❌ Server integration tests failed:', err.message);
        process.exit(1);
    });
