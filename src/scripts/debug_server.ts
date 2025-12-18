import Module from 'module';

// Mock vscode module BEFORE other imports
// @ts-expect-error: Module require is internal
const originalRequire = Module.prototype.require;

// @ts-expect-error: Patching module system
Module.prototype.require = function (id: string, ...args: unknown[]) {
    if (id === 'vscode') {
        return {
            window: {
                createOutputChannel: () => ({
                    appendLine: (val: string) => console.log(`[LOG] ${val}`),
                    show: () => { },
                    dispose: () => { }
                }),
                showErrorMessage: (msg: string) => console.error(msg)
            },
            workspace: {
                getConfiguration: () => ({
                    get: () => undefined,
                    update: () => Promise.resolve()
                })
            },
            Disposable: class { dispose() { } }
        };
    }
    // @ts-expect-error: Calling original require
    return originalRequire.apply(this, [id, ...args]);
};

// Imports must be after the mock is set up (or use dynamic import, but requiring module patch works if this file is entry point)
import { ProcessFinder } from '../shared/platform/process_finder';
import { httpRequest } from '../shared/utils/http_client';
import { initLogger, setDebugMode } from '../shared/utils/logger';

async function main() {
    console.log('================================================');
    console.log('   Antigravity Language Server Debug Tool');
    console.log('================================================');

    // Init logger with fake context
    console.log('Initializing logger...');
    initLogger({ subscriptions: [] } as unknown as vscode.ExtensionContext);
    setDebugMode(true);

    console.log('🔍 Detecting Language Server process...');
    const finder = new ProcessFinder();
    const serverInfo = await finder.detect({ verbose: true });

    if (!serverInfo) {
        console.error('\n❌ Could not find Language Server process.');
        console.error('   Please make sure the Antigravity IDE (Cursor/VSCode) is running.');
        process.exit(1);
    }

    console.log(`\n✅ Found Server!`);
    console.log(`   Port: ${serverInfo.port}`);
    console.log(`   CSRF Token: ${serverInfo.csrfToken.substring(0, 10)}...`);

    console.log('\n📡 Sending request to GetUserStatus...');

    try {
        const response = await httpRequest({
            hostname: '127.0.0.1',
            port: serverInfo.port,
            path: '/exa.language_server_pb.LanguageServerService/GetUserStatus',
            method: 'POST',
            headers: {
                'X-Codeium-Csrf-Token': serverInfo.csrfToken,
                'Connect-Protocol-Version': '1'
            },
            body: JSON.stringify({})
        });

        console.log('\n📊 Response Status:', response.statusCode);
        console.log('------------------------------------------------');
        console.log(JSON.stringify(response.data, null, 2));
        console.log('------------------------------------------------');
        console.log('Protocol used:', response.protocol);

    } catch (err) {
        console.error('\n❌ Request failed:', err);
    }
}

main().catch(err => console.error('Unhandled error:', err));
