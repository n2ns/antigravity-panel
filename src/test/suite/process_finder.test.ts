import * as assert from 'assert';
import { ProcessFinder } from '../../shared/platform/process_finder';

/**
 * Cross-platform test ProcessFinder subclass
 * Fully mocks all system calls, no platform-specific commands
 */
class MockProcessFinder extends ProcessFinder {
    private mockTryDetectResult: { port: number; csrfToken: string } | null = null;
    private mockTryDetectError: Error | null = null;
    public tryDetectCallCount = 0;

    /**
     * Set mock return value for tryDetect
     */
    setMockResult(result: { port: number; csrfToken: string } | null) {
        this.mockTryDetectResult = result;
        this.mockTryDetectError = null;
    }

    /**
     * Set tryDetect to throw an error
     */
    setMockError(error: Error) {
        this.mockTryDetectError = error;
        this.mockTryDetectResult = null;
    }

    /**
     * Set sequence results for multiple calls
     */
    private sequenceResults: Array<{ port: number; csrfToken: string } | null | Error> = [];

    setMockSequence(results: Array<{ port: number; csrfToken: string } | null | Error>) {
        this.sequenceResults = [...results];
    }

    protected async tryDetect(): Promise<{ port: number; csrfToken: string } | null> {
        this.tryDetectCallCount++;

        // If sequence results exist, use them first
        if (this.sequenceResults.length > 0) {
            const result = this.sequenceResults.shift();
            if (result instanceof Error) {
                throw result;
            }
            return result ?? null;
        }

        // Otherwise use single setting
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
        // First returns null, second returns result
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
        // First throws error, second succeeds
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
        // Always returns null
        finder.setMockResult(null);

        const result = await finder.detect({ attempts: 3, baseDelay: 10 });

        assert.strictEqual(result, null);
        assert.strictEqual(finder.tryDetectCallCount, 3, 'Should have tried 3 times');
    });

    test('should return null after all retries fail', async () => {
        // All attempts fail
        finder.setMockSequence([
            new Error('Attempt 1 failed'),
            new Error('Attempt 2 failed'),
            null // Last attempt returns null
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

        const result = await finder.detect(); // Use default options

        assert.ok(result);
        assert.strictEqual(result?.port, 8080);
    });
});

/**
 * Test subclass to expose private normalization methods for testing
 * Now imports from the workspace_id module
 */
import { normalizeWindowsPath, normalizeUnixPath } from '../../shared/utils/workspace_id';

suite('Workspace ID Normalization Test Suite', () => {

    suite('Windows Path Normalization', () => {
        test('should encode drive letter and colon correctly', () => {
            // V:\DevSpace\daisy-box → file_v_3A_DevSpace_daisy_box
            const result = normalizeWindowsPath('V:\\DevSpace\\daisy-box');
            assert.strictEqual(result, 'file_v_3A_DevSpace_daisy_box');
        });

        test('should handle simple drive path', () => {
            // D:\Tools → file_d_3A_Tools
            const result = normalizeWindowsPath('D:\\Tools');
            assert.strictEqual(result, 'file_d_3A_Tools');
        });

        test('should preserve directory case', () => {
            // C:\Users\MyProject → file_c_3A_Users_MyProject
            const result = normalizeWindowsPath('C:\\Users\\MyProject');
            assert.strictEqual(result, 'file_c_3A_Users_MyProject');
        });

        test('should handle spaces in path', () => {
            // E:\My Projects\Test App → file_e_3A_My_Projects_Test_App
            const result = normalizeWindowsPath('E:\\My Projects\\Test App');
            assert.strictEqual(result, 'file_e_3A_My_Projects_Test_App');
        });

        test('should handle lowercase drive letter', () => {
            const result = normalizeWindowsPath('c:\\temp');
            assert.strictEqual(result, 'file_c_3A_temp');
        });
    });

    suite('Unix Path Normalization', () => {
        test('should normalize simple path', () => {
            // /home/deploy/projects → file_home_deploy_projects
            const result = normalizeUnixPath('/home/deploy/projects');
            assert.strictEqual(result, 'file_home_deploy_projects');
        });

        test('should convert to lowercase', () => {
            // /Home/User/MyProject → file_home_user_myproject
            const result = normalizeUnixPath('/Home/User/MyProject');
            assert.strictEqual(result, 'file_home_user_myproject');
        });

        test('should handle hyphens', () => {
            // /home/user/my-project → file_home_user_my_project
            const result = normalizeUnixPath('/home/user/my-project');
            assert.strictEqual(result, 'file_home_user_my_project');
        });

        test('should handle trailing slashes', () => {
            const result = normalizeUnixPath('/home/user/project/');
            assert.strictEqual(result, 'file_home_user_project');
        });
    });
});
