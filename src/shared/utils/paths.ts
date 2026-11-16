// paths.ts: Path utility functions related to Antigravity.

import * as os from "os";
import * as path from "path";
import {
  GEMINI_ROOT_DIR_NAME,
  ANTIGRAVITY_DIR_NAME,
  ANTIGRAVITY_CLI_DIR_NAME,
  CONFIG_DIR_NAME,
  MCP_CONFIG_FILE_NAME,
  BROWSER_ALLOWLIST_FILE_NAME
} from "./constants";
import { isAntigravityApp } from "./platform";

export function getGeminiRootDir(): string {
  return path.join(os.homedir(), GEMINI_ROOT_DIR_NAME);
}

export function getGeminiBaseDir(): string {
  return path.join(getGeminiRootDir(), ANTIGRAVITY_DIR_NAME);
}

/** App data directory of the standalone agy CLI */
export function getCliBaseDir(): string {
  return path.join(getGeminiRootDir(), ANTIGRAVITY_CLI_DIR_NAME);
}

/**
 * App data directory whose caches the cache view manages: the Antigravity IDE's own
 * inside Antigravity, the agy CLI's in other editors (e.g. VS Code), where the panel
 * connects to an agy CLI session.
 */
export function getCacheBaseDir(appName: string): string {
  return isAntigravityApp(appName) ? getGeminiBaseDir() : getCliBaseDir();
}

export function getBrainDir(baseDir: string = getGeminiBaseDir()): string {
  return path.join(baseDir, "brain");
}

export function getConversationsDir(baseDir: string = getGeminiBaseDir()): string {
  return path.join(baseDir, "conversations");
}

export function getMcpConfigPath(): string {
  return path.join(getGeminiRootDir(), CONFIG_DIR_NAME, MCP_CONFIG_FILE_NAME);
}

export function getBrowserAllowlistPath(): string {
  return path.join(getGeminiRootDir(), CONFIG_DIR_NAME, BROWSER_ALLOWLIST_FILE_NAME);
}

export function getCodeContextsDir(baseDir: string = getGeminiBaseDir()): string {
  return getConversationsDir(baseDir);
}
