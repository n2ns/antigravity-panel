import * as assert from 'assert';
import * as net from 'net';
import * as path from 'path';

const { discoverListeningPorts } = require(
    path.resolve(process.cwd(), 'scripts/debug/fetch-real-quota.js')
) as {
    discoverListeningPorts(pid: number): Promise<number[]>;
};

suite('Debug Quota Script Test Suite', () => {
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
