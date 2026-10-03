import * as assert from 'assert';
import { WindowsStrategy, UnixStrategy } from '../../shared/platform/platform_strategies';

suite('Platform Strategies Test Suite', () => {
    suite('WindowsStrategy', () => {
        const strategy = new WindowsStrategy();

        test('should cross-check processes with tasklist, which does not use PowerShell', () => {
            const cmd = strategy.getProcessCrossCheckCommand();
            assert.ok(cmd.startsWith('tasklist'));
            assert.ok(!cmd.includes('powershell'));
        });

        test('should probe CIM with errors surfaced instead of silenced', () => {
            const cmd = strategy.getProcessQueryProbeCommand();
            assert.ok(cmd.includes('Get-CimInstance Win32_Process -ErrorAction Stop'));
            assert.ok(cmd.includes("'CIM error: ' + $_.Exception.Message"));
            assert.ok(!cmd.includes('\n'), 'Script must be collapsed onto one line');
        });

        test('should parse single process JSON output with workspace ID', () => {
            const jsonOutput = JSON.stringify({
                ProcessId: 12345,
                CommandLine: 'C:\\Program Files\\Antigravity\\language_server_windows_x64.exe --extension_server_port=42100 --csrf_token=abc123xyz --workspace_id=file_home_deploy_projects_antigravity --app_data_dir antigravity'
            });

            const result = strategy.parseProcessInfo(jsonOutput);

            assert.ok(result, 'Should parse process info');
            assert.strictEqual(result![0].pid, 12345);
            assert.strictEqual(result![0].extensionPort, 42100);
            assert.strictEqual(result![0].csrfToken, 'abc123xyz');
            assert.strictEqual(result![0].workspaceId, 'file_home_deploy_projects_antigravity');
        });

        test('should handle quoted paths and tokens', () => {
            const jsonOutput = JSON.stringify({
                ProcessId: 12345,
                CommandLine: 'language_server.exe --app_data_dir antigravity --csrf_token "quoted-token" --workspace_id \'quoted-workspace\''
            });

            const result = strategy.parseProcessInfo(jsonOutput);
            assert.ok(result);
            assert.strictEqual(result![0].csrfToken, 'quoted-token');
            assert.strictEqual(result![0].workspaceId, 'quoted-workspace');
        });

        test('should generate correct keyword search command', () => {
            const command = strategy.getProcessListByKeywordCommand!('csrf_token');
            assert.ok(command.includes('Get-CimInstance Win32_Process'));
            assert.ok(command.includes("Where-Object { $_.CommandLine -match $k }"));
            assert.ok(command.includes('Select-Object ProcessId,ParentProcessId,CommandLine'));
            assert.ok(command.includes('ConvertTo-Json -Compress'));
        });

        test('should parse array of processes and filter Antigravity', () => {
            const jsonOutput = JSON.stringify([
                {
                    ProcessId: 11111,
                    CommandLine: 'C:\\Program Files\\VSCode\\code.exe --some-args'
                },
                {
                    ProcessId: 12345,
                    CommandLine: 'C:\\Users\\User\\AppData\\Local\\Antigravity\\language_server_windows_x64.exe --app_data_dir antigravity --extension_server_port=42100 --csrf_token=abc123xyz'
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

        test('should return null when no CSRF token in any process', () => {
            const jsonOutput = JSON.stringify({
                ProcessId: 12345,
                CommandLine: 'C:\\Program Files\\SomeApp\\app.exe --some-args'
            });

            const result = strategy.parseProcessInfo(jsonOutput);
            assert.strictEqual(result, null, 'Should return null when no csrf_token');
        });

        test('should return null when CSRF token is missing', () => {
            const jsonOutput = JSON.stringify({
                ProcessId: 12345,
                CommandLine: 'C:\\Antigravity\\language_server.exe --app_data_dir antigravity --extension_server_port=42100'
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

        test('should parse listening ports from Get-NetTCPConnection output', () => {
            const output = `42100
42101
8080`;
            const ports = strategy.parseListeningPorts(output, 12345);

            assert.strictEqual(ports.length, 3);
            assert.ok(ports.includes(42100));
            assert.ok(ports.includes(42101));
            assert.ok(ports.includes(8080));
        });

        test('should return sorted ports', () => {
            const output = `8080
42100
3000`;
            const ports = strategy.parseListeningPorts(output, 12345);

            assert.deepStrictEqual(ports, [3000, 8080, 42100]);
        });

        test('should handle empty netstat output', () => {
            const ports = strategy.parseListeningPorts('', 12345);
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

        test('should parse ps output with workspace ID', () => {
            // Mock output of: ps -A -ww -o pid,ppid,args | grep ...
            // PID PPID COMMAND
            const psOutput = `12345 11111 /Applications/Antigravity.app/Contents/MacOS/language_server_macos --app_data_dir antigravity --extension_server_port=42100 --csrf_token=abc123xyz --workspace_id=my-workspace`;

            const result = strategy.parseProcessInfo(psOutput);

            assert.ok(result, 'Should parse process info');
            assert.strictEqual(result![0].pid, 12345);
            assert.strictEqual(result![0].ppid, 11111);
            assert.strictEqual(result![0].extensionPort, 42100);
            assert.strictEqual(result![0].csrfToken, 'abc123xyz');
            assert.strictEqual(result![0].workspaceId, 'my-workspace');
        });

        test('should handle quoted args in Unix', () => {
            const psOutput = `12345 11111 LS --app_data_dir "antigravity" --csrf_token "unix-token" --workspace_id 'unix-ws' --extension_server_port 42100`;
            const result = strategy.parseProcessInfo(psOutput);
            assert.ok(result);
            assert.strictEqual(result![0].csrfToken, 'unix-token');
            assert.strictEqual(result![0].workspaceId, 'unix-ws');
        });

        test('should generate correct keyword search command', () => {
            const command = strategy.getProcessListByKeywordCommand!('csrf_token');
            assert.ok(command.startsWith('ps -A -ww -o pid,ppid,args'));
            assert.ok(command.includes('grep "csrf_token"'));
            assert.ok(command.includes('grep -v grep'));
        });

        test('should handle multiple processes and find the right one', () => {
            const psOutput = `11111 11000 /usr/bin/node server.js
12345 30372 /Applications/Antigravity.app/language_server_macos --app_data_dir antigravity --extension_server_port 42100 --csrf_token abc123
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

            const ports = strategy.parseListeningPorts(lsofOutput, 12345);

            assert.strictEqual(ports.length, 3);
            assert.ok(ports.includes(42100));
            assert.ok(ports.includes(42101));
            assert.ok(ports.includes(42102));
        });

        test('should return sorted ports for macOS', () => {
            const lsofOutput = `language 12345 user   10u  IPv4 0x123  0t0  TCP *:8080 (LISTEN)
language 12345 user   11u  IPv4 0x124  0t0  TCP *:42100 (LISTEN)
language 12345 user   12u  IPv4 0x125  0t0  TCP *:3000 (LISTEN)`;

            const ports = strategy.parseListeningPorts(lsofOutput, 12345);
            assert.deepStrictEqual(ports, [3000, 8080, 42100]);
        });

        test('should filter ports by PID on macOS (Issue #21)', () => {
            // Simulates the bug scenario: lsof returns ports from multiple processes
            const lsofOutput = `COMMAND   PID USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
QQ         9691 user   10u  IPv4 0x1234567890      0t0  TCP 127.0.0.1:4001 (LISTEN)
language  71666 user   10u  IPv4 0x1234567890      0t0  TCP *:42100 (LISTEN)
language  71666 user   11u  IPv4 0x1234567891      0t0  TCP 127.0.0.1:42101 (LISTEN)`;

            const ports = strategy.parseListeningPorts(lsofOutput, 71666);

            assert.strictEqual(ports.length, 2);
            assert.ok(ports.includes(42100));
            assert.ok(ports.includes(42101));
            assert.ok(!ports.includes(4001), 'Should NOT include port from different PID (9691)');
        });

        test('should return empty array when PID not found in lsof output', () => {
            const lsofOutput = `QQ 9691 user 10u IPv4 0x123 0t0 TCP 127.0.0.1:4001 (LISTEN)`;

            const ports = strategy.parseListeningPorts(lsofOutput, 99999);
            assert.deepStrictEqual(ports, []);
        });
    });

    suite('UnixStrategy - Linux', () => {
        const strategy = new UnixStrategy('linux');

        test('should parse ps output', () => {
            const psOutput = `12345 30372 /opt/antigravity/language_server_linux_x64 --app_data_dir antigravity --extension_server_port=42100 --csrf_token=abc123xyz`;

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

            const ports = strategy.parseListeningPorts(ssOutput, 12345);

            assert.strictEqual(ports.length, 3);
            assert.ok(ports.includes(42100));
            assert.ok(ports.includes(42101));
            assert.ok(ports.includes(42102));
        });

        test('should fallback to lsof when ss output is empty', () => {
            const lsofOutput = `COMMAND   PID USER   FD   TYPE DEVICE SIZE/OFF NODE NAME
language 12345 user   10u  IPv4  12345      0t0  TCP *:42100 (LISTEN)
language 12345 user   11u  IPv4  12346      0t0  TCP 127.0.0.1:42101 (LISTEN)`;

            const ports = strategy.parseListeningPorts(lsofOutput, 12345);

            assert.strictEqual(ports.length, 2);
            assert.ok(ports.includes(42100));
            assert.ok(ports.includes(42101));
        });

        test('should return empty array for empty output', () => {
            const ports = strategy.parseListeningPorts('', 12345);
            assert.deepStrictEqual(ports, []);
        });
    });
});
