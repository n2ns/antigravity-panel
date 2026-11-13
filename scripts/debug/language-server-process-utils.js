const { exec } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { isWsl, findWindowsGeminiRootFromWsl } = (() => {
    // Keep debug scripts runnable directly without building dist/ if needed
    return {
        isWsl: () => {
            if (os.platform() !== 'linux') return false;
            try {
                const version = fs.readFileSync('/proc/version', 'utf8').toLowerCase();
                return version.includes('microsoft') || version.includes('wsl');
            } catch {
                return false;
            }
        },
        findWindowsGeminiRootFromWsl: () => {
            const mountRoot = '/mnt';
            let drives = [];
            try {
                drives = fs.readdirSync(mountRoot).filter(n => /^[a-z]$/i.test(n));
            } catch {
                return null;
            }
            for (const drive of drives) {
                const usersDir = path.posix.join(mountRoot, drive, 'Users');
                try {
                    for (const name of fs.readdirSync(usersDir)) {
                        const candidate = path.posix.join(usersDir, name, '.gemini');
                        if (fs.existsSync(candidate)) return candidate;
                    }
                } catch {
                    // ignore
                }
            }
            return null;
        },
    };
})();

const COMMAND_TIMEOUT_MS = 5000;
const MAX_BUFFER_BYTES = 10 * 1024 * 1024;
const VALID_APP_DATA_DIRS = new Set(['antigravity', 'antigravity-ide']);

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

function parseWindowsProcessJson(stdout) {
    if (!stdout.trim()) return [];

    const parsed = JSON.parse(stdout);
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    return rows
        .filter(row => row && row.ProcessId)
        .map(row => ({
            pid: Number(row.ProcessId),
            ppid: Number(row.ParentProcessId || 0),
            commandLine: row.CommandLine || row.ExecutablePath || '',
        }));
}

function parseUnixProcessList(stdout) {
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
        .filter(processInfo => /language_server|(^|\/)agy(\s|$)/i.test(processInfo.commandLine));
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
        `(?:^|\\s)--${escapedName}(?:=|\\s+)(?:"([^"]*)"|'([^']*)'|([^\\s]+))(?=\\s|$)`,
        'i'
    );
    const match = commandLine.match(pattern);
    return match ? (match[1] ?? match[2] ?? match[3] ?? null) : null;
}

function getDefaultGeminiRoots() {
    const roots = [path.join(os.homedir(), '.gemini')];
    if (isWsl()) {
        const winRoot = findWindowsGeminiRootFromWsl();
        if (winRoot && !roots.includes(winRoot)) roots.push(winRoot);
    }
    return roots;
}

function parseHubDiscovery(raw, expectedPid) {
    try {
        const data = JSON.parse(raw);
        if (!data || typeof data.csrfToken !== 'string' || !data.csrfToken.trim()) {
            return null;
        }
        if (expectedPid && typeof data.pid === 'number' && data.pid !== expectedPid) {
            return null;
        }
        return {
            pid: typeof data.pid === 'number' ? data.pid : null,
            httpsPort: typeof data.httpsPort === 'number' ? data.httpsPort : null,
            httpPort: typeof data.httpPort === 'number' ? data.httpPort : null,
            lsVersion: typeof data.lsVersion === 'string' ? data.lsVersion : null,
            csrfToken: data.csrfToken.trim(),
        };
    } catch {
        return null;
    }
}

function readHubDiscovery(commandLine, pid, geminiRoots = getDefaultGeminiRoots()) {
    const appDataDir = (extractArgument(commandLine, 'app_data_dir') || '').toLowerCase();
    if (!VALID_APP_DATA_DIRS.has(appDataDir)) return null;

    const hubPort = Number(extractArgument(commandLine, 'hub-port')) || 0;
    const isHub = hubPort > 0 || /(?:^|\s)--hub(?=\s|$)/i.test(commandLine);
    if (!isHub) return null;

    for (const root of geminiRoots) {
        const daemonDir = path.join(root, appDataDir, 'daemon');
        if (hubPort > 0) {
            const directPath = path.join(daemonDir, `hub_${hubPort}.json`);
            if (fs.existsSync(directPath)) {
                const parsed = parseHubDiscovery(fs.readFileSync(directPath, 'utf8'), pid);
                if (parsed) return parsed;
            }
        }
        if (pid > 0 && fs.existsSync(daemonDir)) {
            for (const file of fs.readdirSync(daemonDir).filter(f => /^hub_\d+\.json$/.test(f))) {
                const parsed = parseHubDiscovery(fs.readFileSync(path.join(daemonDir, file), 'utf8'), pid);
                if (parsed && parsed.pid === pid) return parsed;
            }
        }
    }
    return null;
}

module.exports = {
    extractArgument,
    listLanguageServerProcesses,
    parseUnixProcessList,
    readHubDiscovery,
    runCommand,
};
