import Module from 'module';

const originalRequire = Module.prototype.require;

const outputChannel = {
    appendLine: (value: string) => console.log(`  ${value}`),
    show: () => undefined,
    hide: () => undefined,
    clear: () => undefined,
    replace: () => undefined,
    append: (value: string) => process.stdout.write(value),
    dispose: () => undefined,
    name: 'Antigravity Panel Debug',
};

Module.prototype.require = function (id: string) {
    if (id === 'vscode') {
        return {
            window: {
                createOutputChannel: () => outputChannel,
            },
            workspace: {
                workspaceFolders: [{
                    uri: { fsPath: process.cwd() },
                    index: 0,
                    name: 'debug-workspace',
                }],
                workspaceFile: undefined,
            },
        };
    }
    return originalRequire.apply(this, [id]);
};

const { ProcessFinder } = require('../../src/shared/platform/process_finder') as
    typeof import('../../src/shared/platform/process_finder');
const { ConfigManager } = require('../../src/shared/config/config_manager') as
    typeof import('../../src/shared/config/config_manager');
const { QuotaService } = require('../../src/model/services/quota.service') as
    typeof import('../../src/model/services/quota.service');
const { initLogger, setDebugMode } = require('../../src/shared/utils/logger') as
    typeof import('../../src/shared/utils/logger');

Module.prototype.require = originalRequire;

class DebugConfigReader {
    get<T>(_key: string, defaultValue: T): T {
        return defaultValue;
    }

    set(_key: string, _value: unknown): void {
        // The debug command never persists configuration.
    }
}

function printHelp(): void {
    console.log(`Usage: npm run debug:server

Compile and run the production ProcessFinder + QuotaService path against the
currently running Antigravity Language Server and print the complete parsed snapshot.`);
}

async function main(): Promise<void> {
    if (process.argv.includes('--help') || process.argv.includes('-h')) {
        printHelp();
        return;
    }

    console.log('Verify production Language Server connection');
    console.log(`Workspace: ${process.cwd()}`);
    console.log(`Platform: ${process.platform} (${process.arch})`);

    initLogger({ subscriptions: [] } as never);
    setDebugMode(true);

    const processFinder = new ProcessFinder();
    const serverInfo = await processFinder.detect({
        attempts: 3,
        baseDelay: 500,
        verbose: true,
    });

    if (!serverInfo) {
        console.error('\nProduction ProcessFinder could not establish a connection.');
        console.error(`Failure reason: ${processFinder.failureReason || 'unknown'}`);
        console.error(`Candidates: ${processFinder.candidateCount}`);
        console.error(`Attempts: ${processFinder.attemptDetails.length}`);
        process.exitCode = 1;
        return;
    }

    console.log(`\nConnected to ${serverInfo.port} with token ${serverInfo.csrfToken}.`);
    console.log(`Protocol: ${processFinder.protocolUsed}`);

    const configManager = new ConfigManager(new DebugConfigReader());
    const quotaService = new QuotaService(configManager);
    quotaService.setServerInfo(serverInfo);
    const snapshot = await quotaService.fetchQuota();

    if (!snapshot) {
        console.error('QuotaService returned no snapshot.');
        process.exitCode = 1;
        return;
    }

    console.log('\nParsed production snapshot:');
    console.log(JSON.stringify(snapshot, null, 2));
}

main().catch(error => {
    console.error(`Production connection verification failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
});
