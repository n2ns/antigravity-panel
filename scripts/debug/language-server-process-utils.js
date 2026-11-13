const { exec } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ANTIGRAVITY_APP_DATA_DIRS = ['antigravity', 'antigravity-ide'];

const COMMAND_TIMEOUT_MS = 5000;
const MAX_BUFFER_BYTES = 10 * 1024 * 1024;

function runCommand(command, timeout = COMMAND_TIMEOUT_MS) {
    return new Promise((resolve) => {
        exec(command, { timeout, maxBuffer: MAX_BUFFER_BYTES }, (error, stdout, stderr) => {
            resolve({
                error,
                stdout: stdout || '',
                stderr: stderr || '',
            });
        });
    });
}

function readHubDaemonInfo(hubPort, appDataDir, homeDir = os.homedir()) {
    const port = Number(hubPort);
    if (!Number.isInteger(port) || port <= 0 || port > 65535) {
        return null;
    }

    const dirsToTry = appDataDir ? [appDataDir] : ANTIGRAVITY_APP_DATA_DIRS;
    for (const dir of dirsToTry) {
        const filePath = path.join(homeDir, '.gemini', dir, 'daemon', `hub_${port}.json`);
        try {
            const raw = fs.readFileSync(filePath, 'utf8');
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') {
                continue;
            }
            const csrfToken = typeof parsed.csrfToken === 'string' ? parsed.csrfToken.trim() : '';
            if (!csrfToken) {
                continue;
            }
            return {
                csrfToken,
                httpPort: typeof parsed.httpPort === 'number' ? parsed.httpPort : undefined,
                httpsPort: typeof parsed.httpsPort === 'number' ? parsed.httpsPort : undefined,
                pid: typeof parsed.pid === 'number' ? parsed.pid : undefined,
            };
        } catch {
            // Try next directory
        }
    }
    return null;
}

function enrichProcessInfo(pid, ppid, commandLine, homeDir) {
    let csrfToken = extractArgument(commandLine, 'csrf_token');
    let httpPort;
    let httpsPort;

    if (!csrfToken) {
        const hubPort = extractArgument(commandLine, 'hub-port') || extractArgument(commandLine, 'extension_server_port');
        if (hubPort) {
            const appDataDir = extractArgument(commandLine, 'app_data_dir');
            const daemonInfo = readHubDaemonInfo(Number(hubPort), appDataDir || undefined, homeDir);
            if (daemonInfo) {
                csrfToken = daemonInfo.csrfToken;
                httpPort = daemonInfo.httpPort;
                httpsPort = daemonInfo.httpsPort;
            }
        }
    }

    return {
        pid,
        ppid,
        commandLine,
        csrfToken: csrfToken || null,
        ...(httpPort !== undefined ? { httpPort } : {}),
        ...(httpsPort !== undefined ? { httpsPort } : {}),
    };
}

function parseWindowsProcessJson(stdout, homeDir) {
    if (!stdout.trim()) return [];

    const parsed = JSON.parse(stdout);
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    return rows
        .filter(row => row && row.ProcessId)
        .map(row => enrichProcessInfo(
            Number(row.ProcessId),
            Number(row.ParentProcessId || 0),
            row.CommandLine || row.ExecutablePath || '',
            homeDir,
        ));
}

function parseUnixProcessList(stdout, homeDir) {
    return stdout
        .split(/\r?\n/)
        .map(line => line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/))
        .filter(Boolean)
        .map(match => ({
            pid: Number(match[1]),
            ppid: Number(match[2]),
            commandLine: match[3],
        }))
        // Antigravity IDE 2.6.0+ runs the agy hub; older builds run language_server_*
        .filter(processInfo => /language_server|(^|\/)agy(\s|$)/i.test(processInfo.commandLine))
        .map(processInfo => enrichProcessInfo(
            processInfo.pid,
            processInfo.ppid,
            processInfo.commandLine,
            homeDir,
        ));
}

async function listLanguageServerProcesses() {
    if (os.platform() === 'win32') {
        const command = [
            'powershell -NoProfile -Command',
            '"Get-CimInstance Win32_Process -Filter \\"name like \'language_server%\' or name = \'agy.exe\'\\"',
            '| Select-Object ProcessId,ParentProcessId,CommandLine,ExecutablePath',
            '| ConvertTo-Json -Depth 2"',
        ].join(' ');
        const result = await runCommand(command);
        if (result.error && !result.stdout.trim()) {
            throw new Error(result.stderr.trim() || result.error.message);
        }
        return parseWindowsProcessJson(result.stdout);
    }

    const result = await runCommand('ps -A -ww -o pid=,ppid=,args=');
    if (result.error && !result.stdout.trim()) {
        throw new Error(result.stderr.trim() || result.error.message);
    }
    return parseUnixProcessList(result.stdout);
}

function extractArgument(commandLine, argumentName) {
    const escapedName = argumentName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(
        `--${escapedName}(?:=|\\s+)(?:"([^"]*)"|'([^']*)'|([^\\s]+))`,
        'i'
    );
    const match = commandLine.match(pattern);
    return match ? (match[1] ?? match[2] ?? match[3] ?? null) : null;
}

module.exports = {
    extractArgument,
    listLanguageServerProcesses,
    parseUnixProcessList,
    parseWindowsProcessJson,
    readHubDaemonInfo,
    runCommand,
};
