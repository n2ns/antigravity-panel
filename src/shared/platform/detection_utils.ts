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
