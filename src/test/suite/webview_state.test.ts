import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { build } from 'esbuild';

suite('Webview State Test Suite', () => {
    test('backend updates should preserve local footer collapse state', async () => {
        const sidebarPath = path.resolve(process.cwd(), 'src/view/webview/components/sidebar-app.ts');
        const result = await build({
            stdin: {
                contents: `export { SidebarApp } from ${JSON.stringify(sidebarPath)};`,
                loader: 'ts',
                resolveDir: process.cwd()
            },
            bundle: true,
            platform: 'node',
            format: 'cjs',
            target: 'node20',
            write: false,
            logLevel: 'silent'
        });
        const outputPath = path.join(os.tmpdir(), `antigravity-webview-state-${process.pid}-${Date.now()}.cjs`);
        fs.writeFileSync(outputPath, result.outputFiles[0].contents);

        try {
            const script = `
                let persistedState = {
                    payload: { connectionStatus: 'detecting' },
                    footerCollapsed: true
                };
                const vscodeApi = {
                    postMessage() {},
                    getState() { return persistedState; },
                    setState(state) { persistedState = state; }
                };
                global.window = {};
                global.acquireVsCodeApi = () => vscodeApi;
                const { SidebarApp } = require(${JSON.stringify(outputPath)});
                const sidebar = new SidebarApp();
                sidebar._handleMessage({
                    data: {
                        type: 'update',
                        payload: { connectionStatus: 'connected' }
                    }
                });
                process.stdout.write(JSON.stringify(persistedState));
            `;
            const output = execFileSync(process.execPath, ['-e', script], {
                encoding: 'utf8'
            });
            const persistedState = JSON.parse(output) as Record<string, unknown>;

            assert.strictEqual(
                persistedState.footerCollapsed,
                true,
                'Backend payload updates must not erase local Webview UI state'
            );
            assert.deepStrictEqual(
                persistedState.payload,
                { connectionStatus: 'connected' }
            );
        } finally {
            fs.unlinkSync(outputPath);
        }
    });
});
