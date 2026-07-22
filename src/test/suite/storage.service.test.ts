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

/** Mirrors RAW_RETENTION_MS in storage.service.ts */
const RAW_CUTOFF_TEST_MS = 24 * 60 * 60 * 1000;

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

    test('should persist reset markers and report the latest reset time', async () => {
        const realNow = Date.now;
        const start = 1700000000000;

        global.Date.now = () => start;
        await service.recordQuotaPoint({ gemini: 10, claude: 90 });

        global.Date.now = () => start + 60 * 1000;
        await service.recordQuotaPoint({ gemini: 100, claude: 90 }, ['gemini']);

        assert.strictEqual(service.getLatestResetTime('gemini'), start + 60 * 1000);
        assert.strictEqual(service.getLatestResetTime('claude'), null);

        // Markers survive a restart and history stays intact
        const newService = new StorageService(globalState);
        assert.strictEqual(newService.getLatestResetTime('gemini'), start + 60 * 1000);
        assert.strictEqual(newService.getRecentHistory(60).length, 2);

        global.Date.now = realNow;
    });

    test('should not count consumption deltas across a reset marker', async () => {
        const realNow = Date.now;
        const start = 1700000000000;
        const MIN = 60 * 1000;

        // Consume 100 -> 40, reset to 100, consume 100 -> 95
        global.Date.now = () => start;
        await service.recordQuotaPoint({ gemini: 100 });
        global.Date.now = () => start + 1 * MIN;
        await service.recordQuotaPoint({ gemini: 40 });
        global.Date.now = () => start + 3 * MIN;
        await service.recordQuotaPoint({ gemini: 100 }, ['gemini']);
        global.Date.now = () => start + 5 * MIN;
        await service.recordQuotaPoint({ gemini: 95 });

        global.Date.now = () => start + 6 * MIN;
        const buckets = service.calculateUsageBuckets(6, 2);
        const total = buckets.reduce(
            (sum, b) => sum + b.items.filter(i => i.groupId === 'gemini').reduce((s, i) => s + i.usage, 0),
            0
        );

        // 60pp consumed before the reset, 5pp after. The 40 -> 100 rebound and any
        // delta spanning the marker must contribute nothing.
        assert.ok(total <= 65, `Cross-reset deltas must not inflate usage (got ${total})`);
        assert.ok(total >= 5, `Post-reset consumption should still be counted (got ${total})`);

        global.Date.now = realNow;
    });

    test('should not count quota changes across a long sampling gap', async () => {
        const realNow = Date.now;
        const start = 1_700_000_000_000;

        try {
            global.Date.now = () => start;
            await service.recordQuotaPoint({ gemini: 100 });
            global.Date.now = () => start + 55 * 60 * 1000;
            await service.recordQuotaPoint({ gemini: 80 });
            global.Date.now = () => start + 60 * 60 * 1000;

            const total = service.calculateUsageBuckets(60, 5)
                .flatMap(bucket => bucket.items)
                .reduce((sum, item) => sum + item.usage, 0);
            assert.strictEqual(total, 0);
        } finally {
            global.Date.now = realNow;
        }
    });

    test('should downsample points older than 24h and keep reset markers', async () => {
        const realNow = Date.now;
        const start = 1700000000000;
        const MIN = 60 * 1000;
        const HOUR = 60 * MIN;

        // Six raw points 30s apart, 25h in the past, aligned to a 5-minute slot
        // boundary so they all land in one slot
        const oldBase = Math.floor((start - 25 * HOUR) / (5 * MIN)) * (5 * MIN);
        for (let i = 0; i < 6; i++) {
            global.Date.now = () => oldBase + i * 30 * 1000;
            await service.recordQuotaPoint({ gemini: 100 - i }, i === 2 ? ['gemini'] : undefined);
        }

        // A fresh point triggers save() at current time; recent points keep raw granularity
        global.Date.now = () => start;
        await service.recordQuotaPoint({ gemini: 50 });

        const history = service.getRecentHistory(26 * 60);
        const oldPoints = history.filter(p => p.timestamp < start - RAW_CUTOFF_TEST_MS);
        assert.strictEqual(oldPoints.length, 1, 'Old slot should collapse to a single point');
        assert.deepStrictEqual(oldPoints[0].resets, ['gemini'], 'Reset marker must survive downsampling');
        assert.strictEqual(oldPoints[0].usage.gemini, 95, 'Kept point should carry the latest slot values');
        assert.strictEqual(service.getLatestResetTime('gemini'), oldPoints[0].timestamp);

        global.Date.now = realNow;
    });

    test('should aggregate daily consumption without crossing resets or sampling gaps', async () => {
        const realNow = Date.now;
        const now = new Date(2026, 6, 22, 12).getTime();
        const at = (day: number, hour: number, minute: number) =>
            new Date(2026, 6, day, hour, minute).getTime();

        try {
            global.Date.now = () => at(21, 10, 0);
            await service.recordQuotaPoint({ gemini: 100 });
            global.Date.now = () => at(21, 10, 5);
            await service.recordQuotaPoint({ gemini: 94 });
            global.Date.now = () => at(21, 10, 10);
            await service.recordQuotaPoint({ gemini: 100 }, ['gemini']);
            global.Date.now = () => at(21, 10, 15);
            await service.recordQuotaPoint({ gemini: 98 });

            // The overnight 98 -> 90 drop is not sampled continuously and must not count.
            global.Date.now = () => at(22, 10, 0);
            await service.recordQuotaPoint({ gemini: 90 });
            global.Date.now = () => at(22, 10, 5);
            await service.recordQuotaPoint({ gemini: 89 });

            global.Date.now = () => now;
            const days = service.getDailyConsumption('gemini', 3);

            assert.strictEqual(days.length, 3);
            assert.deepStrictEqual(days.map(day => day.hasData), [false, true, true]);
            assert.deepStrictEqual(days.map(day => day.usage), [0, 8, 1]);
        } finally {
            global.Date.now = realNow;
        }
    });

    test('should retain the complete oldest comparison day across a DST fallback', async () => {
        const realNow = Date.now;
        const previousTimezone = process.env.TZ;

        try {
            process.env.TZ = 'America/New_York';
            const oldestDayStart = new Date(2026, 10, 1, 0, 0).getTime();
            global.Date.now = () => oldestDayStart;
            await service.recordQuotaPoint({ gemini: 100 });

            global.Date.now = () => new Date(2026, 10, 14, 23, 30).getTime();
            await service.recordQuotaPoint({ gemini: 90 });

            assert.strictEqual(service.count, 2, 'Oldest local-calendar day must survive DST fallback');
        } finally {
            global.Date.now = realNow;
            if (previousTimezone === undefined) delete process.env.TZ;
            else process.env.TZ = previousTimezone;
        }
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
