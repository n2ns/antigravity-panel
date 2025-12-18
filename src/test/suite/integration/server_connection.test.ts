
import * as assert from 'assert';
import { ProcessFinder } from '../../../shared/platform/process_finder';
import { QuotaService } from '../../../model/services/quota.service';
import { ConfigManager } from '../../../shared/config/config_manager';

// Mock Config Reader for ConfigManager
class MockConfigReader {
    get<T>(key: string, defaultValue: T): T { return defaultValue; }
    set(key: string, value: any) { }
}

// Debug wrapper to intercept and log requests
class DebugQuotaService extends QuotaService {
    protected async request<T>(path: string, body: object): Promise<T> {
        console.log('\n    📝 Request Payload:');
        console.log(`    POST ${path}`);
        console.log('    ' + JSON.stringify(body, null, 2).replace(/\n/g, '\n    '));

        try {
            const result = await super.request<T>(path, body);
            console.log('\n    📦 Raw Response Data:');
            console.log('    ' + JSON.stringify(result, null, 2).replace(/\n/g, '\n    '));
            return result;
        } catch (error) {
            console.error('\n    ❌ Request Failed:', error);
            throw error;
        }
    }
}

suite('Real Server Integration Test', function () {
    // Increase timeout for real network requests
    this.timeout(20000);

    let processFinder: ProcessFinder;
    let quotaService: QuotaService;
    let configManager: ConfigManager;

    setup(() => {
        processFinder = new ProcessFinder();
        // Use real ConfigManager with default values (localhost)
        configManager = new ConfigManager(new MockConfigReader() as any);
        // Use DebugQuotaService instead of standard QuotaService to see logs
        quotaService = new DebugQuotaService(configManager);
    });

    test('should detect running server and fetch quota', async function (this: Mocha.Context) {
        console.log('    🔍 Attempting to detect Antigravity Language Server process...');

        // 1. Detect Server
        const serverInfo = await processFinder.detect({
            attempts: 3,
            verbose: true
        });

        if (!serverInfo) {
            console.warn('    ⚠️ Server process not found. Skipping test.');
            console.warn('       Please ensure Antigravity IDE / Language Server is running.');
            // We skip instead of fail so CI doesn't break if server is down, 
            // but for the user's specific request, they will see this warning.
            return this.skip();
        }

        console.log(`    ✅ Server found at port ${serverInfo.port} (Token: ${serverInfo.csrfToken.substring(0, 8)}...)`);

        // 2. Configure Service
        quotaService.setServerInfo(serverInfo);

        // 3. Fetch Quota
        console.log('    📡 Fetching quota from server...');
        const snapshot = await quotaService.fetchQuota();

        // 4. Assertions
        assert.ok(snapshot, 'Quota snapshot should not be null');
        assert.ok(snapshot.timestamp, 'Snapshot should have a timestamp');

        console.log(`    📊 Received quota snapshot at ${snapshot.timestamp.toISOString()}`);

        if (snapshot.promptCredits) {
            console.log(`       Prompt Credits: ${snapshot.promptCredits.available}/${snapshot.promptCredits.monthly}`);
        }

        if (snapshot.models && snapshot.models.length > 0) {
            console.log(`       Models found: ${snapshot.models.length}`);
            snapshot.models.forEach(m => {
                console.log(`         - ${m.label}: ${m.remainingPercentage.toFixed(1)}%`);
            });
            assert.ok(snapshot.models.length > 0, 'Should return at least one model config');
        } else {
            console.warn('       ⚠️ No models returned in snapshot (this might be normal for some accounts)');
        }
    });
});
