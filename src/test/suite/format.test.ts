import * as assert from 'assert';
import { formatBytes, formatTimeUntilReset } from '../../shared/utils/format';

suite('Format Utils Test Suite', () => {
    suite('formatBytes', () => {
        test('should format bytes less than 1KB', () => {
            assert.strictEqual(formatBytes(0), '0 B');
            assert.strictEqual(formatBytes(100), '100 B');
            assert.strictEqual(formatBytes(1023), '1023 B');
        });

        test('should format KB', () => {
            assert.strictEqual(formatBytes(1024), '1.0 KB');
            assert.strictEqual(formatBytes(1536), '1.5 KB');
            assert.strictEqual(formatBytes(2048), '2.0 KB');
            assert.strictEqual(formatBytes(10240), '10.0 KB');
        });

        test('should format MB', () => {
            assert.strictEqual(formatBytes(1024 * 1024), '1.0 MB');
            assert.strictEqual(formatBytes(1024 * 1024 * 1.5), '1.5 MB');
            assert.strictEqual(formatBytes(1024 * 1024 * 10), '10.0 MB');
            assert.strictEqual(formatBytes(1024 * 1024 * 100), '100.0 MB');
        });

        test('should format GB', () => {
            assert.strictEqual(formatBytes(1024 * 1024 * 1024), '1.0 GB');
            assert.strictEqual(formatBytes(1024 * 1024 * 1024 * 2.5), '2.5 GB');
            assert.strictEqual(formatBytes(1024 * 1024 * 1024 * 10), '10.0 GB');
        });

        test('should format TB', () => {
            assert.strictEqual(formatBytes(1024 * 1024 * 1024 * 1024), '1.0 TB');
            assert.strictEqual(formatBytes(1024 * 1024 * 1024 * 1024 * 5), '5.0 TB');
        });

        test('should not exceed TB unit', () => {
            // Even for very large values, should stay in TB
            const hugValue = 1024 * 1024 * 1024 * 1024 * 1024;
            const result = formatBytes(hugValue);
            assert.ok(result.endsWith('TB'), 'Should use TB for very large values');
        });

        test('should round to 1 decimal place', () => {
            assert.strictEqual(formatBytes(1536), '1.5 KB');
            assert.strictEqual(formatBytes(1587), '1.5 KB'); // 1.549... -> 1.5
            assert.strictEqual(formatBytes(1638), '1.6 KB'); // 1.599... -> 1.6
        });

        test('should handle edge cases', () => {
            assert.strictEqual(formatBytes(1), '1 B');
            assert.strictEqual(formatBytes(1023), '1023 B');
            assert.strictEqual(formatBytes(1024), '1.0 KB');
            assert.strictEqual(formatBytes(1048575), '1024.0 KB'); // 1MB - 1B
            assert.strictEqual(formatBytes(1048576), '1.0 MB'); // Exactly 1MB
        });
    });

    suite('formatTimeUntilReset', () => {
        const MINUTE = 60_000;
        const HOUR = 60 * MINUTE;
        const DAY = 24 * HOUR;

        test('should return Ready for elapsed reset times', () => {
            assert.strictEqual(formatTimeUntilReset(0), 'Ready');
            assert.strictEqual(formatTimeUntilReset(-5 * MINUTE), 'Ready');
        });

        test('should format minutes with ceiling', () => {
            assert.strictEqual(formatTimeUntilReset(1), '1m');
            assert.strictEqual(formatTimeUntilReset(5 * MINUTE), '5m');
            assert.strictEqual(formatTimeUntilReset(59 * MINUTE), '59m');
        });

        test('should format hours and minutes', () => {
            assert.strictEqual(formatTimeUntilReset(HOUR), '1h 0m');
            assert.strictEqual(formatTimeUntilReset(1.5 * HOUR), '1h 30m');
            assert.strictEqual(formatTimeUntilReset(23 * HOUR), '23h 0m');
        });

        test('should format days and weeks', () => {
            assert.strictEqual(formatTimeUntilReset(26 * HOUR), '1d 2h');
            assert.strictEqual(formatTimeUntilReset(7 * DAY), '1w');
            assert.strictEqual(formatTimeUntilReset(8 * DAY), '1w 1d');
            assert.strictEqual(formatTimeUntilReset(8 * DAY + 3 * HOUR), '1w 1d 3h');
        });
    });

});
