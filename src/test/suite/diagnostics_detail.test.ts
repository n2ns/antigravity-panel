import * as assert from 'assert';
import { ProcessFinder, formatExecOutcome } from '../../shared/platform/process_finder';
import type { PlatformStrategy } from '../../shared/utils/types';

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

    suite('Failure report details', () => {
        type ExecFn = (command: string) => Promise<{ stdout: string; stderr: string }>;
        const execError = (props: Record<string, unknown>) => Object.assign(new Error(String(props.message ?? '')), props);
        const runDiagnostics = () => (finder as any).runDiagnostics() as Promise<void>;
        const setExecute = (fn: ExecFn) => { (finder as any).execute = fn; };

        test('formatExecOutcome reports exit 0, stdout size and stderr on success', () => {
            assert.strictEqual(
                formatExecOutcome('Scan', { stdout: ' [] ', stderr: '' }),
                'Scan: exit=0, stdout=2 chars'
            );
            assert.strictEqual(
                formatExecOutcome('Scan', { stdout: '', stderr: 'warning\n' }),
                'Scan: exit=0, stdout=0 chars, stderr: warning'
            );
        });

        test('formatExecOutcome reports exit code and stderr on failure', () => {
            const err = execError({ message: 'Command failed: powershell -Command x\nAccess denied', code: 1, stderr: 'Access denied\r\n' });
            assert.strictEqual(formatExecOutcome('Scan', null, err), 'Scan: exit=1, error: Access denied');
        });

        test('formatExecOutcome drops the echoed command when there is no stderr', () => {
            const err = execError({ message: 'Command failed: powershell -Command x\n', code: 1, stderr: '' });
            assert.strictEqual(formatExecOutcome('Scan', null, err), 'Scan: exit=1');
            assert.strictEqual(formatExecOutcome('Scan', null, new Error('spawn ENOENT')), 'Scan: exit=unknown, error: spawn ENOENT');
        });

        test('formatExecOutcome reports a killed (timed out) command', () => {
            const err = execError({ message: 'Command failed: x\n', killed: true, signal: 'SIGTERM', code: null });
            assert.strictEqual(formatExecOutcome('Scan', null, err), 'Scan: exit=killed (SIGTERM)');
        });

        test('records every scan step outcome, including swallowed fallback errors', async () => {
            (strategy as any).getProcessListByKeywordCommand = () => 'mock_keyword_scan';
            (strategy as any).getFallbackProcessListCommand = () => 'mock_fallback_scan';
            setExecute(async (command) => {
                if (command === 'mock_ps') return { stdout: '', stderr: '' };
                if (command === 'mock_keyword_scan') return { stdout: '', stderr: 'CIM failure' };
                if (command === 'mock_fallback_scan') {
                    throw execError({ message: "Command failed: wmic\n'wmic' is not recognized", code: 1, stderr: "'wmic' is not recognized" });
                }
                return { stdout: '', stderr: '' };
            });

            await finder.runTryDetect();
            await runDiagnostics();

            assert.strictEqual(finder.failureReason, 'no_process');
            const summary = finder.diagnosticSummary;
            assert.ok(summary.includes('Scan steps:'));
            assert.ok(summary.includes('Process name scan: exit=0, stdout=0 chars'));
            assert.ok(summary.includes('Keyword scan: exit=0, stdout=0 chars, stderr: CIM failure'));
            assert.ok(summary.includes("Fallback scan: exit=1, error: 'wmic' is not recognized"));
        });

        test('cross-checks with tasklist and probes CIM when the diagnostic listing is empty', async () => {
            (strategy as any).getProcessCrossCheckCommand = () => 'mock_tasklist';
            (strategy as any).getProcessQueryProbeCommand = () => 'mock_cim_probe';
            setExecute(async (command) => {
                if (command === 'mock_tasklist') {
                    return {
                        stdout: '"System","4","Services","0","100 K"\r\n"Antigravity.exe","1200","Console","1","300,000 K"\r\n"language_server_windows_x64.exe","1300","Console","1","200,000 K"\r\n',
                        stderr: ''
                    };
                }
                if (command === 'mock_cim_probe') return { stdout: 'CIM error: Access denied\r\n', stderr: '' };
                return { stdout: '', stderr: '' };
            });

            await runDiagnostics();

            const summary = finder.diagnosticSummary;
            assert.ok(summary.includes('Diagnostic command: exit=0, stdout=0 chars'));
            assert.ok(summary.includes('Related process output: none'));
            assert.ok(summary.includes('Cross-check (tasklist): 2 related of 3 processes'));
            assert.ok(summary.includes('"language_server_windows_x64.exe","1300"'));
            assert.ok(!summary.includes('"System"'));
            assert.ok(summary.includes('Process query probe: CIM error: Access denied'));
        });

        test('skips the tasklist cross-check when the diagnostic listing has output', async () => {
            const calls: string[] = [];
            (strategy as any).getProcessCrossCheckCommand = () => 'mock_tasklist';
            setExecute(async (command) => {
                calls.push(command);
                if (command === 'mock_diag') return { stdout: 'Antigravity --csrf_token abc-123', stderr: '' };
                return { stdout: '', stderr: '' };
            });

            await runDiagnostics();

            assert.ok(!calls.includes('mock_tasklist'));
            assert.ok(finder.diagnosticSummary.includes('Related process output:'));
            assert.ok(finder.diagnosticSummary.includes('--csrf_token ***REDACTED***'));
            assert.ok(!finder.diagnosticSummary.includes('abc-123'));
        });

        test('reports diagnostic command failure with its exit code and still cross-checks', async () => {
            (strategy as any).getProcessCrossCheckCommand = () => 'mock_tasklist';
            setExecute(async (command) => {
                if (command === 'mock_diag') {
                    throw execError({ message: 'Command failed: x\nCannot run script', code: 1, stderr: 'Cannot run script' });
                }
                if (command === 'mock_tasklist') throw execError({ message: 'Command failed: tasklist\n', code: 1, stderr: 'ERROR: Access denied' });
                return { stdout: '', stderr: '' };
            });

            await runDiagnostics();

            const summary = finder.diagnosticSummary;
            assert.ok(summary.includes('Diagnostic command: exit=1, error: Cannot run script'));
            assert.ok(summary.includes('Cross-check (tasklist): exit=1, error: ERROR: Access denied'));
        });
    });
});
