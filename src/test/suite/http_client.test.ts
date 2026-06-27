import * as assert from 'assert';
import * as http from 'http';
import * as https from 'https';
import { httpRequest, testPort, clearProtocolCache } from '../../shared/utils/http_client';
import { ProcessFinder } from '../../shared/platform/process_finder';

const TEST_TLS_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQC5skFfJ1D2m3pD
zjgmdvm/D/rNJbVOOUe+6MVZJ6nfzjHTh9lTVwzDE7U5w0p7w84HY7+5TQxelu8g
V3pDEDqEdPY3YbTpyH4PsorJl72RiQKgIdoR41ewlNPQ9iXu2shmFn2UIfDmP4q+
WHRroTDLpXrfGOT7AyM2viFVFBv4/UxEsWaP6Qowcqi/05w1RsL8U1vcYo//HbBu
JWwQXVNgHPwSlnT25taCm47sA6KIB0hTX/mztUY/BCH7Qs5V95gF/Dy3f/hWTYTI
Tpx9CuN2UP5SxEc/dAvEbVD7Sc9SeF2CBU/HNIzl1D/eBcR/IvjDh3Y60XW9RxK4
nnkO0nZfAgMBAAECgf8qEji9VisBtDf/JLmT/WCX6Qbpc6GgF1op5pLPoCzch9rC
EgUq3I4HpG9qptQ5NiN3iSHm2Y3z4D5NFYSdrQ+U8urVoU1bqhDlfY30HmzUjDYM
EZ9Wbitv1kgnD52IgAjnGDFbXlU11S+Z8HBv8hUcDmHIKdu3Av73aBwlKmkr/9Pg
6cr4AXy/uQKMXlFEfoyJHTISxwtLnCDEkFXoqqBAppvxD03btjbf7rJ+IMbi9v78
7YQU0rXjFiyIr0fZ+zhWIrIRRgd8nAlUBoK4+jVSd0d9jDY1R2cbonTgtZOKODGK
BLbbQhZTijq75D5Fb8Yc9G0h1PQTg9E4pTffgWECgYEA84wN1MYXcrqdb6ZQp3yV
3gVHH5Fum6yc8Br8kLQxLSgnTK4vdXlLUHrcRnPGoSEI/h4pgjgKm7wf39oZV8UA
bxURuaYnHI7aFf+oNVcXWADnIvV8uzpYW/GMcuYjpYl0C+GfMmCZxlIXN015XuCs
YVsY48ogQwKqX6fyx4LgfWkCgYEAwzD0d9OI9TuG1szOlTmFkPiJAhYbKPdXKJa6
Dj1ERXjx4b4jtNFmPNIiRpfn9BivXBI9Eeztyq/s0Qu3hdrX8pKoKeVYbn4Cx1We
SV0tOrA7EIXEcp1s2kEO7XnvMYNMHbnyPNl8IK/d5AuZvS0eHc8lkg5zBv8qaTHw
X89fNIcCgYEAnC74v7a5Ws3qIKublY0D3vmrfscZE6RCkIf96B5mWvshGL+rl75N
WjMwB84/Vx2EUtKs8+FUjEK8fiWzkuG3QYVVdKTk+B90JB9rk6liQwFxOK4Na1Qj
TfM9ioGj4oifbu8l1Hy2oMQMN17rsriKU3TEJXB99/tBn05pFyELLeECgYEAkEL9
XBae0cjmFpmWUVoLKqNV95HJDxUHePs1ldKYQ9RoyVRTZY+iRW91X8Fj8NfRu3XL
ZxU6hqRRngtP34FoO2NDIHveSQOfIB5ad5SDGi4n6UVEdQV+7yxIUSHetDR7LDlD
HNAM2sfAcoxUWyoeaR+xf+pn/5LVkJwVMWq9zb8CgYBJNNsehZyHCBq9FhDL0sIZ
SGOGMkYpabi97mYmBLWP9MXQ1znyTgAHSTzW3tHsot091kPeqob4QxhwWVByrL0V
G4HPZC2/KbDSCwBEoNEgR7Mq/u407yckj1HGTrA3bXz2kHpZDGJ/MUIoUfGnweuk
+QiFS/xy7MxXcKMLUI8kBw==
-----END PRIVATE KEY-----`;

const TEST_TLS_CERT = `-----BEGIN CERTIFICATE-----
MIIDCTCCAfGgAwIBAgIUEV/dyJTilm4DYnkJ8+S+5U+ZmZwwDQYJKoZIhvcNAQEL
BQAwFDESMBAGA1UEAwwJbG9jYWxob3N0MB4XDTI2MDYyNzIxMjYyMloXDTI2MDYy
ODIxMjYyMlowFDESMBAGA1UEAwwJbG9jYWxob3N0MIIBIjANBgkqhkiG9w0BAQEF
AAOCAQ8AMIIBCgKCAQEAubJBXydQ9pt6Q844Jnb5vw/6zSW1TjlHvujFWSep384x
04fZU1cMwxO1OcNKe8POB2O/uU0MXpbvIFd6QxA6hHT2N2G06ch+D7KKyZe9kYkC
oCHaEeNXsJTT0PYl7trIZhZ9lCHw5j+Kvlh0a6Ewy6V63xjk+wMjNr4hVRQb+P1M
RLFmj+kKMHKov9OcNUbC/FNb3GKP/x2wbiVsEF1TYBz8EpZ09ubWgpuO7AOiiAdI
U1/5s7VGPwQh+0LOVfeYBfw8t3/4Vk2EyE6cfQrjdlD+UsRHP3QLxG1Q+0nPUnhd
ggVPxzSM5dQ/3gXEfyL4w4d2OtF1vUcSuJ55DtJ2XwIDAQABo1MwUTAdBgNVHQ4E
FgQUFKG87gmppY7kI7lzFfmu2+99m2YwHwYDVR0jBBgwFoAUFKG87gmppY7kI7lz
Ffmu2+99m2YwDwYDVR0TAQH/BAUwAwEB/zANBgkqhkiG9w0BAQsFAAOCAQEAA7xM
V2nfeyHDmqHwlDwOIumc4sWPn6zH/A9ia3vT4h7ol8ZILsMNRB+TDwjTy8Pbfnnb
Kd3gSMDl+fKP3Pu6hM2b30wFk45+GUQDVD2mlkirVPNm8j5ZNnc8/vUNKQ7nyscI
2w0571AVaXfwIrfNC2eO0sHWLB12bw3BHy1UFeMtmfO8g3MkaTU8yFriw5+YcHPU
RqJrlqrV66XSXFHiiZDo2Y4Ocaj8e+/cBra33kO+0Bvp5QsfZZd7wkcy5BaFXXDw
i/BHqeqXe07FqRJ3wcHnNbxYkmZP0/CD5d+UMmxHxVuZ91xQUWP77MvdYrAaj1iA
o0G7ixH1JgYPh6yePQ==
-----END CERTIFICATE-----`;

function listen(server: http.Server | https.Server, port = 0): Promise<number> {
    return new Promise((resolve) => {
        server.listen(port, '127.0.0.1', () => {
            const address = server.address();
            assert.ok(address && typeof address !== 'string');
            resolve(address.port);
        });
    });
}

function close(server: http.Server | https.Server | undefined): Promise<void> {
    return new Promise((resolve, reject) => {
        if (!server || !server.listening) {
            resolve();
            return;
        }
        server.close((err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

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

    test('should fallback to HTTPS when cached HTTP protocol fails', async () => {
        let server: http.Server | https.Server | undefined;
        const makeHandler = (phase: string) => (_req: http.IncomingMessage, res: http.ServerResponse) => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ phase }));
        };

        try {
            server = http.createServer(makeHandler('http'));
            const port = await listen(server);

            const httpResponse = await httpRequest<{ phase: string }>({
                hostname: '127.0.0.1',
                port,
                path: '/test',
                method: 'GET',
                timeout: 500,
                allowFallback: true
            });

            assert.strictEqual(httpResponse.protocol, 'http');
            assert.strictEqual(httpResponse.data.phase, 'http');

            await close(server);
            server = https.createServer({ key: TEST_TLS_KEY, cert: TEST_TLS_CERT }, makeHandler('https'));
            await listen(server, port);

            const httpsResponse = await httpRequest<{ phase: string }>({
                hostname: '127.0.0.1',
                port,
                path: '/test',
                method: 'GET',
                timeout: 500,
                allowFallback: true
            });

            assert.strictEqual(httpsResponse.protocol, 'https');
            assert.strictEqual(httpsResponse.data.phase, 'https');
        } finally {
            await close(server);
        }
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
