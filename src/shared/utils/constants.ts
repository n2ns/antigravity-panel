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

/**
 * Quota groups that share one backend pool in Antigravity (Anthropic + OpenAI OSS rows).
 * Aggregated remaining % and reset time use the minimum across all models in this pool.
 */
export const SHARED_QUOTA_POOL_GROUP_IDS = ['claude', 'gpt'] as const;

// ==================== Path Related ====================

/** Gemini root directory name (relative to user home) */
export const GEMINI_ROOT_DIR_NAME = ".gemini";

/** Antigravity subdirectory name */
export const ANTIGRAVITY_DIR_NAME = "antigravity";

