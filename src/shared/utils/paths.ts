// paths.ts: Path utility functions related to Antigravity.

import * as os from "os";
import * as path from "path";
import {
  GEMINI_ROOT_DIR_NAME,
  ANTIGRAVITY_DIR_NAME,
  CONFIG_DIR_NAME,
  MCP_CONFIG_FILE_NAME,
  BROWSER_ALLOWLIST_FILE_NAME
} from "./constants";

export function getGeminiRootDir(): string {
  return path.join(os.homedir(), GEMINI_ROOT_DIR_NAME);
}

export function getGeminiBaseDir(): string {
  return path.join(getGeminiRootDir(), ANTIGRAVITY_DIR_NAME);
}

export function getBrainDir(): string {
  return path.join(getGeminiBaseDir(), "brain");
}

export function getConversationsDir(): string {
  return path.join(getGeminiBaseDir(), "conversations");
}

export function getMcpConfigPath(): string {
  return path.join(getGeminiRootDir(), CONFIG_DIR_NAME, MCP_CONFIG_FILE_NAME);
}

export function getBrowserAllowlistPath(): string {
  return path.join(getGeminiRootDir(), CONFIG_DIR_NAME, BROWSER_ALLOWLIST_FILE_NAME);
}

export function getCodeContextsDir(): string {
  return getConversationsDir();
}
