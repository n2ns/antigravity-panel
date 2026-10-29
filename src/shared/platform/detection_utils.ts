import { testPort as httpTestPort } from "../utils/http_client";

/**
 * Common utilities extracted from ProcessFinder to avoid redundancy.
 * Strictly using the original logic as requested.
 */

const ANTIGRAVITY_APP_DATA_VALUES = new Set([
    "antigravity",
    "antigravity-ide",
]);

/**
 * Checks the product identity marker emitted by supported Antigravity
 * language-server processes.
 */
export function hasAntigravityAppDataDir(commandLine: string): boolean {
    const match = commandLine.match(
        /(?:^|\s)--app_data_dir(?:=|\s+)(?:"([^"]+)"|'([^']+)'|([^\s]+))(?=\s|$)/i,
    );
    const value = match?.[1] ?? match?.[2] ?? match?.[3];

    return value !== undefined
        && ANTIGRAVITY_APP_DATA_VALUES.has(value.toLowerCase());
}

/**
 * Command-line arguments that advertise the HTTP port of the backend.
 *
 * Antigravity 1.10+ runs an `agy --hub` process that reports its port as
 * `--hub-port`; older builds ran `language_server_*` with
 * `--extension_server_port`.
 */
const SERVER_PORT_ARGUMENTS = ["hub-port", "extension_server_port"] as const;

/** CSRF token shared by both backend generations */
export function extractCsrfToken(commandLine: string): string | null {
    const match = commandLine.match(
        /--csrf_token(?:=|\s+)(?:"([^"]*)"|'([^']*)'|([^\s]+))/i,
    );
    const token = match?.[1] ?? match?.[2] ?? match?.[3];
    return token ? token : null;
}

/** HTTP port advertised on the command line, 0 when the backend does not pass one */
export function extractServerPort(commandLine: string): number {
    for (const argument of SERVER_PORT_ARGUMENTS) {
        const match = commandLine.match(
            new RegExp(`--${argument}(?:=|\\s+)(\\d+)`, "i"),
        );
        if (!match?.[1]) continue;
        const port = Number.parseInt(match[1], 10);
        if (port > 0 && port <= 65535) return port;
    }
    return 0;
}

/** Legacy workspace identifier (`--workspace_id`) */
export function extractWorkspaceId(commandLine: string): string | undefined {
    const match = commandLine.match(
        /--workspace_id(?:=|\s+)(?:"([^"]*)"|'([^']*)'|([^\s]+))/i,
    );
    return match?.[1] ?? match?.[2] ?? match?.[3] ?? undefined;
}

/**
 * Workspace folders passed with `--add-dir` (agy hub). An empty window passes
 * none, and a multi-root window repeats the argument.
 */
export function extractWorkspaceDirs(commandLine: string): string[] {
    const dirs: string[] = [];
    for (const match of commandLine.matchAll(
        /--add-dir(?:=|\s+)(?:"([^"]*)"|'([^']*)'|([^\s]+))/gi,
    )) {
        const dir = match[1] ?? match[2] ?? match[3];
        if (dir) dirs.push(dir);
    }
    return dirs;
}

export interface ServerCommandLineInfo {
    /** Port from `--hub-port` / `--extension_server_port`, 0 when absent */
    serverPort: number;
    csrfToken: string;
    workspaceId?: string;
    /** Folders from `--add-dir`, empty for the legacy backend */
    workspaceDirs: string[];
}

/**
 * Parses the command line of an Antigravity backend process.
 *
 * Both generations are accepted: `agy --hub` (1.10+, `--hub-port`) and the
 * legacy `language_server_*` (`--extension_server_port`). The port argument is
 * optional in both, because some builds rely on the listening-port scan.
 */
export function parseServerCommandLine(
    commandLine: string,
): ServerCommandLineInfo | null {
    const csrfToken = extractCsrfToken(commandLine);
    if (!csrfToken) return null;
    if (!hasAntigravityAppDataDir(commandLine)) return null;

    const workspaceId = extractWorkspaceId(commandLine);
    return {
        serverPort: extractServerPort(commandLine),
        csrfToken,
        ...(workspaceId ? { workspaceId } : {}),
        workspaceDirs: extractWorkspaceDirs(commandLine),
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
