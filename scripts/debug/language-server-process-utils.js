const { exec } = require('child_process');
const os = require('os');

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
        .filter(processInfo => /language_server/i.test(processInfo.commandLine));
}

async function listLanguageServerProcesses() {
    if (os.platform() === 'win32') {
        const command = [
            'powershell -NoProfile -Command',
            '"Get-CimInstance Win32_Process -Filter \\"name like \'language_server%\'\\"',
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
    runCommand,
};
