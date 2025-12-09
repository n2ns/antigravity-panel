/**
 * 纯 Mocha 测试运行器 - 不需要 VS Code 环境
 * 用于运行所有单元测试（不启动 VS Code Extension Host）
 *
 * 所有测试都使用 Mock 对象，不依赖真实的 VS Code API
 */
import Mocha from 'mocha';
import * as path from 'path';
import { glob } from 'glob';
import Module from 'module';

// Mock vscode module for tests
const vscodeModulePath = path.resolve(__dirname, 'mocks', 'vscode.js');
// @ts-ignore - Monkey patching Module.prototype.require
const originalRequire = Module.prototype.require;
// @ts-ignore
Module.prototype.require = function(id: string) {
    if (id === 'vscode') {
        // @ts-ignore
        return originalRequire.call(this, vscodeModulePath);
    }
    // @ts-ignore
    return originalRequire.apply(this, arguments);
};

async function run(): Promise<void> {
    const mocha = new Mocha({
        ui: 'tdd',
        color: true,
        timeout: 10000
    });

    const testsRoot = __dirname;

    try {
        // 运行所有测试文件
        const files = await glob('suite/*.test.js', { cwd: testsRoot });

        if (files.length === 0) {
            console.log('No test files found');
            return;
        }

        console.log(`\n🧪 Running ${files.length} test files in pure Node.js environment:\n`);
        files.forEach(f => console.log(`  ✓ ${f}`));
        console.log('');

        files.forEach(f => mocha.addFile(path.resolve(testsRoot, f)));

        return new Promise<void>((resolve, reject) => {
            mocha.run((failures: number) => {
                if (failures > 0) {
                    reject(new Error(`${failures} tests failed.`));
                } else {
                    resolve();
                }
            });
        });
    } catch (err) {
        console.error('Test runner error:', err);
        throw err;
    }
}

run()
    .then(() => {
        console.log('\n✅ All unit tests passed! (Pure Node.js environment)');
        process.exit(0);
    })
    .catch(err => {
        console.error('\n❌ Tests failed:', err.message);
        process.exit(1);
    });
