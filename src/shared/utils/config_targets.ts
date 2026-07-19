// config_targets.ts: Environment-aware resolution of the Antigravity config files
// (global rules / MCP config / browser allowlist) that the sidebar buttons open.
//
// In a WSL remote session the config is split across the two OS homes:
// the agent backend (language server, MCP servers, brain) runs inside WSL and
// reads ~/.gemini there, while the browser subsystem runs on the Windows host
// and reads its allowlist from the Windows %USERPROFILE%\.gemini. Opening a
// single os.homedir()-based path is therefore wrong on whichever side the
// extension host happens to run.

import * as fs from "fs";
import * as path from "path";
import { isWsl } from "./wsl";
import { getGeminiRootDir, getMcpConfigPath, getBrowserAllowlistPath } from "./paths";
import {
    GEMINI_ROOT_DIR_NAME,
    CONFIG_DIR_NAME,
    MCP_CONFIG_FILE_NAME,
    BROWSER_ALLOWLIST_FILE_NAME,
    LEGACY_RULES_FILE_NAME,
    AGENT_RULES_FILE_NAME
} from "./constants";

export interface ConfigTargets {
    rules: string;
    mcp: string;
    allowlist: string;
}

/** Subset of vscode.env / workspace info needed for detection (kept vscode-free for tests). */
export interface RemoteEnv {
    /** vscode.env.remoteName, e.g. "wsl", "ssh-remote", or undefined for local windows. */
    remoteName?: string;
    /** Authority of a workspace folder URI, e.g. "wsl+Ubuntu" when running on the UI host. */
    remoteAuthority?: string;
}

/** Injectable fs surface for testing. */
export interface FsDeps {
    readdir: (dir: string) => string[];
    exists: (p: string) => boolean;
    readFile: (p: string) => string;
}

const defaultFsDeps: FsDeps = {
    readdir: (dir) => fs.readdirSync(dir),
    exists: (p) => fs.existsSync(p),
    readFile: (p) => fs.readFileSync(p, "utf8"),
};

type PathJoin = (...segments: string[]) => string;

/** Windows profile folders that can never hold a real user's .gemini. */
const NON_USER_PROFILES = new Set(["all users", "default", "default user", "public", "desktop.ini"]);

/**
 * Picks the .gemini root to use among candidate user homes. `preferredMarker`
 * are path segments (relative to the root) identifying the file the caller is
 * after — a root already holding it beats one that merely exists, so on
 * multi-user machines we target the profile Antigravity actually writes to.
 */
function pickGeminiRoot(candidates: string[], join: PathJoin, deps: FsDeps, preferredMarker: string[]): string | null {
    const existing = candidates.filter((c) => deps.exists(c));
    if (existing.length === 0) {
        return null;
    }
    const withMarker = existing.find((c) => deps.exists(join(c, ...preferredMarker)));
    if (withMarker) {
        return withMarker;
    }
    const withConfig = existing.find((c) => deps.exists(join(c, CONFIG_DIR_NAME)));
    return withConfig ?? existing[0];
}

/**
 * Reads the Windows drive automount root from /etc/wsl.conf ([automount] root),
 * defaulting to /mnt when the file, section, or key is absent. Only the
 * [automount] section is consulted — a `root` key under any other section
 * (or before the first section header) is ignored.
 */
