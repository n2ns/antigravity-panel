import * as assert from 'assert';
import { ProcessFinder } from '../../shared/platform/process_finder';
import { PlatformStrategy } from '../../shared/platform/platform_strategies';

/**
 * Mock strategy that returns JSON-parsed input to allow easy control in tests
 */
class MockStrategy implements PlatformStrategy {
    getProcessListCommand(_name: string) { return 'mock_ps'; }
    getPortListCommand(_pid: number) { return 'mock_netstat'; }

    parseProcessInfo(stdout: string) {
        if (!stdout) return null;
        try {
            return JSON.parse(stdout);
        } catch {
            return null;
        }
    }

    parseListeningPorts(stdout: string, _pid: number) {
        if (!stdout) return [];
        try {
            return JSON.parse(stdout);
        } catch {
            return [];
        }
    }

    getDiagnosticCommand(): string {
        return 'mock_diag';
    }

    getTroubleshootingTips(): string[] {
        return ['Mock tip 1', 'Mock tip 2'];
    }
}

/**
 * controllable ProcessFinder subclass
 */
class DiagnosticTestFinder extends ProcessFinder {
    public mockStdout: string = '';
    public mockPortStdout: string = '';
    public mockTestResults: Record<number, { success: boolean; statusCode: number; protocol: 'https' | 'http'; error?: string }> = {};

    constructor(strategy: PlatformStrategy) {
        super();
        (this as any).strategy = strategy;
    }

    protected async execute(command: string): Promise<{ stdout: string; stderr: string }> {
        if (command === 'mock_ps') {
            return { stdout: this.mockStdout, stderr: '' };
        }
        if (command === 'mock_netstat') {
            return { stdout: this.mockPortStdout, stderr: '' };
        }
        return { stdout: '', stderr: '' };
    }

    protected async testPort(hostname: string, port: number, _csrf: string): Promise<{ success: boolean; statusCode: number; protocol: 'https' | 'http'; error?: string }> {
        return this.mockTestResults[port] || { success: false, statusCode: 500, protocol: 'http', error: 'Conn error' };
    }

    // Expose protected tryDetect for testing
    public async runTryDetect() {
        return await this.tryDetect();
    }
}

suite('Diagnostics Detail Test Suite', () => {
    let finder: DiagnosticTestFinder;
    let strategy: MockStrategy;

    setup(() => {
        strategy = new MockStrategy();
        finder = new DiagnosticTestFinder(strategy);
    });

    test('should set no_process when strategy returns null', async () => {
        finder.mockStdout = ''; // MockStrategy returns null for empty string
        await finder.runTryDetect();
        assert.strictEqual(finder.failureReason, 'no_process');
        assert.strictEqual(finder.candidateCount, 0);
    });

    test('should set no_port when multiple processes found but none match (ambiguous scenario resolved to no_port)', async () => {
        const procs = [
            { pid: 101, ppid: 999123, extensionPort: 0, csrfToken: 't1' },
            { pid: 102, ppid: 888123, extensionPort: 0, csrfToken: 't2' }
        ];
        finder.mockStdout = JSON.stringify(procs);

        await finder.runTryDetect();
        assert.strictEqual(finder.failureReason, 'no_port');
        assert.strictEqual(finder.candidateCount, 2);
    });

    test('should set no_port when process found but no port responds', async () => {
        const proc = { pid: 101, ppid: process.ppid, extensionPort: 0, csrfToken: 't1' };
        finder.mockStdout = JSON.stringify([proc]);
        finder.mockPortStdout = JSON.stringify([58001, 58002]);

        finder.mockTestResults = {
            58001: { success: false, statusCode: 404, protocol: 'http' },
            58002: { success: false, statusCode: 503, protocol: 'http' }
        };

        await finder.runTryDetect();
        assert.strictEqual(finder.failureReason, 'no_port');
        // Now we might attempt connection 2 or 4 times depending on WSL detection mock + cmdline port
        // Just verify we have at least 2 attempts (one for each port)
        assert.ok(finder.attemptDetails.length >= 2);
        assert.strictEqual(finder.attemptDetails[0].statusCode, 404);
    });

    test('should set auth_failed when a port returns 401/403', async () => {
        const proc = { pid: 101, ppid: process.ppid, extensionPort: 0, csrfToken: 't1' };
        finder.mockStdout = JSON.stringify([proc]);
        finder.mockPortStdout = JSON.stringify([58001]);

        finder.mockTestResults = {
            58001: { success: false, statusCode: 403, protocol: 'http', error: 'CSRF invalid' }
        };

        await finder.runTryDetect();
        assert.strictEqual(finder.failureReason, 'auth_failed');
    });

    test('should populate attemptDetails on success', async () => {
        const proc = { pid: 101, ppid: process.ppid, extensionPort: 0, csrfToken: 't1' };
        finder.mockStdout = JSON.stringify([proc]);
        finder.mockPortStdout = JSON.stringify([58001, 58002]);

        finder.mockTestResults = {
            58001: { success: false, statusCode: 404, protocol: 'http' },
            58002: { success: true, statusCode: 200, protocol: 'http' }
        };

        const result = await finder.runTryDetect();
        assert.ok(result);
        assert.strictEqual(result!.port, 58002);
        // We expect at least 2 attempts (58001 failed, 58002 succeeded)
        assert.ok(finder.attemptDetails.length >= 2);
        // Find the successful attempt
        const successAttempt = finder.attemptDetails.find(a => a.statusCode === 200);
        assert.ok(successAttempt);
        assert.strictEqual(successAttempt!.port, 58002);
    });

    test('should fallback to keyword search when process name detection fails', async () => {
        // 1. Initial process name scan returns empty
        finder.mockStdout = '';

        // 2. Mock execute to handle the keyword scan command
        const originalExecute = (finder as any).execute;
        (finder as any).execute = async (command: string) => {
            if (command === 'mock_ps') {
                return { stdout: '', stderr: '' }; // Primary scan fails
            }
            if (command === 'mock_keyword_scan') {
                const proc = { pid: 999, ppid: process.ppid, extensionPort: 0, csrfToken: 'keyword-token' };
                return { stdout: JSON.stringify([proc]), stderr: '' }; // Keyword scan succeeds
            }
            return originalExecute.call(finder, command);
        };

        // Mock getProcessListByKeywordCommand on strategy
        (strategy as any).getProcessListByKeywordCommand = (_k: string) => 'mock_keyword_scan';

        // 3. Setup port listening
        finder.mockPortStdout = JSON.stringify([59000]);
        finder.mockTestResults = {
            59000: { success: true, statusCode: 200, protocol: 'http' }
        };

        const result = await finder.runTryDetect();

        assert.ok(result, 'Should find process via keyword fallback');
        assert.strictEqual(result!.port, 59000);
        assert.strictEqual(result!.csrfToken, 'keyword-token');
    });
});
