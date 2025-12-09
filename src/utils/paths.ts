// paths.ts: Path utility functions related to Antigravity.

import * as os from "os";
import * as path from "path";

export function getGeminiRootDir(): string {
  return path.join(os.homedir(), ".gemini");
}

export function getGeminiBaseDir(): string {
  return path.join(getGeminiRootDir(), "antigravity");
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

