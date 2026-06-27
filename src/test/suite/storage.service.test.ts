import * as assert from 'assert';
import { StorageService } from '../../model/services/storage.service';

// Mock VS Code Memento interface
interface Memento {
    get<T>(key: string): T | undefined;
    get<T>(key: string, defaultValue: T): T;
    update(key: string, value: any): Thenable<void>;
}

// Mock Memento Implementation
class MockMemento implements Memento {
    private storage = new Map<string, any>();

    get<T>(key: string, defaultValue?: any) {
        return this.storage.has(key) ? this.storage.get(key) : defaultValue;
    }

    update(key: string, value: any): Thenable<void> {
        this.storage.set(key, value);
        return Promise.resolve();
    }

    keys(): readonly string[] {
        return Array.from(this.storage.keys());
    }
}

suite('StorageService Test Suite', () => {
    let globalState: MockMemento;
    let service: StorageService;

    setup(() => {
        globalState = new MockMemento();
        service = new StorageService(globalState);
    });

    test('should record history points', async () => {
        await service.recordQuotaPoint({ gemini: 80, other: 90 });
        assert.strictEqual(service.count, 1);
    });

    test('should persist data to globalState', async () => {
        await service.recordQuotaPoint({ gemini: 50, other: 50 });
        // Create new instance to simulate restart
        const newService = new StorageService(globalState);
        assert.strictEqual(newService.count, 1);
    });

    test('should calculate usage buckets correctly', async () => {
        const realNow = Date.now;
        const start = 1700000000000;

        // Mock time and record data points
        // T=0: 100%
        global.Date.now = () => start;
        await service.recordQuotaPoint({ gemini: 100 });

        // T=2m: 90%
        global.Date.now = () => start + 2 * 60 * 1000;
        await service.recordQuotaPoint({ gemini: 90 });

        // T=4m: 85%
        global.Date.now = () => start + 4 * 60 * 1000;
        await service.recordQuotaPoint({ gemini: 85 });

        // Current time T=5m
        global.Date.now = () => start + 5 * 60 * 1000;

        // Calculate buckets for last 5 minutes, 2 min per bucket
        const buckets = service.calculateUsageBuckets(5, 2);

        assert.strictEqual(buckets.length, 3, 'Should have 3 buckets');

        // Verify usage detected in buckets
        const hasUsage = buckets.some(b => b.items.length > 0);
        assert.ok(hasUsage, 'Should have usage in buckets');

        global.Date.now = realNow;
    });

    test('should store and retrieve last display percentage', async () => {
        assert.strictEqual(service.getLastDisplayPercentage(), 0); // default

        await service.setLastDisplayPercentage(75);
        assert.strictEqual(service.getLastDisplayPercentage(), 75);
    });

    test('should clear history', async () => {
        await service.recordQuotaPoint({ gemini: 100 });
        assert.strictEqual(service.count, 1);

        await service.clear();
        assert.strictEqual(service.count, 0);
    });

    test('should persist group history clearing before later reads', async () => {
        await service.recordQuotaPoint({ gemini: 100, claude: 90 });
        await service.clearGroupHistory('gemini');

        const newService = new StorageService(globalState);
        const history = newService.getRecentHistory(60);

        assert.strictEqual(history.length, 1);
        assert.strictEqual(history[0].usage.gemini, undefined);
        assert.strictEqual(history[0].usage.claude, 90);
    });

    test('should store and retrieve user info', async () => {
        const userInfo = { tier: 'pro', planName: 'Professional', hasBrowser: true };

        assert.strictEqual(service.getLastUserInfo(), null); // default

        await service.setLastUserInfo(userInfo);
        const retrieved = service.getLastUserInfo<typeof userInfo>();

        assert.deepStrictEqual(retrieved, userInfo);
    });

    test('should store and retrieve token usage', async () => {
        const tokenUsage = {
            promptCredits: { available: 1000, monthly: 2000, remainingPercentage: 50 },
            flowCredits: { available: 500, monthly: 1000, remainingPercentage: 50 }
        };

        assert.strictEqual(service.getLastTokenUsage(), null); // default

        await service.setLastTokenUsage(tokenUsage);
        const retrieved = service.getLastTokenUsage<typeof tokenUsage>();

        assert.deepStrictEqual(retrieved, tokenUsage);
    });
});
