/**
 * Common type definitions
 * Centralized management of all core interfaces to avoid type scattering
 */

// ==================== Quota Related ====================

/**
 * Quota information for a single model
 */
export interface ModelQuotaInfo {
  /** Model display name */
  label: string;
  /** Model ID */
  modelId: string;
  /** Remaining quota percentage (0-100) */
  remainingPercentage: number;
  /** Whether quota is exhausted */
  isExhausted: boolean;
  /** Reset time */
  resetTime: Date;
  /** Time until reset description */
  timeUntilReset: string;
}

/**
 * Prompt Credits information
 */
export interface PromptCreditsInfo {
  /** Available credits */
  available: number;
  /** Monthly total credits */
  monthly: number;
  /** Remaining percentage */
  remainingPercentage: number;
}

/**
 * Quota snapshot (quota state at a specific moment)
 */
export interface QuotaSnapshot {
  /** Snapshot timestamp */
  timestamp: Date;
  /** Prompt Credits information */
  promptCredits?: PromptCreditsInfo;
  /** Quota information for each model */
  models: ModelQuotaInfo[];
}

// ==================== Process Detection Related ====================

/**
 * Language Server connection information
 */
export interface LanguageServerInfo {
  /** API port (HTTPS) */
  port: number;
  /** CSRF authentication token */
  csrfToken: string;
}

/**
 * Process detection options
 */
export interface DetectOptions {
  /** Maximum number of attempts (default 3) */
  attempts?: number;
  /** Base delay time in ms (default 1500) */
  baseDelay?: number;
  /** Whether to enable verbose logging */
  verbose?: boolean;
}

/**
 * Process information parsed from command line
 */
export interface ProcessInfo {
  /** Process ID */
  pid: number;
  /** HTTP extension port */
  extensionPort: number;
  /** CSRF authentication token */
  csrfToken: string;
}

/**
 * Platform strategy interface
 */
export interface PlatformStrategy {
  /** Get process list command */
  getProcessListCommand(processName: string): string;
  /** Parse process information */
  parseProcessInfo(stdout: string): ProcessInfo | null;
  /** Get port list command */
  getPortListCommand(pid: number): string;
  /** Parse listening ports */
  parseListeningPorts(stdout: string): number[];
}

// ==================== Cache Related ====================

/**
 * Brain task information
 */
export interface BrainTask {
  /** Task ID */
  id: string;
  /** Task label/title */
  label: string;
  /** Task directory path */
  path: string;
  /** Task size (bytes) */
  size: number;
  /** File count */
  fileCount: number;
  /** Creation timestamp (ms) */
  createdAt: number;
}

/**
 * Cache information summary
 */
export interface CacheInfo {
  /** brain directory size */
  brainSize: number;
  /** conversations directory size */
  conversationsSize: number;
  /** Total size */
  totalSize: number;
  /** brain task count */
  brainCount: number;
  /** Conversation file count */
  conversationsCount: number;
  /** brain task list */
  brainTasks: BrainTask[];
}

// ==================== Configuration Related ====================

/**
 * Extension configuration
 */
export interface GagpConfig {
  /** Whether to show cache size */
  showCacheSize: boolean;
  /** Whether to show quota */
  showQuota: boolean;
  /** Polling interval (seconds), minimum value 60 */
  pollingInterval: number;
  /** Cache warning threshold (MB) */
  cacheWarningThreshold: number;
  /** Quota warning threshold (%) */
  quotaWarningThreshold: number;
  /** Quota critical threshold (%) */
  quotaCriticalThreshold: number;
  /** Whether to auto-clean cache */
  autoCleanCache: boolean;
  /** Quota display style */
  quotaDisplayStyle: "percentage" | "resetTime" | "used" | "remaining";
  /** Quota visualization mode */
  visualizationMode: "groups" | "models";
  /** History chart display time range (minutes), default 60 */
  historyDisplayMinutes: number;
}

// ==================== Callback Types ====================

/**
 * Quota update callback
 */
export type QuotaUpdateCallback = (snapshot: QuotaSnapshot) => void;

/**
 * Error callback
 */
export type ErrorCallback = (error: Error) => void;
