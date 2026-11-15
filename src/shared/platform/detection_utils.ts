import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { testPort as httpTestPort } from "../utils/http_client";
import { GEMINI_ROOT_DIR_NAME } from "../utils/constants";
import { findWindowsGeminiRootFromWsl } from "../utils/config_targets";
import { isWsl } from "../utils/wsl";
import { normalizePathToWorkspaceId } from "../utils/workspace_path";
import type { ProcessInfo } from "../utils/types";

/**
 * Common utilities shared by ProcessFinder, PlatformStrategies, and AmbientDiscovery.
 */

export const ANTIGRAVITY_APP_DATA_VALUES = new Set([
    "antigravity",
    "antigravity-ide",
]);

/**
 * Port argument of a backend process: the legacy language server passes
 * --extension_server_port, the agy hub (Antigravity IDE 2.6.0+) --hub-port.
 */
export const SERVER_PORT_PATTERN = /--(?:extension_server_port|hub-port)[=\s]+(\d+)/;

const HUB_DISCOVERY_FILE_PATTERN = /^hub_\d+\.json$/;

export interface HubDiscoveryInfo {
    pid?: number;
    httpsPort?: number;
    httpPort?: number;
    lsVersion?: string;
    csrfToken: string;
}

export interface HubDiscoveryCandidate extends HubDiscoveryInfo {
    local: boolean;
    mtimeMs: number;
}

export interface HubDiscoveryDeps {
    exists: (filePath: string) => boolean;
    readFile: (filePath: string) => string;
    readdir: (dirPath: string) => string[];
    statMtimeMs: (filePath: string) => number;
    getGeminiRoots: () => Array<{ root: string; local: boolean }>;
    isPidAlive: (pid: number) => boolean;
}

function defaultIsPidAlive(pid: number): boolean {
    try {
        process.kill(pid, 0);
        return true;
    } catch (e) {
        return (e as NodeJS.ErrnoException)?.code === "EPERM";
    }
}

function getDefaultGeminiRoots(): Array<{ root: string; local: boolean }> {
    const localRoot = path.join(os.homedir(), GEMINI_ROOT_DIR_NAME);
    const roots: Array<{ root: string; local: boolean }> = [{ root: localRoot, local: true }];

    if (isWsl()) {
        const winRoot = findWindowsGeminiRootFromWsl();
        if (winRoot && winRoot !== localRoot) {
            roots.push({ root: winRoot, local: false });
        }
    }

    return roots;
}

export const defaultHubDiscoveryDeps: HubDiscoveryDeps = {
    exists: (filePath) => fs.existsSync(filePath),
    readFile: (filePath) => fs.readFileSync(filePath, "utf8"),
    readdir: (dirPath) => fs.readdirSync(dirPath),
    statMtimeMs: (filePath) => fs.statSync(filePath).mtimeMs,
    getGeminiRoots: getDefaultGeminiRoots,
    isPidAlive: defaultIsPidAlive,
};

/**
 * Extracts a `--name=value` or `--name value` CLI argument (supports single/double quotes).
 */
export function extractCliArgument(commandLine: string, argName: string): string | undefined {
    const escapedName = argName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(
        `(?:^|\\s)--${escapedName}(?:=|\\s+)(?:"([^"]+)"|'([^']+)'|([^\\s]+))(?=\\s|$)`,
        "i",
    );
    const match = commandLine.match(pattern);
    return match?.[1] ?? match?.[2] ?? match?.[3];
}

/**
 * Checks the product identity marker emitted by supported Antigravity
 * language-server processes.
 */
export function hasAntigravityAppDataDir(commandLine: string): boolean {
    const value = extractCliArgument(commandLine, "app_data_dir");

    return value !== undefined
        && ANTIGRAVITY_APP_DATA_VALUES.has(value.toLowerCase());
}

function parsePortNumber(value: unknown): number | undefined {
    return typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 65535
        ? value
        : undefined;
}

/**
 * Parses a hub discovery file (`~/.gemini/<app_data_dir>/daemon/hub_<port>.json`).
 * Rejects entries whose recorded PID mismatches `expectedPid` to avoid stale files.
 */
export function parseHubDiscoveryJson(raw: string, expectedPid?: number): HubDiscoveryInfo | null {
    try {
        const data = JSON.parse(raw) as Record<string, unknown>;
        if (!data || typeof data !== "object") {
            return null;
        }
        const csrfToken = typeof data.csrfToken === "string" ? data.csrfToken.trim() : "";
        if (!csrfToken) {
            return null;
        }
        const pid = typeof data.pid === "number" && Number.isInteger(data.pid) && data.pid > 0
            ? data.pid
            : undefined;
        if (expectedPid && expectedPid > 0 && pid !== undefined && pid !== expectedPid) {
            return null;
        }

        return {
            ...(pid !== undefined ? { pid } : {}),
            ...(parsePortNumber(data.httpsPort) !== undefined ? { httpsPort: parsePortNumber(data.httpsPort) } : {}),
            ...(parsePortNumber(data.httpPort) !== undefined ? { httpPort: parsePortNumber(data.httpPort) } : {}),
            ...(typeof data.lsVersion === "string" ? { lsVersion: data.lsVersion } : {}),
            csrfToken,
        };
    } catch {
        return null;
    }
}

