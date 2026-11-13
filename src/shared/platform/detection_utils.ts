import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { testPort as httpTestPort } from "../utils/http_client";
import type { ProcessInfo } from "../utils/types";

/**
 * Common utilities extracted from ProcessFinder to avoid redundancy.
 * Strictly using the original logic as requested.
 */

const ANTIGRAVITY_APP_DATA_DIRS = [
    "antigravity",
    "antigravity-ide",
] as const;

const ANTIGRAVITY_APP_DATA_VALUES = new Set<string>(ANTIGRAVITY_APP_DATA_DIRS);

let resolveHomeDir: () => string = () => os.homedir();

/**
 * Overrides the home directory resolver in unit tests where `os.homedir`
 * cannot be stubbed directly on modern Node.js.
 */
export function setHomeDirResolverForTests(resolver?: () => string): void {
    resolveHomeDir = resolver ?? (() => os.homedir());
}

export interface HubDaemonInfo {
    csrfToken: string;
    httpPort?: number;
    httpsPort?: number;
    pid?: number;
}

/**
 * Extracts the supported Antigravity `--app_data_dir` value from a command line.
 */
export function getAntigravityAppDataDir(commandLine: string): string | undefined {
    const match = commandLine.match(
        /(?:^|\s)--app_data_dir(?:=|\s+)(?:"([^"]+)"|'([^']+)'|([^\s]+))(?=\s|$)/i,
    );
    const value = match?.[1] ?? match?.[2] ?? match?.[3];

    if (value !== undefined && ANTIGRAVITY_APP_DATA_VALUES.has(value.toLowerCase())) {
        return value.toLowerCase();
    }
    return undefined;
}

/**
 * Checks the product identity marker emitted by supported Antigravity
 * language-server processes.
 */
export function hasAntigravityAppDataDir(commandLine: string): boolean {
    return getAntigravityAppDataDir(commandLine) !== undefined;
}

function parseHubDaemonFile(filePath: string): HubDaemonInfo | null {
    try {
        const raw = fs.readFileSync(filePath, "utf8");
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        if (!parsed || typeof parsed !== "object") {
            return null;
        }
        const csrfToken = typeof parsed.csrfToken === "string" ? parsed.csrfToken.trim() : "";
        if (!csrfToken) {
            return null;
        }
        return {
            csrfToken,
            httpPort: typeof parsed.httpPort === "number" ? parsed.httpPort : undefined,
            httpsPort: typeof parsed.httpsPort === "number" ? parsed.httpsPort : undefined,
            pid: typeof parsed.pid === "number" ? parsed.pid : undefined,
        };
    } catch {
        return null;
    }
}

/**
 * Reads `~/.gemini/<app_data_dir>/daemon/hub_<port>.json` emitted by `agy` (v1.5.7+)
 * when `--csrf_token` is no longer passed on the command line.
 */
export function readHubDaemonInfo(
    hubPort: number,
    appDataDir?: string,
    homeDir: string = resolveHomeDir(),
): HubDaemonInfo | null {
    if (!Number.isInteger(hubPort) || hubPort <= 0 || hubPort > 65535) {
        return null;
    }

    const dirsToTry = appDataDir ? [appDataDir] : [...ANTIGRAVITY_APP_DATA_DIRS];
    for (const dir of dirsToTry) {
        const filePath = path.join(homeDir, ".gemini", dir, "daemon", `hub_${hubPort}.json`);
        const info = parseHubDaemonFile(filePath);
        if (info) {
            return info;
        }
    }
    return null;
}

function isPidAlive(pid: number): boolean {
    try {
        process.kill(pid, 0);
        return true;
    } catch (err: unknown) {
        return (err as NodeJS.ErrnoException)?.code === "EPERM";
    }
}

/**
 * Scans `~/.gemini/{antigravity,antigravity-ide}/daemon/hub_*.json` for live
 * `agy` hub processes when command-line process discovery yields no matches.
 */
