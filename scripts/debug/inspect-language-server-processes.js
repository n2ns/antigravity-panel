const os = require('os');
const {
    extractArgument,
    listLanguageServerProcesses,
} = require('./language-server-process-utils');

function printHelp() {
    console.log(`Usage: node scripts/debug/inspect-language-server-processes.js

Inspect running Antigravity Language Server processes and print their complete
local connection arguments, including CSRF tokens.`);
}

function printProcess(processInfo, index) {
    const commandLine = processInfo.commandLine;
    const apiToken = extractArgument(commandLine, 'csrf_token');
    const extensionToken = extractArgument(commandLine, 'extension_server_csrf_token');
    const fields = [
        ['workspace_id', extractArgument(commandLine, 'workspace_id')],
        ['extension_server_port', extractArgument(commandLine, 'extension_server_port')],
        ['port', extractArgument(commandLine, 'port')],
        ['csrf_token', apiToken],
        ['extension_server_csrf_token', extensionToken],
        ['app_data_dir', extractArgument(commandLine, 'app_data_dir')],
    ].filter(([, value]) => value);

    console.log(`\n[Process ${index + 1}] PID ${processInfo.pid}, PPID ${processInfo.ppid}`);
    for (const [name, value] of fields) {
        console.log(`  --${name}: ${value}`);
    }
    console.log(`  command: ${commandLine}`);
}

async function main() {
    if (process.argv.includes('--help') || process.argv.includes('-h')) {
        printHelp();
        return;
    }

    console.log('Antigravity Language Server process inspection');
    console.log(`Platform: ${os.platform()} (${os.arch()})`);

    const processes = await listLanguageServerProcesses();
    if (processes.length === 0) {
        console.error('\nNo running language_server process was found.');
        process.exitCode = 1;
        return;
    }

    console.log(`Found ${processes.length} process(es).`);
    processes.forEach(printProcess);
}

main().catch(error => {
    console.error(`Process inspection failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
});
