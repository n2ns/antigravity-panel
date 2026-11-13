import * as assert from 'assert';
import * as fs from 'fs';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';

const { discoverListeningPorts } = require(
    path.resolve(process.cwd(), 'scripts/debug/fetch-real-quota.js')
) as {
    discoverListeningPorts(pid: number): Promise<number[]>;
};

const { parseUnixProcessList, readHubDiscovery } = require(
    path.resolve(process.cwd(), 'scripts/debug/language-server-process-utils.js')
) as {
    parseUnixProcessList(stdout: string): { pid: number; ppid: number; commandLine: string }[];
    readHubDiscovery(
        commandLine: string,
        pid: number,
        geminiRoots?: string[],
    ): { pid: number | null; httpsPort: number | null; httpPort: number | null; lsVersion: string | null; csrfToken: string } | null;
};

const { findRelevantProcesses } = require(
    path.resolve(process.cwd(), 'scripts/debug/inspect-windows-process-tree.js')
) as {
    findRelevantProcesses(processes: { ProcessId: number; Name: string; CommandLine: string }[]): {
        servers: { ProcessId: number }[];
        extensionHosts: { ProcessId: number }[];
        ideProcesses: { ProcessId: number }[];
    };
};

suite('Debug Quota Script Test Suite', () => {
    test('should recognize the Antigravity IDE 2.6.0 extension host among Node utility processes', () => {
        const ide = 'Antigravity IDE.exe';
        const relevant = findRelevantProcesses([
            { ProcessId: 28636, Name: ide, CommandLine: '"C:\\Antigravity IDE\\Antigravity IDE.exe"' },
            { ProcessId: 40492, Name: ide, CommandLine: '"Antigravity IDE.exe" --type=utility --utility-sub-type=node.mojom.NodeService --inspect-port=0' },
            { ProcessId: 24628, Name: ide, CommandLine: '"Antigravity IDE.exe" --type=utility --utility-sub-type=node.mojom.NodeService' },
            { ProcessId: 41364, Name: ide, CommandLine: '"Antigravity IDE.exe" --type=utility --utility-sub-type=network.mojom.NetworkService' },
            { ProcessId: 34856, Name: 'agy.exe', CommandLine: 'agy.exe --hub --hub-port=57489' },
        ]);

        assert.deepStrictEqual(relevant.extensionHosts.map(p => p.ProcessId), [40492]);
        assert.deepStrictEqual(relevant.servers.map(p => p.ProcessId), [34856]);
        assert.deepStrictEqual(relevant.ideProcesses.map(p => p.ProcessId), [28636]);
    });

    test('should list the agy hub and the legacy language server, not other processes', () => {
        const processes = parseUnixProcessList([
            '13532 25312 /home/dev/.gemini/bin/agy --hub --hub-port=64233 --app_data_dir=antigravity --csrf_token=hub-token',
            '12345 30372 /opt/antigravity/language_server_linux_x64 --app_data_dir antigravity --csrf_token=abc',
            '22222 22000 /usr/bin/node /home/dev/antigravity-panel/out/test.js',
        ].join('\n'));

        assert.deepStrictEqual(processes.map(p => p.pid), [13532, 12345]);
    });

    test('should fall back to proc when Linux socket tools are unavailable', async function () {
        if (process.platform !== 'linux') this.skip();

        const server = net.createServer();
        await new Promise<void>((resolve, reject) => {
            server.once('error', reject);
            server.listen(0, '127.0.0.1', resolve);
        });

        const address = server.address();
        assert.ok(address && typeof address !== 'string');
        const originalPath = process.env.PATH;
        process.env.PATH = '/path/without/socket-tools';

        try {
            const ports = await discoverListeningPorts(process.pid);
            assert.ok(ports.includes(address.port));
        } finally {
            process.env.PATH = originalPath;
            await new Promise<void>((resolve, reject) => {
                server.close(error => error ? reject(error) : resolve());
            });
        }
    });

    test('should resolve csrfToken and httpsPort from hub discovery file when --csrf_token is omitted', () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-hub-test-'));
        try {
            const daemonDir = path.join(tmpRoot, 'antigravity', 'daemon');
            fs.mkdirSync(daemonDir, { recursive: true });
            fs.writeFileSync(
                path.join(daemonDir, 'hub_38107.json'),
                JSON.stringify({
                    pid: 116951,
                    httpsPort: 37051,
                    httpPort: 38107,
                    lsVersion: '2.31.2',
                    csrfToken: 'script-hub-token',
                }),
                'utf8',
            );

            const cmd = '/home/dev/.gemini/bin/agy --hub --hub-port=38107 --app_data_dir=antigravity --add-dir=/home/dev/project';
            const found = readHubDiscovery(cmd, 116951, [tmpRoot]);
            assert.ok(found);
            assert.strictEqual(found!.csrfToken, 'script-hub-token');
            assert.strictEqual(found!.httpsPort, 37051);
            assert.strictEqual(found!.lsVersion, '2.31.2');

            const mismatch = readHubDiscovery(cmd, 999999, [tmpRoot]);
            assert.strictEqual(mismatch, null);
        } finally {
            fs.rmSync(tmpRoot, { recursive: true, force: true });
        }
    });
});