export function scanHubDaemonFiles(homeDir: string = resolveHomeDir()): ProcessInfo[] {
    const results: ProcessInfo[] = [];
    const seenPids = new Set<number>();

    for (const dir of ANTIGRAVITY_APP_DATA_DIRS) {
        const daemonDir = path.join(homeDir, ".gemini", dir, "daemon");
        let entries: string[];
        try {
            entries = fs.readdirSync(daemonDir);
        } catch {
            continue;
        }

        for (const entry of entries) {
            const match = entry.match(/^hub_(\d+)\.json$/);
            if (!match) continue;

            const info = parseHubDaemonFile(path.join(daemonDir, entry));
            if (!info || !info.pid || !Number.isInteger(info.pid) || info.pid <= 0) {
                continue;
            }
            if (seenPids.has(info.pid) || !isPidAlive(info.pid)) {
                continue;
            }

            seenPids.add(info.pid);
            const hubPort = parseInt(match[1], 10);
            results.push({
                pid: info.pid,
                ppid: 0,
                extensionPort: info.httpPort || info.httpsPort || hubPort,
                csrfToken: info.csrfToken,
            });
        }
    }

    return results;
}

/**
 * Extracts ProcessInfo from a process command line, falling back to
 * `hub_<port>.json` when `--csrf_token` is omitted by newer `agy` builds.
 */
export function extractProcessInfoFromCommandLine(
    commandLine: string,
    pid: number,
    ppid?: number,
    homeDir?: string,
): ProcessInfo | null {
    const appDataDir = getAntigravityAppDataDir(commandLine);
    if (!appDataDir) {
        return null;
    }

    const portMatch = commandLine.match(SERVER_PORT_PATTERN);
    const tokenMatch = commandLine.match(
        /--csrf_token[=\s]+(?:["']?)([a-zA-Z0-9\-_.]+)(?:["']?)/,
    );
    const wsMatch = commandLine.match(
        /--workspace_id[=\s]+(?:["']?)([a-zA-Z0-9\-_.]+)(?:["']?)/,
    );

    if (tokenMatch?.[1]) {
        return {
            pid,
            ppid,
            extensionPort: portMatch?.[1] ? parseInt(portMatch[1], 10) : 0,
            csrfToken: tokenMatch[1],
            workspaceId: wsMatch?.[1],
        };
    }

    if (portMatch?.[1]) {
        const hubPort = parseInt(portMatch[1], 10);
        const daemonInfo = readHubDaemonInfo(hubPort, appDataDir, homeDir);
        if (daemonInfo) {
            return {
                pid,
                ppid,
                extensionPort: daemonInfo.httpPort || daemonInfo.httpsPort || hubPort,
                csrfToken: daemonInfo.csrfToken,
                workspaceId: wsMatch?.[1],
            };
        }
    }

    return null;
}

/**
 * Port argument of a backend process: the legacy language server passes
 * --extension_server_port, the agy hub (Antigravity IDE 2.6.0+) --hub-port.
 */
export const SERVER_PORT_PATTERN = /--(?:extension_server_port|hub-port)[=\s]+(\d+)/;

/**
 * Original testPort logic from ProcessFinder
 */
export async function verifyServerGateway(
    hostname: string,
    port: number,
    csrfToken: string,
    endpoint: string = "/exa.language_server_pb.LanguageServerService/GetUserStatus"
): Promise<{
    success: boolean;
    statusCode: number;
    protocol: "https" | "http";
    error?: string;
}> {
    return httpTestPort(
        hostname,
        port,
        endpoint,
        {
            "X-Codeium-Csrf-Token": csrfToken,
            "Connect-Protocol-Version": "1",
        },
        JSON.stringify({ wrapper_data: {} })
    );
}

/**
 * Original port list command construction logic
 */
export function getPortListCommand(pid: number, platform: string, unixAvailableCmd?: string): string {
    if (platform === "win32") {
        return `chcp 65001 >nul && netstat -ano | findstr "LISTENING" | findstr /R /C:" ${pid}$"`;
    }

    // Unix/Linux fallback chain logic
    if (platform === "darwin") {
        return `lsof -nP -a -iTCP -sTCP:LISTEN -p ${pid} 2>/dev/null | grep -E "^\\S+\\s+${pid}\\s"`;
    }

    if (unixAvailableCmd === "lsof") {
        return `lsof -nP -a -iTCP -sTCP:LISTEN -p ${pid} 2>/dev/null | grep -E "^\\S+\\s+${pid}\\s"`;
    } else if (unixAvailableCmd === "ss") {
        return `ss -tlnp 2>/dev/null | grep "pid=${pid},"`;
    } else if (unixAvailableCmd === "netstat") {
        return `netstat -tulpn 2>/dev/null | grep -E "[[:space:]]${pid}/"`;
    }

    return `ss -tlnp 2>/dev/null | grep "pid=${pid}," || lsof -nP -a -iTCP -sTCP:LISTEN -p ${pid} 2>/dev/null | grep -E "^\\S+\\s+${pid}\\s"`;
}
