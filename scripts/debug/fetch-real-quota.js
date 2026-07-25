const http = require('http');
const https = require('https');
const os = require('os');
const fs = require('fs');
const {
    extractArgument,
    listLanguageServerProcesses,
    runCommand,
} = require('./language-server-process-utils');

const API_PATH = '/exa.language_server_pb.LanguageServerService/GetUserStatus';
const REQUEST_TIMEOUT_MS = 3000;

const requestBody = JSON.stringify({
    metadata: {
        ideName: 'antigravity',
        extensionName: 'antigravity',
        locale: 'en',
    },
});

function printHelp() {
    console.log(`Usage: node scripts/debug/fetch-real-quota.js

Discover a running Antigravity Language Server and fetch GetUserStatus.
The complete real response is printed.`);
}

function belongsToProcess(line, pid) {
    if (os.platform() === 'win32') {
        return new RegExp(`\\s${pid}\\s*$`).test(line);
    }
    if (os.platform() === 'darwin') {
        const columns = line.trim().split(/\s+/);
        return Number(columns[1]) === pid;
    }
    return new RegExp(`(?:pid=${pid}[,)]|\\s${pid}/)`).test(line);
}

function extractListeningPorts(stdout, pid) {
    const ports = [];
    for (const line of stdout.split(/\r?\n/)) {
        if (!/LISTEN/i.test(line) || !belongsToProcess(line, pid)) continue;
        for (const match of line.matchAll(/(?:127\.0\.0\.1|\[?::1\]?):(\d{2,5})/g)) {
            const port = Number(match[1]);
            if (port > 0 && port < 65536) ports.push(port);
        }
    }
    return ports;
}

async function discoverProcListeningPorts(pid) {
    let fdNames;
    try {
        fdNames = await fs.promises.readdir(`/proc/${pid}/fd`);
    } catch {
        return [];
    }

    const socketInodes = new Set();
    await Promise.all(fdNames.map(async fdName => {
        try {
            const target = await fs.promises.readlink(`/proc/${pid}/fd/${fdName}`);
            const match = target.match(/^socket:\[(\d+)\]$/);
            if (match) socketInodes.add(match[1]);
        } catch {
            // File descriptors can disappear while the process is running.
        }
    }));
    if (socketInodes.size === 0) return [];

    const ports = [];
    for (const tablePath of ['/proc/net/tcp', '/proc/net/tcp6']) {
        let table;
        try {
            table = await fs.promises.readFile(tablePath, 'utf8');
        } catch {
            continue;
        }

        for (const row of table.split(/\r?\n/).slice(1)) {
            const columns = row.trim().split(/\s+/);
            if (columns.length < 10 || columns[3] !== '0A' || !socketInodes.has(columns[9])) continue;

            const [address, portHex] = columns[1].split(':');
            const isIpv4Loopback = address === '0100007F';
            const isIpv6Loopback = address === '00000000000000000000000001000000';
            if (!portHex || (!isIpv4Loopback && !isIpv6Loopback)) continue;

            const port = Number.parseInt(portHex, 16);
            if (port > 0 && port < 65536) ports.push(port);
        }
    }
    return ports;
}

async function discoverListeningPorts(pid) {
    let ports = [];
    if (os.platform() === 'win32') {
        const result = await runCommand('netstat -ano');
        ports = extractListeningPorts(result.stdout, pid);
    } else if (os.platform() === 'darwin') {
        const result = await runCommand('lsof -nP -iTCP -sTCP:LISTEN');
        ports = extractListeningPorts(result.stdout, pid);
    } else {
        const ssResult = await runCommand('ss -tlnp');
        ports = extractListeningPorts(ssResult.stdout, pid);
        if (ports.length === 0) {
            const netstatResult = await runCommand('netstat -tlnp');
            ports = extractListeningPorts(netstatResult.stdout, pid);
        }
        if (ports.length === 0) {
            ports = await discoverProcListeningPorts(pid);
        }
    }

    return [...new Set(ports)].sort((a, b) => a - b);
}

