
const { exec } = require('child_process');
const os = require('os');

const platform = os.platform(); // 'linux' | 'darwin' | 'win32'

console.log('🔍 Scanning for Antigravity Language Server processes...');
console.log(`🖥️  Platform: ${platform}`);
console.log('---------------------------------------------------------');

// ─── 平台特定命令 ────────────────────────────────────────────────────────────

function buildCommand() {
    if (platform === 'win32') {
        // Windows: PowerShell CIM
        return `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"name like 'language_server%'\\" | Select-Object ProcessId,ParentProcessId,CommandLine,ExecutablePath | ConvertTo-Json"`;
    } else {
        // Linux / macOS: ps + grep
        // 输出格式: PID PPID COMMAND (含完整 args)
        // timeout 5s 防止在某些嵌套环境下 ps 子进程阻塞
        return `timeout 5s ps -eo pid,ppid,args | grep -i 'language_server' | grep -v grep`;
    }
}

// ─── 解析进程信息 ─────────────────────────────────────────────────────────────

/** 从命令行字符串中提取关键参数值 */
function extractArgs(cmdLine) {
    const interestingArgs = [
        '--app_data_dir',
        '--extension_server_port',
        '--csrf_token',
        '--socket_path',
        '--workspace_id',
        '--port',
    ];
    const found = {};
    for (const argKey of interestingArgs) {
        const regex = new RegExp(`${argKey}[=\\s]+([^\\s]+)`, 'i');
        const match = cmdLine.match(regex);
        if (match) found[argKey] = match[1];
    }
    return found;
}

/** Linux/macOS: 将 ps 输出的每行解析为 { pid, ppid, cmd } */
function parsePsOutput(stdout) {
    return stdout.trim().split('\n').map(line => {
        const parts = line.trim().split(/\s+/);
        const pid = parts[0];
        const ppid = parts[1];
        const cmd = parts.slice(2).join(' ');
        return { pid, ppid, cmd };
    }).filter(p => p.pid && !isNaN(Number(p.pid)));
}

/** Windows: JSON 输出解析 */
function parseWinOutput(stdout) {
    let procs = JSON.parse(stdout.trim());
    if (!Array.isArray(procs)) procs = [procs];
    return procs.map(p => ({
        pid: String(p.ProcessId),
        ppid: String(p.ParentProcessId),
        cmd: p.CommandLine || p.ExecutablePath || '',
    }));
}

// ─── 统一输出 ─────────────────────────────────────────────────────────────────

function printProcess(proc, index) {
    console.log(`[Process #${index + 1}]`);
    console.log(`  PID:  ${proc.pid}`);
    console.log(`  PPID: ${proc.ppid}`);

    const args = extractArgs(proc.cmd);
    if (Object.keys(args).length > 0) {
        for (const [k, v] of Object.entries(args)) {
            console.log(`  👉 ${k}: ${v}`);
        }
    } else {
        // 截断显示完整命令行
        const preview = proc.cmd.length > 200 ? proc.cmd.slice(0, 200) + '…' : proc.cmd;
        console.log(`  CMD: ${preview}`);
    }
    console.log('');
}

// ─── 主流程 ───────────────────────────────────────────────────────────────────

exec(buildCommand(), { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
    if (error && !stdout) {
        console.error(`❌ Command failed: ${error.message}`);
        if (platform === 'win32') {
            console.log('💡 Make sure PowerShell is accessible in PATH.');
        } else {
            console.log('💡 Try: ps -eo pid,ppid,args | grep language_server');
        }
        return;
    }

    try {
        const output = stdout.trim();
        if (!output) {
            console.log('⚠️  No language_server processes found.');
            console.log('   The language server may not be running, or the process name differs.');
            return;
        }

        const processes = platform === 'win32'
            ? parseWinOutput(output)
            : parsePsOutput(output);

        if (processes.length === 0) {
            console.log('⚠️  Parsed 0 processes. Raw output:');
            console.log(output.slice(0, 300));
            return;
        }

        console.log(`✅ Found ${processes.length} language_server process(es):\n`);
        processes.forEach((proc, i) => printProcess(proc, i));

        console.log('---------------------------------------------------------');
        console.log('💡 Tips:');
        console.log('   - Compare PPID with your IDE extension host PID.');
        console.log('   - Use --csrf_token value in fetch_real_quota.js.');
        console.log('   - Use --extension_server_port to identify the active port.');
        console.log(`   Current script PID: ${process.pid}, PPID: ${process.ppid}`);

    } catch (e) {
        console.error('❌ Error parsing output:', e.message);
        console.log('Raw output (first 300 chars):', stdout.slice(0, 300));
    }
});
