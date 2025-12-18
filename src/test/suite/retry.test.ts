import * as assert from 'assert';
import { retry, createRetry } from '../../shared/utils/retry';

suite('Retry Utils Test Suite', () => {
    test('should succeed on first attempt', async () => {
        let attempts = 0;
        const result = await retry(async () => {
            attempts++;
            return 'success';
        }, {
            attempts: 3,
            baseDelay: 10
        });

        assert.strictEqual(result, 'success');
        assert.strictEqual(attempts, 1);
    });

    test('should retry on null result', async () => {
        let attempts = 0;
        const result = await retry(async () => {
            attempts++;
            return attempts < 3 ? null : 'success';
        }, {
            attempts: 3,
            baseDelay: 10
        });

        assert.strictEqual(result, 'success');
        assert.strictEqual(attempts, 3);
    });

    test('should retry on error', async () => {
        let attempts = 0;
        const result = await retry(async () => {
            attempts++;
            if (attempts < 3) {
                throw new Error('Temporary error');
            }
            return 'success';
        }, {
            attempts: 3,
            baseDelay: 10
        });

        assert.strictEqual(result, 'success');
        assert.strictEqual(attempts, 3);
    });

    test('should throw error after all attempts fail', async () => {
        let attempts = 0;
        try {
            await retry(async () => {
                attempts++;
                throw new Error('Persistent error');
            }, {
                attempts: 3,
                baseDelay: 10
            });
            assert.fail('Should have thrown an error');
        } catch (error) {
            assert.ok(error instanceof Error);
            assert.strictEqual(error.message, 'Persistent error');
            assert.strictEqual(attempts, 3);
        }
    });

    test('should return null after all attempts return null', async () => {
        let attempts = 0;
        const result = await retry(async () => {
            attempts++;
            return null;
        }, {
            attempts: 3,
            baseDelay: 10
        });

        assert.strictEqual(result, null);
        assert.strictEqual(attempts, 3);
    });

    test('should use fixed backoff strategy', async () => {
        const delays: number[] = [];
        await retry(async () => null, {
            attempts: 3,
            baseDelay: 100,
            backoff: 'fixed',
            onRetry: (attempt, delay) => delays.push(delay)
        });

        assert.strictEqual(delays.length, 2); // 2 retries (attempt 1 and 2)
        assert.strictEqual(delays[0], 100);
        assert.strictEqual(delays[1], 100);
    });

    test('should use linear backoff strategy', async () => {
        const delays: number[] = [];
        await retry(async () => null, {
            attempts: 4,
            baseDelay: 100,
            backoff: 'linear',
            onRetry: (attempt, delay) => delays.push(delay)
        });

        assert.strictEqual(delays.length, 3);
        assert.strictEqual(delays[0], 100);  // 1 * 100
        assert.strictEqual(delays[1], 200);  // 2 * 100
        assert.strictEqual(delays[2], 300);  // 3 * 100
    });

    test('should use exponential backoff strategy', async () => {
        const delays: number[] = [];
        await retry(async () => null, {
            attempts: 4,
            baseDelay: 100,
            backoff: 'exponential',
            onRetry: (attempt, delay) => delays.push(delay)
        });

        assert.strictEqual(delays.length, 3);
        assert.strictEqual(delays[0], 100);  // 100 * 2^0
        assert.strictEqual(delays[1], 200);  // 100 * 2^1
        assert.strictEqual(delays[2], 400);  // 100 * 2^2
    });

    test('should respect maxDelay', async () => {
        const delays: number[] = [];
        await retry(async () => null, {
            attempts: 5,
            baseDelay: 100,
            backoff: 'exponential',
            maxDelay: 300,
            onRetry: (attempt, delay) => delays.push(delay)
        });

        assert.strictEqual(delays.length, 4);
        assert.strictEqual(delays[0], 100);  // 100 * 2^0 = 100
        assert.strictEqual(delays[1], 200);  // 100 * 2^1 = 200
        assert.strictEqual(delays[2], 300);  // 100 * 2^2 = 400, capped at 300
        assert.strictEqual(delays[3], 300);  // 100 * 2^3 = 800, capped at 300
    });

    test('should use custom shouldRetry condition', async () => {
        let attempts = 0;
        const result = await retry(async () => {
            attempts++;
            return attempts < 3 ? { value: 0 } : { value: 10 };
        }, {
            attempts: 5,
            baseDelay: 10,
            shouldRetry: (result) => result === null || (result && result.value < 5)
        });

        assert.strictEqual(attempts, 3);
        assert.deepStrictEqual(result, { value: 10 });
    });

    test('should call onRetry callback', async () => {
        const retryLog: Array<{ attempt: number; delay: number }> = [];
        await retry(async () => null, {
            attempts: 3,
            baseDelay: 50,
            onRetry: (attempt, delay) => retryLog.push({ attempt, delay })
        });

        assert.strictEqual(retryLog.length, 2);
        assert.strictEqual(retryLog[0].attempt, 1);
        assert.strictEqual(retryLog[1].attempt, 2);
    });

    test('should work with createRetry factory', async () => {
        let attempts = 0;
        const retryWithBackoff = createRetry({
            attempts: 3,
            baseDelay: 10,
            backoff: 'exponential'
        });

        const result = await retryWithBackoff(async () => {
            attempts++;
            return attempts < 2 ? null : 'success';
        });

        assert.strictEqual(result, 'success');
        assert.strictEqual(attempts, 2);
    });

    test('should stop retrying when shouldRetry returns false on error', async () => {
        let attempts = 0;
        try {
            await retry(async () => {
                attempts++;
                throw new Error('Fatal error');
            }, {
                attempts: 5,
                baseDelay: 10,
                shouldRetry: (result, error) => {
                    // Don't retry on "Fatal error"
                    return error?.message !== 'Fatal error';
                }
            });
            assert.fail('Should have thrown an error');
        } catch (error) {
            assert.ok(error instanceof Error);
            assert.strictEqual(error.message, 'Fatal error');
            assert.strictEqual(attempts, 1); // Should stop immediately
        }
    });
});