/**
 * Reads the hub discovery file for an `agy --hub` process when `--csrf_token`
 * is omitted from the command line (Antigravity IDE / agy 1.5.8+).
 */
export function readHubDiscoveryForProcess(
    commandLine: string,
    pid: number,
    deps: HubDiscoveryDeps = defaultHubDiscoveryDeps,
): HubDiscoveryInfo | null {
    const appDataDir = extractCliArgument(commandLine, "app_data_dir")?.toLowerCase();
    if (!appDataDir || !ANTIGRAVITY_APP_DATA_VALUES.has(appDataDir)) {
        return null;
    }

    const hubPortRaw = extractCliArgument(commandLine, "hub-port");
    const hubPort = hubPortRaw ? parseInt(hubPortRaw, 10) : 0;
    const isHubProcess = hubPort > 0 || /(?:^|\s)--hub(?=\s|$)/i.test(commandLine);
    if (!isHubProcess) {
        return null;
    }

    for (const { root } of deps.getGeminiRoots()) {
        const daemonDir = path.join(root, appDataDir, "daemon");

        if (hubPort > 0) {
            const directPath = path.join(daemonDir, `hub_${hubPort}.json`);
            if (deps.exists(directPath)) {
                try {
                    const parsed = parseHubDiscoveryJson(deps.readFile(directPath), pid);
                    if (parsed) {
                        return parsed;
                    }
                } catch {
                    // Ignore unreadable discovery file and continue searching
                }
            }
        }

        if (pid > 0) {
            let files: string[];
            try {
                files = deps.readdir(daemonDir).filter((name) => HUB_DISCOVERY_FILE_PATTERN.test(name));
            } catch {
                continue;
            }
            for (const file of files) {
                try {
                    const parsed = parseHubDiscoveryJson(deps.readFile(path.join(daemonDir, file)), pid);
                    if (parsed && parsed.pid === pid) {
                        return parsed;
                    }
                } catch {
                    // Ignore unreadable/corrupt discovery file
                }
            }
        }
    }

    return null;
}

/**
 * Lists all valid hub discovery entries across local (and WSL Windows) `.gemini`
 * daemon directories, sorted newest first. Stale local PIDs are skipped.
 */
export function listAllHubDiscoveryEntries(
    deps: HubDiscoveryDeps = defaultHubDiscoveryDeps,
): HubDiscoveryCandidate[] {
    const entries: HubDiscoveryCandidate[] = [];

    for (const { root, local } of deps.getGeminiRoots()) {
        for (const appDataDir of ANTIGRAVITY_APP_DATA_VALUES) {
            const daemonDir = path.join(root, appDataDir, "daemon");

            let files: string[];
            try {
                files = deps.readdir(daemonDir).filter((name) => HUB_DISCOVERY_FILE_PATTERN.test(name));
            } catch {
                continue;
            }

            for (const file of files) {
                const filePath = path.join(daemonDir, file);
                try {
                    const parsed = parseHubDiscoveryJson(deps.readFile(filePath));
                    if (!parsed) continue;
                    if (parsed.httpsPort === undefined && parsed.httpPort === undefined) continue;
                    if (local && parsed.pid && !deps.isPidAlive(parsed.pid)) continue;

                    let mtimeMs = 0;
                    try {
                        mtimeMs = deps.statMtimeMs(filePath);
                    } catch {
                        mtimeMs = 0;
                    }
                    entries.push({ ...parsed, local, mtimeMs });
                } catch {
                    // Ignore unreadable/corrupt discovery file
                }
            }
        }
    }

    return entries.sort((a, b) => b.mtimeMs - a.mtimeMs);
}

/**
 * Parses a candidate Antigravity backend command line into `ProcessInfo`.
 * Supports both legacy `--csrf_token` args and `agy --hub` discovery files.
 */
export function parseAntigravityProcess(
    commandLine: string,
    pid: number,
    ppid: number,
    deps: HubDiscoveryDeps = defaultHubDiscoveryDeps,
): ProcessInfo | null {
    if (!pid || !hasAntigravityAppDataDir(commandLine)) {
        return null;
    }

    const portMatch = commandLine.match(SERVER_PORT_PATTERN);
    let csrfToken = extractCliArgument(commandLine, "csrf_token");
    let httpsPort: number | undefined;
    let hubHttpPort: number | undefined;

    if (!csrfToken) {
        const hub = readHubDiscoveryForProcess(commandLine, pid, deps);
        if (!hub) {
            return null;
        }
        csrfToken = hub.csrfToken;
        httpsPort = hub.httpsPort;
        hubHttpPort = hub.httpPort;
    }

    const wsArg = extractCliArgument(commandLine, "workspace_id");
    const addDirArg = !wsArg ? extractCliArgument(commandLine, "add-dir") : undefined;
    const workspaceId = wsArg || (addDirArg ? normalizePathToWorkspaceId(addDirArg) : undefined);
    const extensionPort = portMatch?.[1]
        ? parseInt(portMatch[1], 10)
        : (hubHttpPort ?? 0);

    return {
        pid,
        ppid,
        extensionPort,
        ...(httpsPort !== undefined ? { httpsPort } : {}),
        csrfToken,
        ...(workspaceId ? { workspaceId } : {}),
    };
}

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