export function getWslAutomountRoot(deps: FsDeps = defaultFsDeps): string {
    try {
        const conf = deps.readFile("/etc/wsl.conf");
        const automountSection = conf
            .split(/^[ \t]*\[/m)
            .find((section) => section.startsWith("automount]"));
        const match = automountSection?.match(/^\s*root\s*=\s*(?:"([^"]+)"|([^\s#]+))/m);
        if (match) {
            // "root = /" mounts drives at the filesystem root — keep the slash
            const root = (match[1] ?? match[2]).replace(/\/+$/, "") || "/";
            if (root.startsWith("/")) {
                return root;
            }
        }
    } catch {
        // no wsl.conf — default automount root
    }
    return "/mnt";
}

/**
 * From inside WSL, locates the Windows-side ~/.gemini by scanning the mounted
 * drives under the automount root for a Users directory. The system drive is
 * almost always C, so it is probed first. Returns null when nothing is found.
 */
export function findWindowsGeminiRootFromWsl(deps: FsDeps = defaultFsDeps): string | null {
    const mountRoot = getWslAutomountRoot(deps);
    let drives: string[];
    try {
        drives = deps.readdir(mountRoot).filter((name) => /^[a-z]$/i.test(name));
    } catch {
        return null;
    }
    drives = [
        ...drives.filter((d) => d.toLowerCase() === "c"),
        ...drives.filter((d) => d.toLowerCase() !== "c"),
    ];
    for (const drive of drives) {
        const usersDir = path.posix.join(mountRoot, drive, "Users");
        try {
            const candidates = deps
                .readdir(usersDir)
                .filter((name) => !NON_USER_PROFILES.has(name.toLowerCase()))
                .map((name) => path.posix.join(usersDir, name, GEMINI_ROOT_DIR_NAME));
            const root = pickGeminiRoot(candidates, path.posix.join, deps, [CONFIG_DIR_NAME, BROWSER_ALLOWLIST_FILE_NAME]);
            if (root) {
                return root;
            }
        } catch {
            // drive without a Users directory — try the next one
        }
    }
    return null;
}

/** Parses the WSL distro name out of a remote authority like "wsl+Ubuntu-22.04". */
export function parseWslDistro(remoteAuthority?: string): string | null {
    if (!remoteAuthority || !remoteAuthority.toLowerCase().startsWith("wsl+")) {
        return null;
    }
    try {
        return decodeURIComponent(remoteAuthority.slice("wsl+".length)) || null;
    } catch {
        return null;
    }
}

/**
 * From the Windows UI host of a WSL window, locates the WSL-side ~/.gemini
 * through the distro's UNC share. Probes \\wsl.localhost (Windows 11) first,
 * then the legacy \\wsl$ share (the only one exposed by older Windows 10 WSL
 * builds). Both names map to the same filesystem, so the legacy share is only
 * tried when the modern one is unreachable — not when it is merely empty.
 */
export function findWslGeminiRootFromWindows(distro: string, deps: FsDeps = defaultFsDeps): string | null {
    for (const share of [`\\\\wsl.localhost\\${distro}`, `\\\\wsl$\\${distro}`]) {
        const homeBase = `${share}\\home`;
        let names: string[];
        try {
            names = deps.readdir(homeBase);
        } catch {
            continue;
        }
        const candidates = names.map((name) => path.win32.join(homeBase, name, GEMINI_ROOT_DIR_NAME));
        // root's home is not under /home
        candidates.push(path.win32.join(share, "root", GEMINI_ROOT_DIR_NAME));
        return pickGeminiRoot(candidates, path.win32.join, deps, [CONFIG_DIR_NAME, MCP_CONFIG_FILE_NAME]);
    }
    return null;
}

/**
 * Picks the global-rules file inside a .gemini root, newest convention first:
 * config/AGENTS.md (Antigravity 2.x "Global Customizations Root"),
 * GEMINI.md (legacy, still read with highest priority),
 * AGENTS.md (v1.20.3 cross-tool location).
 * When none exist yet, falls back to legacy GEMINI.md — the only path every
 * Antigravity version reads.
 */
export function resolveRulesFile(geminiRoot: string, join: PathJoin, deps: FsDeps = defaultFsDeps): string {
    const candidates = [
        join(geminiRoot, CONFIG_DIR_NAME, AGENT_RULES_FILE_NAME),
        join(geminiRoot, LEGACY_RULES_FILE_NAME),
        join(geminiRoot, AGENT_RULES_FILE_NAME),
    ];
    return candidates.find((c) => deps.exists(c)) ?? candidates[1];
}

/**
 * Resolves which rules / MCP / allowlist files the sidebar buttons should open
 * for the current environment. Falls back to the plain os.homedir()-based paths
 * whenever the counterpart side cannot be located.
 */
export function resolveConfigTargets(
    env: RemoteEnv,
    deps: FsDeps = defaultFsDeps,
    platform: NodeJS.Platform = process.platform,
    isWslFn: () => boolean = isWsl
): ConfigTargets {
    const targets: ConfigTargets = {
        rules: resolveRulesFile(getGeminiRootDir(), path.join, deps),
        mcp: getMcpConfigPath(),
        allowlist: getBrowserAllowlistPath(),
    };

    // Extension host inside WSL: rules/MCP are read by the agent from the WSL
    // home (already what the defaults resolve to), but the allowlist belongs to
    // the browser on the Windows host.
    if (platform === "linux" && isWslFn()) {
        const winRoot = findWindowsGeminiRootFromWsl(deps);
        if (winRoot) {
            targets.allowlist = path.posix.join(winRoot, CONFIG_DIR_NAME, BROWSER_ALLOWLIST_FILE_NAME);
        }
        return targets;
    }

    // Extension on the Windows UI host of a WSL remote window: the agent backend
    // runs inside WSL, so rules/MCP must target the WSL home; the allowlist
    // stays on the Windows side (defaults are already correct for it).
    if (platform === "win32" && env.remoteName === "wsl") {
        const distro = parseWslDistro(env.remoteAuthority);
        const wslRoot = distro ? findWslGeminiRootFromWindows(distro, deps) : null;
        if (wslRoot) {
            targets.rules = resolveRulesFile(wslRoot, path.win32.join, deps);
            targets.mcp = path.win32.join(wslRoot, CONFIG_DIR_NAME, MCP_CONFIG_FILE_NAME);
        }
        return targets;
    }

    return targets;
}
