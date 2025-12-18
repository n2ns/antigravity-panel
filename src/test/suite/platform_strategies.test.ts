import * as assert from 'assert';
import { WindowsStrategy, UnixStrategy } from '../../shared/platform/platform_strategies';

suite('Platform Strategies Test Suite', () => {
    suite('WindowsStrategy', () => {
        const strategy = new WindowsStrategy();

        test('should parse single process JSON output', () => {
            const jsonOutput = JSON.stringify({
                ProcessId: 12345,
                CommandLine: 'C:\\Program Files\\Antigravity\\language_server_windows_x64.exe --extension_server_port=42100 --csrf_token=abc123xyz --app_data_dir antigravity'
            });

            const result = strategy.parseProcessInfo(jsonOutput);

            assert.ok(result, 'Should parse process info');
            assert.strictEqual(result![0].pid, 12345);
            assert.strictEqual(result![0].extensionPort, 42100);
            assert.strictEqual(result![0].csrfToken, 'abc123xyz');
        });

        test('should parse array of processes and filter Antigravity', () => {
            const jsonOutput = JSON.stringify([
                {
                    ProcessId: 11111,
                    CommandLine: 'C:\\Program Files\\VSCode\\code.exe --some-args'
                },
                {
                    ProcessId: 12345,
                    CommandLine: 'C:\\Users\\User\\AppData\\Local\\Antigravity\\language_server_windows_x64.exe --extension_server_port=42100 --csrf_token=abc123xyz'
                },
                {
                    ProcessId: 22222,
                    CommandLine: 'C:\\Program Files\\Chrome\\chrome.exe'
                }
            ]);

            const result = strategy.parseProcessInfo(jsonOutput);

            assert.ok(result, 'Should find Antigravity process');
            assert.strictEqual(result![0].pid, 12345);
            assert.strictEqual(result![0].csrfToken, 'abc123xyz');
        });

        test('should handle process with --app_data_dir antigravity flag', () => {
            const jsonOutput = JSON.stringify({
                ProcessId: 12345,
                CommandLine: 'language_server.exe --app_data_dir antigravity --extension_server_port 42100 --csrf_token abc123'
            });

            const result = strategy.parseProcessInfo(jsonOutput);

            assert.ok(result, 'Should recognize --app_data_dir antigravity');
            assert.strictEqual(result![0].pid, 12345);
        });

        test('should return null for non-Antigravity process', () => {
            const jsonOutput = JSON.stringify({
                ProcessId: 12345,
                CommandLine: 'C:\\Program Files\\VSCode\\code.exe --some-args'
            });

            const result = strategy.parseProcessInfo(jsonOutput);
            assert.strictEqual(result, null);
        });

        test('should return null when CSRF token is missing', () => {
            const jsonOutput = JSON.stringify({
                ProcessId: 12345,
                CommandLine: 'C:\\Antigravity\\language_server.exe --extension_server_port=42100'
            });

            const result = strategy.parseProcessInfo(jsonOutput);
            assert.strictEqual(result, null, 'Should require CSRF token');
        });

        test('should handle port specified with equals sign', () => {
            const jsonOutput = JSON.stringify({
                ProcessId: 12345,
                CommandLine: 'language_server.exe --app_data_dir antigravity --extension_server_port=42100 --csrf_token=abc123'
            });

            const result = strategy.parseProcessInfo(jsonOutput);
            assert.strictEqual(result![0].extensionPort, 42100);
        });

        test('should handle port specified with space', () => {
            const jsonOutput = JSON.stringify({
                ProcessId: 12345,
                CommandLine: 'language_server.exe --app_data_dir antigravity --extension_server_port 42100 --csrf_token abc123'
            });

            const result = strategy.parseProcessInfo(jsonOutput);
            assert.strictEqual(result![0].extensionPort, 42100);
        });

        test('should parse listening ports from netstat output', () => {
            const netstatOutput = `
  TCP    127.0.0.1:42100        0.0.0.0:0              LISTENING       12345
  TCP    127.0.0.1:42101        0.0.0.0:0              LISTENING       12345
  TCP    0.0.0.0:8080           0.0.0.0:0              LISTENING       12345
  TCP    [::1]:42100            [::]:0                 LISTENING       12345
`;
            const ports = strategy.parseListeningPorts(netstatOutput);

            assert.strictEqual(ports.length, 3);
            assert.ok(ports.includes(42100));
            assert.ok(ports.includes(42101));
            assert.ok(ports.includes(8080));
        });

        test('should return sorted ports', () => {
            const netstatOutput = `
  TCP    127.0.0.1:8080         0.0.0.0:0              LISTENING       12345
  TCP    127.0.0.1:42100        0.0.0.0:0              LISTENING       12345
  TCP    127.0.0.1:3000         0.0.0.0:0              LISTENING       12345
`;
            const ports = strategy.parseListeningPorts(netstatOutput);

            assert.deepStrictEqual(ports, [3000, 8080, 42100]);
        });

        test('should handle empty netstat output', () => {
            const ports = strategy.parseListeningPorts('');
            assert.deepStrictEqual(ports, []);
        });

        test('should return 0 for missing extension port', () => {
            const jsonOutput = JSON.stringify({
                ProcessId: 12345,
                CommandLine: 'language_server.exe --app_data_dir antigravity --csrf_token abc123'
            });

            const result = strategy.parseProcessInfo(jsonOutput);
            assert.strictEqual(result![0].extensionPort, 0);
        });
    });

    suite('UnixStrategy - macOS', () => {
        const strategy = new UnixStrategy('darwin');

        test('should parse ps output', () => {
            // Mock output of: ps -A -ww -o pid,ppid,command | grep ...
            // PID PPID COMMAND
            const psOutput = `12345 11111 /Applications/Antigravity.app/Contents/MacOS/language_server_macos --extension_server_port=42100 --csrf_token=abc123xyz`;

            const result = strategy.parseProcessInfo(psOutput);

            assert.ok(result, 'Should parse process info');
            assert.strictEqual(result![0].pid, 12345);
            assert.strictEqual(result![0].ppid, 11111);
            assert.strictEqual(result![0].extensionPort, 42100);
            assert.strictEqual(result![0].csrfToken, 'abc123xyz');
        });

        test('should handle multiple processes and find the right one', () => {
            const psOutput = `11111 11000 /usr/bin/node server.js
12345 30372 /Applications/Antigravity.app/language_server_macos --extension_server_port 42100 --csrf_token abc123
22222 22000 /usr/bin/python script.py`;

            const result = strategy.parseProcessInfo(psOutput);

            assert.ok(result, 'Should find process with extension_server_port');
            assert.strictEqual(result![0].pid, 12345);
        });

        test('should return null when no process has extension_server_port', () => {
            const psOutput = `11111 11000 /usr/bin/node server.js
22222 22000 /usr/bin/python script.py`;

            const result = strategy.parseProcessInfo(psOutput);
            assert.strictEqual(result, null);
        });

        test('should parse lsof output for macOS', () => {
            const lsofOutput = `COMMAND   PID USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
language 12345 user   10u  IPv4 0x1234567890      0t0  TCP *:42100 (LISTEN)
language 12345 user   11u  IPv4 0x1234567891      0t0  TCP 127.0.0.1:42101 (LISTEN)
language 12345 user   12u  IPv6 0x1234567892      0t0  TCP [::1]:42102 (LISTEN)`;

            const ports = strategy.parseListeningPorts(lsofOutput);

            assert.strictEqual(ports.length, 3);
            assert.ok(ports.includes(42100));
            assert.ok(ports.includes(42101));
            assert.ok(ports.includes(42102));
        });

        test('should return sorted ports for macOS', () => {
            const lsofOutput = `language 12345 user   10u  IPv4 0x123  0t0  TCP *:8080 (LISTEN)
language 12345 user   11u  IPv4 0x124  0t0  TCP *:42100 (LISTEN)
language 12345 user   12u  IPv4 0x125  0t0  TCP *:3000 (LISTEN)`;

            const ports = strategy.parseListeningPorts(lsofOutput);
            assert.deepStrictEqual(ports, [3000, 8080, 42100]);
        });
    });

    suite('UnixStrategy - Linux', () => {
        const strategy = new UnixStrategy('linux');

        test('should parse ps output', () => {
            const psOutput = `12345 30372 /opt/antigravity/language_server_linux_x64 --extension_server_port=42100 --csrf_token=abc123xyz`;

            const result = strategy.parseProcessInfo(psOutput);

            assert.ok(result, 'Should parse process info');
            assert.strictEqual(result![0].pid, 12345);
            assert.strictEqual(result![0].extensionPort, 42100);
            assert.strictEqual(result![0].csrfToken, 'abc123xyz');
        });

        test('should parse ss output for Linux', () => {
            const ssOutput = `State      Recv-Q Send-Q Local Address:Port               Peer Address:Port
LISTEN     0      128    127.0.0.1:42100                  *:*                   users:(("language_server",pid=12345,fd=10))
LISTEN     0      128    *:42101                  *:*                   users:(("language_server",pid=12345,fd=11))
LISTEN     0      128    [::1]:42102               [::]:*                   users:(("language_server",pid=12345,fd=12))`;

            const ports = strategy.parseListeningPorts(ssOutput);

            assert.strictEqual(ports.length, 3);
            assert.ok(ports.includes(42100));
            assert.ok(ports.includes(42101));
            assert.ok(ports.includes(42102));
        });

        test('should fallback to lsof when ss output is empty', () => {
            const lsofOutput = `COMMAND   PID USER   FD   TYPE DEVICE SIZE/OFF NODE NAME
language 12345 user   10u  IPv4  12345      0t0  TCP *:42100 (LISTEN)
language 12345 user   11u  IPv4  12346      0t0  TCP 127.0.0.1:42101 (LISTEN)`;

            const ports = strategy.parseListeningPorts(lsofOutput);

            assert.strictEqual(ports.length, 2);
            assert.ok(ports.includes(42100));
            assert.ok(ports.includes(42101));
        });

        test('should return empty array for empty output', () => {
            const ports = strategy.parseListeningPorts('');
            assert.deepStrictEqual(ports, []);
        });
    });
});
