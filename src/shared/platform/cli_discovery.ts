import * as fs from "fs";
import * as path from "path";
import { getCliBaseDir } from "../utils/paths";
import { defaultHubDiscoveryDeps, verifyServerGateway } from "./detection_utils";
import type { LanguageServerInfo } from "../utils/types";

/**
 * Discovery of the Language Server embedded in the standalone `agy` CLI.
 *
 * The CLI passes no backend arguments on its command line and writes no hub
 * discovery file. It reads its CSRF token from ANTIGRAVITY_SERVER_CSRF_TOKEN
 * at startup (otherwise it generates one in memory), and logs its PID and
 * random ports at the top of `~/.gemini/antigravity-cli/log/cli-*.log`.
 * The extension injects its own token into integrated terminals, so a CLI
 * started there accepts it.
 */

/** Environment variable the agy CLI reads its local server CSRF token from. */
export const AGY_CLI_CSRF_ENV = "ANTIGRAVITY_SERVER_CSRF_TOKEN";

const CLI_LOG_FILE_PATTERN = /^cli-.*\.log$/;
const CLI_LOG_HEAD_BYTES = 8192;

export interface CliServerCandidate {
    pid: number;
    httpsPort?: number;
    httpPort?: number;
}

export interface CliDiscoveryDeps {
    logDir: string;
    readdir: (dirPath: string) => string[];
    statMtimeMs: (filePath: string) => number;
    readHead: (filePath: string, bytes: number) => string;
    isPidAlive: (pid: number) => boolean;
    probe: (port: number, csrfToken: string) => Promise<{ success: boolean; protocol: "https" | "http" }>;
}

function readHead(filePath: string, bytes: number): string {
    const fd = fs.openSync(filePath, "r");
    try {
        const buffer = Buffer.alloc(bytes);
        const read = fs.readSync(fd, buffer, 0, bytes, 0);
        return buffer.toString("utf8", 0, read);
    } finally {
        fs.closeSync(fd);
    }
}

export const defaultCliDiscoveryDeps: CliDiscoveryDeps = {
    logDir: path.join(getCliBaseDir(), "log"),
    readdir: (dirPath) => fs.readdirSync(dirPath),
    statMtimeMs: (filePath) => fs.statSync(filePath).mtimeMs,
    readHead,
    isPidAlive: defaultHubDiscoveryDeps.isPidAlive,
    probe: (port, csrfToken) => verifyServerGateway("127.0.0.1", port, csrfToken),
};

/**
 * Parses the startup lines of a CLI log:
 *   `Starting language server process with pid 59116`
 *   `Language server listening on random port at 45619 for HTTPS (gRPC)`
 *   `Language server listening on random port at 44881 for HTTP`
 */
export function parseCliLogHead(text: string): CliServerCandidate | null {
    const pidMatch = text.match(/Starting language server process with pid (\d+)/);
    if (!pidMatch) {
        return null;
    }
    const httpsMatch = text.match(/listening on random port at (\d+) for HTTPS\b/);
    const httpMatch = text.match(/listening on random port at (\d+) for HTTP\s*$/m);
    const httpsPort = httpsMatch ? parseInt(httpsMatch[1], 10) : undefined;
    const httpPort = httpMatch ? parseInt(httpMatch[1], 10) : undefined;
    if (!httpsPort && !httpPort) {
        return null;
    }
    return {
        pid: parseInt(pidMatch[1], 10),
        ...(httpsPort ? { httpsPort } : {}),
        ...(httpPort ? { httpPort } : {}),
    };
}

/**
 * Lists running CLI servers from all CLI logs, newest first. Every log is read, not
 * only the newest ones: short commands such as `agy -p` or `agy models` write a log
 * each and would push an idle interactive session out of a fixed window.
 */
export function listCliServerCandidates(
    deps: CliDiscoveryDeps = defaultCliDiscoveryDeps,
): CliServerCandidate[] {
    let files: string[];
    try {
        files = deps.readdir(deps.logDir).filter((name) => CLI_LOG_FILE_PATTERN.test(name));
    } catch {
        return [];
    }

    const logs: Array<{ filePath: string; mtimeMs: number }> = [];
    for (const name of files) {
        const filePath = path.join(deps.logDir, name);
        try {
            logs.push({ filePath, mtimeMs: deps.statMtimeMs(filePath) });
        } catch {
            // Log removed between readdir and stat
        }
    }
    logs.sort((a, b) => b.mtimeMs - a.mtimeMs);

    const candidates: CliServerCandidate[] = [];
    for (const { filePath } of logs) {
        try {
            const candidate = parseCliLogHead(deps.readHead(filePath, CLI_LOG_HEAD_BYTES));
            if (candidate && deps.isPidAlive(candidate.pid)) {
                candidates.push(candidate);
            }
        } catch {
            // Unreadable log
        }
    }
    return candidates;
}

export interface CliServerConnection extends LanguageServerInfo {
    protocol: "https" | "http";
}

/**
 * Connects to the newest running CLI server that accepts `csrfToken`,
 * trying its HTTPS port before its HTTP port.
 */
export async function discoverCliServer(
    csrfToken: string,
    deps: CliDiscoveryDeps = defaultCliDiscoveryDeps,
): Promise<CliServerConnection | null> {
    for (const candidate of listCliServerCandidates(deps)) {
        for (const port of [candidate.httpsPort, candidate.httpPort]) {
            if (!port) continue;
            const result = await deps.probe(port, csrfToken);
            if (result.success) {
                return { port, csrfToken, protocol: result.protocol };
            }
        }
    }
    return null;
}
