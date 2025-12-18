import * as assert from 'assert';
import { ProcessFinder } from '../../shared/platform/process_finder';

/**
 * 跨平台测试用 ProcessFinder 子类
 * 完全 Mock 所有系统调用，不依赖任何平台特定命令
 */
class MockProcessFinder extends ProcessFinder {
    private mockTryDetectResult: { port: number; csrfToken: string } | null = null;
    private mockTryDetectError: Error | null = null;
    public tryDetectCallCount = 0;

    /**
     * 设置 tryDetect 的模拟返回值
     */
    setMockResult(result: { port: number; csrfToken: string } | null) {
        this.mockTryDetectResult = result;
        this.mockTryDetectError = null;
    }

    /**
     * 设置 tryDetect 抛出错误
     */
    setMockError(error: Error) {
        this.mockTryDetectError = error;
        this.mockTryDetectResult = null;
    }

    /**
     * 设置多次调用的序列结果
     */
    private sequenceResults: Array<{ port: number; csrfToken: string } | null | Error> = [];

    setMockSequence(results: Array<{ port: number; csrfToken: string } | null | Error>) {
        this.sequenceResults = [...results];
    }

    protected async tryDetect(): Promise<{ port: number; csrfToken: string } | null> {
        this.tryDetectCallCount++;

        // 如果有序列结果，优先使用
        if (this.sequenceResults.length > 0) {
            const result = this.sequenceResults.shift();
            if (result instanceof Error) {
                throw result;
            }
            return result ?? null;
        }

        // 否则使用单次设置
        if (this.mockTryDetectError) {
            throw this.mockTryDetectError;
        }
        return this.mockTryDetectResult;
    }
}

suite('ProcessFinder Test Suite', () => {
    let finder: MockProcessFinder;

    setup(() => {
        finder = new MockProcessFinder();
    });

    test('should return result when process is found', async () => {
        finder.setMockResult({ port: 44000, csrfToken: 'test-token-123' });

        const result = await finder.detect({ attempts: 1 });

        assert.ok(result, 'Should return a result');
        assert.strictEqual(result?.port, 44000);
        assert.strictEqual(result?.csrfToken, 'test-token-123');
        assert.strictEqual(finder.tryDetectCallCount, 1);
    });

    test('should return null when no process found', async () => {
        finder.setMockResult(null);

        const result = await finder.detect({ attempts: 1 });

        assert.strictEqual(result, null);
        assert.strictEqual(finder.tryDetectCallCount, 1);
    });

    test('should retry on null result', async () => {
        // 第一次返回 null，第二次返回结果
        finder.setMockSequence([
            null,
            { port: 44000, csrfToken: 'retry-success' }
        ]);

        const result = await finder.detect({ attempts: 3, baseDelay: 10 });

        assert.ok(result, 'Should return result after retry');
        assert.strictEqual(result?.port, 44000);
        assert.strictEqual(finder.tryDetectCallCount, 2);
    });

    test('should retry on error', async () => {
        // 第一次抛错，第二次成功
        finder.setMockSequence([
            new Error('Connection refused'),
            { port: 44000, csrfToken: 'error-then-success' }
        ]);

        const result = await finder.detect({ attempts: 3, baseDelay: 10 });

        assert.ok(result, 'Should return result after error retry');
        assert.strictEqual(result?.csrfToken, 'error-then-success');
        assert.strictEqual(finder.tryDetectCallCount, 2);
    });

    test('should respect max attempts', async () => {
        // 始终返回 null
        finder.setMockResult(null);

        const result = await finder.detect({ attempts: 3, baseDelay: 10 });

        assert.strictEqual(result, null);
        assert.strictEqual(finder.tryDetectCallCount, 3, 'Should have tried 3 times');
    });

    test('should return null after all retries fail', async () => {
        // 所有尝试都失败
        finder.setMockSequence([
            new Error('Attempt 1 failed'),
            new Error('Attempt 2 failed'),
            null // 最后一次返回 null
        ]);

        const result = await finder.detect({ attempts: 3, baseDelay: 10 });

        assert.strictEqual(result, null);
        assert.strictEqual(finder.tryDetectCallCount, 3);
    });

    test('should succeed on first attempt', async () => {
        finder.setMockResult({ port: 12345, csrfToken: 'first-try' });

        const result = await finder.detect({ attempts: 5, baseDelay: 10 });

        assert.ok(result);
        assert.strictEqual(result?.port, 12345);
        assert.strictEqual(finder.tryDetectCallCount, 1, 'Should only try once on success');
    });

    test('should handle default options', async () => {
        finder.setMockResult({ port: 8080, csrfToken: 'default-opts' });

        const result = await finder.detect(); // 使用默认参数

        assert.ok(result);
        assert.strictEqual(result?.port, 8080);
    });
});
