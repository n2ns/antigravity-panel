import * as assert from 'assert';
import { httpRequest, testPort, clearProtocolCache } from '../../shared/utils/http_client';
import { ProcessFinder } from '../../shared/platform/process_finder';

suite('HttpClient Test Suite', function () {
    // Increase timeout for possible real network connections
    this.timeout(10000);

    setup(() => {
        // Clear protocol cache before each test
        clearProtocolCache();
    });

    teardown(() => {
        // Clean up after each test
        clearProtocolCache();
    });

    test('clearProtocolCache should clear the cache', () => {
        // This test verifies that clearProtocolCache doesn't throw
        assert.doesNotThrow(() => {
            clearProtocolCache();
        });
    });

    test('should export clearProtocolCache function', () => {
        assert.strictEqual(typeof clearProtocolCache, 'function');
    });

    test('should fail when connecting to an invalid local port', async () => {
        try {
            await httpRequest({
                hostname: '127.0.0.1',
                port: 9999, // Unused port
                path: '/invalid-path',
                method: 'POST',
                allowFallback: false,
                timeout: 500
            });
            assert.fail('Should have failed to connect to invalid port');
        } catch (err: any) {
            assert.ok(err instanceof Error);
            assert.ok(err.message.includes('failed') || err.message.includes('timeout'));
        }
    });

    test('testPort should return success: false on invalid port', async () => {
        const result = await testPort('127.0.0.1', 9999, '/invalid-path', {});
        assert.strictEqual(result.success, false);
    });

    test('should connect to real local server if running', async function (this: Mocha.Context) {
        const processFinder = new ProcessFinder();
        const serverInfo = await processFinder.detect({ attempts: 2 });
        if (!serverInfo) {
            console.warn('    ⚠️ Real Language Server not found. Skipping live HttpClient tests.');
            return this.skip();
        }

        // Test normal HTTP connection check
        const response = await httpRequest({
            hostname: '127.0.0.1',
            port: serverInfo.port,
            path: '/exa.language_server_pb.LanguageServerService/GetUserStatus',
            method: 'POST',
            headers: {
                'Connect-Protocol-Version': '1',
                'X-Codeium-Csrf-Token': serverInfo.csrfToken
            },
            body: JSON.stringify({
                metadata: {
                    ideName: 'antigravity',
                    extensionName: 'antigravity',
                    locale: 'en',
                }
            }),
            timeout: 5000,
            allowFallback: true
        });

        assert.ok(response);
        // Note: Even if unauthorized (e.g. 401/403), statusCode will be returned instead of rejecting
        assert.ok(response.statusCode === 200 || response.statusCode === 401 || response.statusCode === 403);
        assert.ok(response.protocol === 'http' || response.protocol === 'https');
    });

    test('testPort should verify real local server if running', async function (this: Mocha.Context) {
        const processFinder = new ProcessFinder();
        const serverInfo = await processFinder.detect({ attempts: 2 });
        if (!serverInfo) {
            console.warn('    ⚠️ Real Language Server not found. Skipping live testPort tests.');
            return this.skip();
        }

        const result = await testPort(
            '127.0.0.1',
            serverInfo.port,
            '/exa.language_server_pb.LanguageServerService/GetUserStatus',
            {
                'Connect-Protocol-Version': '1',
                'X-Codeium-Csrf-Token': serverInfo.csrfToken
            },
            JSON.stringify({
                metadata: {
                    ideName: 'antigravity',
                    extensionName: 'antigravity',
                    locale: 'en',
                }
            })
        );

        // If authenticated, success is true. If 401/403, success is false. Both are valid outcomes.
        assert.strictEqual(typeof result.success, 'boolean');
        assert.ok(result.protocol === 'http' || result.protocol === 'https');
    });
});
