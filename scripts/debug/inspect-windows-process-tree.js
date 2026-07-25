const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

function printHelp() {
    console.log(`Usage: node scripts/debug/inspect-windows-process-tree.js

Inspect the real Windows process ancestry between Antigravity/VS Code,
Extension Host processes, and language_server_windows_x64.exe.`);
}

async function getProcessList() {
    const command = [
        'powershell -NoProfile -Command',
        '"Get-CimInstance Win32_Process',
        '| Select-Object ProcessId,ParentProcessId,Name,CommandLine',
        '| ConvertTo-Json -Depth 2"',
    ].join(' ');
    const { stdout } = await execAsync(command, { timeout: 10000, maxBuffer: 10 * 1024 * 1024 });
    const parsed = JSON.parse(stdout);
    return Array.isArray(parsed) ? parsed : [parsed];
}

function buildProcessMap(processes) {
    const processMap = new Map();
    for (const processInfo of processes) {
        if (!processInfo.ProcessId) continue;
        processMap.set(processInfo.ProcessId, {
            info: processInfo,
            parent: null,
        });
    }
    for (const node of processMap.values()) {
        node.parent = processMap.get(node.info.ParentProcessId) || null;
    }
    return processMap;
}

function findRelevantProcesses(processes) {
    const servers = [];
    const extensionHosts = [];
    const ideProcesses = [];

    for (const processInfo of processes) {
        const name = String(processInfo.Name || '').toLowerCase();
        const commandLine = String(processInfo.CommandLine || '').toLowerCase();
        const isIdeExecutable = (
            name === 'code.exe'
            || name === 'antigravity.exe'
            || name === 'antigravity ide.exe'
        );
        if (name === 'language_server_windows_x64.exe' || commandLine.includes('language_server_windows_x64.exe')) {
            servers.push(processInfo);
        }
        if (
            isIdeExecutable
            && commandLine.includes('--type=extensionhost')
        ) {
            extensionHosts.push(processInfo);
        }
        if (isIdeExecutable && !commandLine.includes('--type=')) {
            ideProcesses.push(processInfo);
        }
    }

    return { servers, extensionHosts, ideProcesses };
}

function getRole(processInfo, relevant) {
    if (relevant.servers.some(item => item.ProcessId === processInfo.ProcessId)) return 'Language Server';
    if (relevant.extensionHosts.some(item => item.ProcessId === processInfo.ProcessId)) return 'Extension Host';
    if (relevant.ideProcesses.some(item => item.ProcessId === processInfo.ProcessId)) return 'IDE';
    return '';
}

function printAncestry(server, processMap, relevant) {
    console.log(`\nLanguage Server PID ${server.ProcessId}`);
    let current = processMap.get(server.ProcessId);
    let depth = 0;
    while (current && depth < 12) {
        const role = getRole(current.info, relevant);
        const roleLabel = role ? ` [${role}]` : '';
        console.log(`${'  '.repeat(depth)}↳ ${current.info.Name} PID ${current.info.ProcessId}${roleLabel}`);
        current = current.parent;
        depth += 1;
    }
}

async function main() {
    if (process.argv.includes('--help') || process.argv.includes('-h')) {
        printHelp();
        return;
    }
    if (process.platform !== 'win32') {
        console.error('This tool must be run from a native Windows Node.js process.');
        process.exitCode = 2;
        return;
    }

    console.log('Antigravity Windows process-tree inspection');
    const processes = await getProcessList();
    const processMap = buildProcessMap(processes);
    const relevant = findRelevantProcesses(processes);

    console.log(`Language Servers: ${relevant.servers.length}`);
    console.log(`Extension Hosts: ${relevant.extensionHosts.length}`);
    console.log(`IDE Processes: ${relevant.ideProcesses.length}`);

    if (relevant.servers.length === 0) {
        console.error('No language_server_windows_x64.exe process was found.');
        process.exitCode = 1;
        return;
    }

    for (const server of relevant.servers) {
        printAncestry(server, processMap, relevant);
    }
}

main().catch(error => {
    console.error(`Windows process-tree inspection failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
});
