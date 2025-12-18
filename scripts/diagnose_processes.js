
const { exec } = require('child_process');
const os = require('os');
const path = require('path');

// PowerShell command to get detailed process info
const psCommand = `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"name like 'language_server%'\\" | Select-Object ProcessId,ParentProcessId,CommandLine,ExecutablePath | ConvertTo-Json"`;

console.log('🔍 Scanning for Antigravity Language Server processes...');
console.log('---------------------------------------------------------');

exec(psCommand, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
    if (error) {
        console.error(`❌ Error executing PowerShell: ${error.message}`);
        return;
    }
    if (stderr) {
        console.error(`⚠️ PowerShell stderr: ${stderr}`);
    }

    try {
        const output = stdout.trim();
        if (!output) {
            console.log('No language_server processes found.');
            return;
        }

        let processes = JSON.parse(output);
        // Normalize strict single object to array
        if (!Array.isArray(processes)) {
            processes = [processes];
        }

        console.log(`Found ${processes.length} process(es):\n`);

        processes.forEach((proc, index) => {
            console.log(`[Process #${index + 1}]`);
            console.log(`  PID: ${proc.ProcessId}`);
            console.log(`  PPID: ${proc.ParentProcessId}`);
            console.log(`  Executable: ${proc.ExecutablePath}`);
            console.log(`  CommandLine (partial):`);

            // Format CommandLine for readability (split by space but keep quoted strings together ideally, simplified here)
            const cmd = proc.CommandLine || '';
            const args = cmd.split(/\s+/);

            // Log key arguments we care about
            const interestingArgs = [
                '--user-data-dir',
                '--app_data_dir',
                '--extension_server_port',
                '--csrf_token',
                '--socket_path'
            ];

            let foundInteresting = false;
            // Native args check
            interestingArgs.forEach(argKey => {
                const regex = new RegExp(`${argKey}[=\\s]+([^\\s]+)`, 'i');
                const match = cmd.match(regex);
                if (match) {
                    console.log(`    👉 ${argKey}: ${match[1]}`);
                    foundInteresting = true;
                }
            });

            // Also check for raw path presence
            if (cmd.includes('antigravity')) {
                // Find parts of command line that look like paths
                const paths = cmd.match(/[a-zA-Z]:\\[^ "]+/g);
                if (paths) {
                    console.log('    📂 Paths found in CMD:');
                    paths.forEach(p => {
                        if (p.includes('antigravity') || p.includes('User')) {
                            console.log(`      - ${p}`);
                        }
                    });
                }
            }

            console.log('');
        });

        console.log('---------------------------------------------------------');
        console.log('💡 Analysis Suggestion:');
        console.log('   Compare the "PPID" or paths in "CommandLine" against your running IDE instances.');
        console.log(`   Current Script Process PID: ${process.pid}`);
        console.log(`   Current Script PPID: ${process.ppid}`);

    } catch (e) {
        console.error('❌ Error parsing JSON output:', e);
        console.log('Raw output header:', stdout.substring(0, 100));
    }
});