function tryPort(port, csrfToken, protocol) {
    return new Promise(resolve => {
        const client = protocol === 'https' ? https : http;
        const request = client.request({
            hostname: '127.0.0.1',
            port,
            path: API_PATH,
            method: 'POST',
            ...(protocol === 'https' ? { rejectUnauthorized: false } : {}),
            headers: {
                'X-Codeium-Csrf-Token': csrfToken,
                'Connect-Protocol-Version': '1',
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(requestBody),
            },
            timeout: REQUEST_TIMEOUT_MS,
        }, response => {
            let body = '';
            response.setEncoding('utf8');
            response.on('data', chunk => {
                body += chunk;
            });
            response.on('end', () => {
                resolve({ port, statusCode: response.statusCode || 0, body });
            });
        });

        request.on('error', () => resolve(null));
        request.on('timeout', () => {
            request.destroy();
            resolve(null);
        });
        request.end(requestBody);
    });
}

function parseResponse(body) {
    const trimmed = body.trim();
    if (!trimmed) return [];

    try {
        return [JSON.parse(trimmed)];
    } catch {
        // Streaming responses may contain newline-delimited JSON or framing lines.
    }

    const values = [];
    for (const line of trimmed.split(/\r?\n/).filter(Boolean)) {
        try {
            values.push(JSON.parse(line));
        } catch {
            // Streaming responses can include non-JSON framing lines.
        }
    }
    return values;
}

async function main() {
    if (process.argv.includes('--help') || process.argv.includes('-h')) {
        printHelp();
        return;
    }

    console.log('Fetch real Antigravity quota');
    console.log(`Platform: ${os.platform()} (${os.arch()})`);

    const processes = await listLanguageServerProcesses();
    const processInfo = processes.find(item => extractArgument(item.commandLine, 'csrf_token'));
    if (!processInfo) {
        throw new Error('No language_server process with --csrf_token was found.');
    }

    const csrfToken = extractArgument(processInfo.commandLine, 'csrf_token');
    const extensionPort = Number(extractArgument(processInfo.commandLine, 'extension_server_port')) || null;
    console.log(`Process: PID ${processInfo.pid}, token ${csrfToken}`);

    const listeningPorts = await discoverListeningPorts(processInfo.pid);
    const candidates = listeningPorts.filter(port => port !== extensionPort);
    console.log(`Candidate localhost ports: ${candidates.join(', ') || 'none'}`);
    if (candidates.length === 0) {
        throw new Error('No candidate localhost listening ports were found.');
    }

    for (const port of candidates) {
        for (const protocol of ['https', 'http']) {
            process.stdout.write(`Trying ${protocol}://127.0.0.1:${port}... `);
            const result = await tryPort(port, csrfToken, protocol);
            if (!result) {
                console.log('no response');
                continue;
            }
            if (result.statusCode === 401 || result.statusCode === 403) {
                console.log(`HTTP ${result.statusCode}, token rejected`);
                continue;
            }
            if (result.statusCode < 200 || result.statusCode >= 300) {
                console.log(`HTTP ${result.statusCode}`);
                continue;
            }

            console.log(`connected (${protocol.toUpperCase()}, HTTP ${result.statusCode})`);
            const parsed = parseResponse(result.body);
            if (parsed.length === 0) {
                throw new Error(`Port ${port} returned no parseable JSON response.`);
            }
            console.log('\nLanguage Server response:');
            console.log(JSON.stringify(parsed.length === 1 ? parsed[0] : parsed, null, 2));
            return;
        }
    }

    throw new Error('No candidate port accepted the Language Server request.');
}

if (require.main === module) {
    main().catch(error => {
        console.error(`Quota fetch failed: ${error instanceof Error ? error.message : String(error)}`);
        process.exitCode = 1;
    });
}

module.exports = {
    discoverListeningPorts,
};
