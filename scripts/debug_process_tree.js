
const { exec } = require("child_process");
const { promisify } = require("util");

const execAsync = promisify(exec);

// ANSI colors for better visibility
const colors = {
    reset: "\x1b[0m",
    bright: "\x1b[1m",
    dim: "\x1b[2m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    magenta: "\x1b[35m",
    cyan: "\x1b[36m",
};

async function getProcessList() {
    // Use PowerShell to get detailed process info
    const cmd = `powershell -NoProfile -Command "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Depth 2"`;

    console.log(`${colors.cyan}Fetching process list via PowerShell (this may take a few seconds)...${colors.reset}`);

    try {
        // Increase max buffer for large process lists
        const { stdout } = await execAsync(cmd, { maxBuffer: 10 * 1024 * 1024 });
        const json = JSON.parse(stdout);
        return Array.isArray(json) ? json : [json];
    } catch (error) {
        console.error("Error fetching execution processes:", error.message);
        return [];
    }
}

function buildTree(processes) {
    const tree = {}; // pid -> { info, children: [] }

    // Initialize nodes
    for (const p of processes) {
        if (!p.ProcessId) continue;
        tree[p.ProcessId] = { info: p, children: [] };
    }

    // Build hierarchy
    for (const p of processes) {
        const parentId = p.ParentProcessId;
        if (parentId && tree[parentId]) {
            tree[parentId].children.push(tree[p.ProcessId]);
            tree[p.ProcessId].parent = tree[parentId];
        }
    }

    return tree;
}

function findRelevantProcesses(processes) {
    const relevant = {
        servers: [],
        hosts: [],
        mains: []
    };

    const processName = "language_server_windows_x64.exe";

    for (const p of processes) {
        const cmd = (p.CommandLine || "").toLowerCase();
        const name = (p.Name || "").toLowerCase();

        // 1. Language Servers
        if (name === processName || cmd.includes(processName)) {
            relevant.servers.push(p);
        }

        // 2. Extension Hosts (VS Code)
        // VS Code extension host usually has --type=extensionHost
        if (name === "code.exe" && cmd.includes("--type=extensionhost")) {
            relevant.hosts.push(p);
        }

        // 3. Main Processes (VS Code / Antigravity)
        // Usually code.exe without type (or main) or Antigravity.exe
        if ((name === "code.exe" || name === "antigravity.exe") &&
            !cmd.includes("--type=") &&
            !cmd.includes("--crash-reporter-id")) {
            // Just a heuristics, checking children might be better
            relevant.mains.push(p);
        }
    }

    return relevant;
}

async function main() {
    console.log(`${colors.bright}=== Antigravity Process Tree Analyzer ===${colors.reset}\n`);

    if (process.platform !== "win32") {
        console.error("This tool is designed for Windows.");
        return;
    }

    const processes = await getProcessList();
    const tree = buildTree(processes);
    const relevant = findRelevantProcesses(processes);

    console.log(`${colors.yellow}Detected Relevant Processes:${colors.reset}`);
    console.log(`- Language Servers: ${relevant.servers.length}`);
    console.log(`- Extension Hosts:  ${relevant.hosts.length}`);
    console.log(`- IDE Main Procs:   ${relevant.mains.length}`);
    console.log("-".repeat(50));

    // --- Analyze Language Servers ---
    if (relevant.servers.length === 0) {
        console.log(`${colors.red}No Language Server found! verify IDE is running.${colors.reset}`);
    } else {
        for (const server of relevant.servers) {
            console.log(`\n${colors.green}Target: Language Server (PID: ${server.ProcessId})${colors.reset}`);
            // print ancestry
            let current = tree[server.ProcessId];
            let depth = 0;
            while (current) {
                const indent = "  ".repeat(depth);
                const isTarget = depth === 0;
                const marker = isTarget ? "◄ TARGET" : "";
                const p = current.info;

                // Highlight roles
                let role = "";
                if (relevant.hosts.some(h => h.ProcessId === p.ProcessId)) role = `${colors.magenta} [Extension Host]${colors.reset}`;
                else if (relevant.mains.some(m => m.ProcessId === p.ProcessId)) role = `${colors.blue} [IDE Main]${colors.reset}`;

                console.log(`${indent}↳ PID: ${p.ProcessId} | ${p.Name} ${role} ${marker}`);

                current = current.parent;
                depth++;
                if (depth > 5) break; // limit
            }
        }
    }

    // --- Analyze Extension Hosts ---
    let hostsToAnalyze = relevant.hosts;

    // SIMULATION: If no real extension host found, create a fake one attached to a real Main Process
    if (hostsToAnalyze.length === 0 && relevant.mains.length > 0) {
        // Find a main process that actually has a server grandchild
        const validMain = relevant.mains.find(m =>
            relevant.servers.some(s => {
                const sNode = tree[s.ProcessId];
                return sNode?.parent?.parent?.info?.ProcessId === m.ProcessId;
            })
        );

        if (validMain) {
            console.log("\n" + "-".repeat(50));
            console.log(`${colors.cyan}[SIMULATION] Creating fake Extension Host attached to Main Process ${validMain.ProcessId}${colors.reset}`);
            hostsToAnalyze = [{
                ProcessId: 99999,
                ParentProcessId: validMain.ProcessId,
                Name: "FakeExtensionHost",
                CommandLine: "simulation"
            }];
            tree[99999] = { info: hostsToAnalyze[0], parent: tree[validMain.ProcessId] };
        }
    }

    if (hostsToAnalyze.length > 0) {
        console.log("\n" + "-".repeat(50));
        console.log(`${colors.yellow}Process Matching Analysis (Simulating "Me" as Extension Host):${colors.reset}`);
        for (const host of hostsToAnalyze) {
            console.log(`\n${colors.magenta}Me: Extension Host (PID: ${host.ProcessId})${colors.reset}`);
            // Trace up to find GrandParent
            const parent = tree[host.ProcessId]?.parent;

            if (parent) {
                console.log(`  My Parent (Main): PID ${parent.info.ProcessId}`);

                // Check matching servers
                let found = false;
                for (const s of relevant.servers) {
                    // Find server's grandparent
                    const sNode = tree[s.ProcessId];
                    const sParent = sNode?.parent;
                    const sGrand = sNode?.parent?.parent;

                    const messagePrefix = `  -> Checking Server PID ${s.ProcessId} (GrandParent: ${sGrand?.info?.ProcessId || 'N/A'}):`;

                    // Logic from ProcessFinder: 
                    // 1. Sibling (Server.PPID === My.PPID) ?
                    // 2. Nephew (Server.GrandParent === My.PPID) ?

                    // Check Sibling
                    if (sParent && sParent.info.ProcessId === parent.info.ProcessId) {
                        console.log(`${messagePrefix} ${colors.green}MATCH (Sibling)${colors.reset}`);
                        found = true;
                        continue;
                    }

                    // Check Nephew (Corrected Logic)
                    if (sGrand && sGrand.info.ProcessId === parent.info.ProcessId) {
                        console.log(`${messagePrefix} ${colors.green}MATCH (Nephew - Server GrandParent matches My Parent)${colors.reset}`);
                        found = true;
                        continue;
                    }

                    console.log(`${messagePrefix} ${colors.red}NO MATCH${colors.reset}`);
                }
                if (!found) {
                    console.log(`  ${colors.red}No matching server found for this host instance.${colors.reset}`);
                }
            }
        }
    }
}

main().catch(err => console.error(err));
