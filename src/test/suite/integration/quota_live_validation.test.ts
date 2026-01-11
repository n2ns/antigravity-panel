import * as assert from 'assert';
import { ProcessFinder } from '../../../shared/platform/process_finder';
import { QuotaService } from '../../../model/services/quota.service';
import { ConfigManager } from '../../../shared/config/config_manager';

// Mock Config Reader for ConfigManager
class MockConfigReader {
    get<T>(key: string, defaultValue: T): T { return defaultValue; }
    set(key: string, value: any) { }
}

suite('Live Quota Validation Suite', function () {
    // 20s timeout for real network ops
    this.timeout(20000);

    let processFinder: ProcessFinder;
    let quotaService: QuotaService;
    let configManager: ConfigManager;

    setup(() => {
        processFinder = new ProcessFinder();
        // Use real ConfigManager with default values
        configManager = new ConfigManager(new MockConfigReader() as any);
        quotaService = new QuotaService(configManager);
    });

    test('should validate live quota response structure', async function (this: Mocha.Context) {
        // 1. Detect Server
        const serverInfo = await processFinder.detect({
            attempts: 3,
            verbose: true
        });

        if (!serverInfo) {
            console.warn('Skipping live validation: Server not found.');
            return this.skip();
        }

        console.log(`    ✅ Connected to Live Server on port ${serverInfo.port}`);

        // 2. Configure & Fetch
        quotaService.setServerInfo(serverInfo);
        const snapshot = await quotaService.fetchQuota();

        // 3. Strict Assertions on Structure (The "Solidification" part)
        assert.ok(snapshot, 'Snapshot must not be null');
        assert.ok(snapshot.timestamp instanceof Date, 'Timestamp must be a Date object');

        // Validate Token Usage Structure
        if (snapshot.tokenUsage) {
            // Check that totals properly sum up
            const calculatedTotal = (snapshot.tokenUsage.promptCredits?.available || 0) +
                (snapshot.tokenUsage.flowCredits?.available || 0);

            // Allow for small floating point differences
            assert.ok(Math.abs(snapshot.tokenUsage.totalAvailable - calculatedTotal) < 0.01,
                'Total available credits should match sum of prompt and flow credits');

            assert.strictEqual(typeof snapshot.tokenUsage.overallRemainingPercentage, 'number',
                'Overall remaining percentage should be a number');
        }

        // Validate User Info
        if (snapshot.userInfo) {
            if (snapshot.userInfo.tier) {
                assert.strictEqual(typeof snapshot.userInfo.tier, 'string', 'Tier name should be a string');
            }
            // Ensure critical fields are present if plan info exists
            if (snapshot.userInfo.planName) {
                assert.strictEqual(typeof snapshot.userInfo.planName, 'string', 'Plan name should be a string');
            }
        }

        // Validate Models
        assert.ok(Array.isArray(snapshot.models), 'Models should be an array');
        if (snapshot.models.length > 0) {
            const model = snapshot.models[0];
            assert.strictEqual(typeof model.label, 'string', 'Model label should be a string');
            assert.strictEqual(typeof model.remainingPercentage, 'number', 'Remaining percentage should be a number');
            assert.ok(model.resetTime instanceof Date, 'Reset time should be a Date object');
            assert.strictEqual(typeof model.timeUntilReset, 'string', 'Time until reset should be a string');

            console.log(`    📊 Validated Model: ${model.label}`);
        } else {
            console.warn('    ⚠️ Live validation warning: No models returned in snapshot.');
        }

        console.log('    ✅ Live Quota Detection Logic Verified');
    });
});
