import {
    verifyServerGateway,
    getPortListCommand,
    hasAntigravityAppDataDir,
} from "./detection_utils";
import { exec } from "child_process";
import { promisify } from "util";
import {
    ProcessInfo,
    LanguageServerInfo,
} from "../utils/types";
import { debugLog, infoLog, errorLog } from "../utils/logger";
import { isWsl, getWslHostIp } from "../utils/wsl";

const spawnShell = promisify(exec);

/**
 * Parses PID-scoped listening-port output from the platform commands used by
 * AmbientDiscovery.
 */
export function parseAmbientListeningPorts(
    raw: string,
    platform: string,
    pid: number,
): number[] {
    const ports = new Set<number>();

    for (const line of raw.split(/\r?\n/)) {
        let port = 0;

        if (platform === "win32") {
            const match = line.match(
                /(?:127\.0\.0\.1|0\.0\.0\.0|\[::1?\]):(\d+)\s+\S+\s+LISTENING\s+(\d+)\s*$/i,
            );
            if (match?.[1] && parseInt(match[2], 10) === pid) {
                port = parseInt(match[1], 10);
            }
        } else {
            const ssMatch = line.match(
                /^\s*LISTEN\s+\S+\s+\S+\s+(?:\*|[\d.]+|\[[\da-f:]+\]|[\da-f:]+):(\d+)\b/i,
            );
            const ssPids = [...line.matchAll(/\bpid=(\d+),/gi)]
                .map((match) => parseInt(match[1], 10));

            const lsofMatch = line.match(
                /\b(?:TCP|UDP)\s+(?:\*|[\d.]+|\[[\da-f:]+\]|[\da-f:]+):(\d+)\s+\(LISTEN\)/i,
            );
            const lsofPid = parseInt(line.trim().split(/\s+/)[1], 10);

            const netstatMatch = line.match(
                /^\s*tcp\S*\s+\S+\s+\S+\s+(?:\*|[\d.]+|\[[\da-f:]+\]|[\da-f:]+):(\d+)\s+\S+\s+LISTEN\s+(\d+)\/\S+/i,
            );

            if (ssMatch?.[1] && ssPids.includes(pid)) {
                port = parseInt(ssMatch[1], 10);
            } else if (lsofMatch?.[1] && lsofPid === pid) {
                port = parseInt(lsofMatch[1], 10);
            } else if (
                netstatMatch?.[1]
                && parseInt(netstatMatch[2], 10) === pid
            ) {
                port = parseInt(netstatMatch[1], 10);
            }
        }

        if (port > 0 && port <= 65535) {
            ports.add(port);
        }
    }

    return [...ports];
}

/**
 * AmbientDiscovery: A standalone, signature-based discovery layer.
 * This class is decoupled from the main Strategy pattern to provide 
 * a secondary, independent detection mechanism.
 */
export class AmbientDiscovery {
    constructor() {
        debugLog("AmbientDiscovery: Initialized.");
    }

    /**
     * Initiates a wide-spectrum search for processes containing the Antigravity signature.
     */
    public async executeDiscovery(): Promise<LanguageServerInfo | null> {
        infoLog("AmbientDiscovery: Starting signature-based detection...");

        try {
            const candidates = await this.locateBySignature();
            if (!candidates || candidates.length === 0) {
                return null;
            }

            for (const candidate of candidates) {
                const connection = await this.probeAndEstablish(candidate);
                if (connection) {
                    return connection;
                }
            }
        } catch (e) {
            errorLog("AmbientDiscovery: Fatal error in discovery", e instanceof Error ? e : String(e));
        }

        return null;
    }

    private async locateBySignature(): Promise<ProcessInfo[]> {
        const signature = "csrf_token";
        let shellCmd: string;

        if (process.platform === "win32") {
            const psScript = `
        [Console]::OutputEncoding = [System.Text.Encoding]::UTF8;
        $sign = '${signature}';
        $pList = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match $sign } -ErrorAction SilentlyContinue;
        if ($pList) { @($pList) | Select-Object ProcessId,ParentProcessId,CommandLine | ConvertTo-Json -Compress } else { '[]' }
      `.replace(/\n\s+/g, " ").trim();
            shellCmd = `chcp 65001 >nul && powershell -ExecutionPolicy Bypass -NoProfile -Command "${psScript}"`;
        } else {
            shellCmd = `ps -A -ww -o pid,ppid,args | grep "${signature}" | grep -v grep`;
        }

        try {
            const { stdout } = await spawnShell(shellCmd, { timeout: 15000 });
            return this.parseOutput(stdout);
        } catch {
            return [];
        }
    }

    private parseOutput(raw: string): ProcessInfo[] {
        const findings: ProcessInfo[] = [];

        if (process.platform === "win32") {
            try {
                const data = JSON.parse(raw.trim());
                const entries = Array.isArray(data) ? data : [data];
                for (const entry of entries) {
                    const info = this.extractDetails(entry.CommandLine || "", entry.ProcessId, entry.ParentProcessId);
                    if (info) findings.push(info);
                }
            } catch {
                debugLog("AmbientDiscovery: Windows JSON payload parsing failed");
            }
        } else {
            const rows = raw.trim().split("\n");
            for (const row of rows) {
                const match = row.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/);
                if (match) {
                    const info = this.extractDetails(match[3], parseInt(match[1], 10), parseInt(match[2], 10));
                    if (info) findings.push(info);
                }
            }
        }
        return findings;
    }

    private extractDetails(cmd: string, pid: number, ppid: number): ProcessInfo | null {
        if (
            !cmd.includes("--csrf_token")
            || !cmd.includes("--extension_server_port")
            || !hasAntigravityAppDataDir(cmd)
        ) {
            return null;
        }

        const portPtr = cmd.match(/--extension_server_port[=\s]+(\d+)/);
        const tokenPtr = cmd.match(/--csrf_token[=\s]+(?:["']?)([a-zA-Z0-9\-_.]+)(?:["']?)/);
        const wsPtr = cmd.match(/--workspace_id[=\s]+(?:["']?)([a-zA-Z0-9\-_.]+)(?:["']?)/);

        if (tokenPtr?.[1]) {
            return {
                pid,
                ppid: ppid || 0,
                extensionPort: portPtr ? parseInt(portPtr[1], 10) : 0,
                csrfToken: tokenPtr[1],
                workspaceId: wsPtr?.[1],
            };
        }
        return null;
    }

    private async probeAndEstablish(meta: ProcessInfo): Promise<LanguageServerInfo | null> {
        const ports = await this.lookupPorts(meta.pid);
        if (ports.length === 0) return null;

        for (const port of ports) {
            const auth = await verifyServerGateway("127.0.0.1", port, meta.csrfToken);
            if (auth.success) return { port, csrfToken: meta.csrfToken };

            if (isWsl()) {
                const ip = getWslHostIp();
                if (ip && ip !== "127.0.0.1") {
                    const authWsl = await verifyServerGateway(ip, port, meta.csrfToken);
                    if (authWsl.success) return { port, csrfToken: meta.csrfToken };
                }
            }
        }
        return null;
    }

    private async lookupPorts(pid: number): Promise<number[]> {
        const cmd = getPortListCommand(pid, process.platform);

        try {
            const { stdout } = await spawnShell(cmd, { timeout: 5000 });
            return parseAmbientListeningPorts(stdout, process.platform, pid);
        } catch {
            return [];
        }
    }
}
