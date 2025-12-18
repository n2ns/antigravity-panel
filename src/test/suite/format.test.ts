import * as assert from 'assert';
import { formatBytes, formatPercent } from '../../shared/utils/format';

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

    suite('formatPercent', () => {
        test('should format percentage correctly', () => {
            assert.strictEqual(formatPercent(50, 100), '50%');
            assert.strictEqual(formatPercent(25, 100), '25%');
            assert.strictEqual(formatPercent(75, 100), '75%');
        });

        test('should handle decimal percentages', () => {
            assert.strictEqual(formatPercent(1, 3), '33%'); // 33.333... -> 33%
            assert.strictEqual(formatPercent(2, 3), '67%'); // 66.666... -> 67%
            assert.strictEqual(formatPercent(1, 6), '17%'); // 16.666... -> 17%
        });

        test('should handle 0% and 100%', () => {
            assert.strictEqual(formatPercent(0, 100), '0%');
            assert.strictEqual(formatPercent(100, 100), '100%');
        });

        test('should handle values greater than total', () => {
            assert.strictEqual(formatPercent(150, 100), '150%');
            assert.strictEqual(formatPercent(200, 100), '200%');
        });

        test('should return "-" for zero or negative total', () => {
            assert.strictEqual(formatPercent(50, 0), '-');
            assert.strictEqual(formatPercent(50, -10), '-');
        });

        test('should handle negative used values', () => {
            assert.strictEqual(formatPercent(-10, 100), '-10%');
        });

        test('should round to nearest integer', () => {
            assert.strictEqual(formatPercent(1, 7), '14%'); // 14.285... -> 14%
            assert.strictEqual(formatPercent(5, 7), '71%'); // 71.428... -> 71%
            assert.strictEqual(formatPercent(1, 9), '11%'); // 11.111... -> 11%
        });

        test('should handle very small percentages', () => {
            assert.strictEqual(formatPercent(1, 1000), '0%'); // 0.1% -> 0%
            assert.strictEqual(formatPercent(5, 1000), '1%'); // 0.5% -> 1%
            assert.strictEqual(formatPercent(6, 1000), '1%'); // 0.6% -> 1%
        });

        test('should handle edge cases', () => {
            assert.strictEqual(formatPercent(0, 1), '0%');
            assert.strictEqual(formatPercent(1, 1), '100%');
            assert.strictEqual(formatPercent(0.5, 1), '50%');
        });
    });
});

