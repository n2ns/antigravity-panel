/**
 * Global constants
 */

// ==================== Quota Related ====================

/**
 * Fallback window (hours) for sidebar chart runway math only when the server does not
 * provide a usable per-model reset time. Real cycles are defined by the API (rolling hours,
 * multi-day, weekly, etc.).
 */
export const QUOTA_RESET_HOURS_FALLBACK = 24;

// ==================== Path Related ====================

/** Gemini root directory name (relative to user home) */
export const GEMINI_ROOT_DIR_NAME = ".gemini";

/** Antigravity subdirectory name */
export const ANTIGRAVITY_DIR_NAME = "antigravity-ide";

/** Config subdirectory under the Gemini root (the 2.x "Global Customizations Root") */
export const CONFIG_DIR_NAME = "config";

/** MCP server configuration filename */
export const MCP_CONFIG_FILE_NAME = "mcp_config.json";

/** Browser allowlist filename */
export const BROWSER_ALLOWLIST_FILE_NAME = "browserAllowlist.txt";

/** Legacy global rules filename (read by every Antigravity version) */
export const LEGACY_RULES_FILE_NAME = "GEMINI.md";

/** Cross-tool rules filename (v1.20.3+, and inside CONFIG_DIR_NAME since 2.x) */
export const AGENT_RULES_FILE_NAME = "AGENTS.md";
