// paths.ts: Path utility functions related to Antigravity.

import * as os from "os";
import * as path from "path";
import { GEMINI_ROOT_DIR_NAME, ANTIGRAVITY_DIR_NAME } from "./constants";

export function getGeminiRootDir(): string {
  return path.join(os.homedir(), GEMINI_ROOT_DIR_NAME);
}

export function getGeminiBaseDir(): string {
  return path.join(getGeminiRootDir(), ANTIGRAVITY_DIR_NAME);
}

export function getGlobalRulesPath(): string {
  return path.join(getGeminiRootDir(), "GEMINI.md");
}

export function getBrainDir(): string {
  return path.join(getGeminiBaseDir(), "brain");
}

export function getConversationsDir(): string {
  return path.join(getGeminiBaseDir(), "conversations");
}

export function getMcpConfigPath(): string {
  return path.join(getGeminiBaseDir(), "mcp_config.json");
}

export function getBrowserAllowlistPath(): string {
  return path.join(getGeminiBaseDir(), "browserAllowlist.txt");
}

export function getCodeTrackerActiveDir(): string {
  return path.join(getGeminiBaseDir(), "code_tracker", "active");
}

export function getCodeContextsDir(): string {
  return path.join(getGeminiBaseDir(), "code_tracker", "active");
}
