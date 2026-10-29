import * as assert from 'assert';
import * as net from 'net';
import * as path from 'path';

const { discoverListeningPorts } = require(
    path.resolve(process.cwd(), 'scripts/debug/fetch-real-quota.js')
) as {
    discoverListeningPorts(pid: number): Promise<number[]>;
};

const { parseUnixProcessList } = require(
    path.resolve(process.cwd(), 'scripts/debug/language-server-process-utils.js')
) as {
    parseUnixProcessList(stdout: string): { pid: number; ppid: number; commandLine: string }[];
};

suite('Debug Quota Script Test Suite', () => {
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
});
