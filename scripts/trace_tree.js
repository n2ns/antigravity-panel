
const { exec } = require('child_process');

console.log(`🤖 Current Script Info: PID=${process.pid}, PPID=${process.ppid}`);

// Helper to get process info for a specific PID
const getProcInfo = (pid) => {
    const cmd = `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"ProcessId=${pid}\\" | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json"`;
    return new Promise((resolve) => {
        exec(cmd, (err, stdout) => {
            if (err || !stdout.trim()) resolve(null);
            else try { resolve(JSON.parse(stdout)); } catch { resolve(null); }
        });
    });
};

// Helper to find all language servers
const getLanguageServers = () => {
    const cmd = `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"name like 'language_server%'\\" | Select-Object ProcessId,ParentProcessId,Name | ConvertTo-Json"`;
    return new Promise((resolve) => {
        exec(cmd, (err, stdout) => {
            if (err || !stdout.trim()) resolve([]);
            else try {
                const res = JSON.parse(stdout);
                resolve(Array.isArray(res) ? res : [res]);
            } catch { resolve([]); }
        });
    });
};

(async () => {
    console.log('🔍 Analyzing Process Tree...');

    // 1. Trace "My" Ancestry (The script represents the Extension Host environment roughly)
    // Note: When running via 'node', the parent is the shell. In the real extension, parent is VS Code.
    // We will just show the language server ancestry to see if their parents look like VS Code.

    const servers = await getLanguageServers();
    console.log(`Found ${servers.length} Language Servers.`);

    for (const s of servers) {
        console.log(`\n🎯 Server PID: ${s.ProcessId}`);
        let currentPid = s.ParentProcessId;
        let depth = 0;

        // Trace up 3 levels
        while (currentPid > 0 && depth < 3) {
            const info = await getProcInfo(currentPid);
            if (!info) break;

            console.log(`   ⬆️ Parent (L${depth + 1}): [${info.ProcessId}] ${info.Name}`);
            // console.log(`      Cmd: ${info.CommandLine}`); // Optional: too noisy

            currentPid = info.ParentProcessId;
            depth++;
        }
    }
})();
