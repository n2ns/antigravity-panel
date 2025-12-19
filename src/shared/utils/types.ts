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
  /** Parent Process ID (Optional, for ancestry matching) */
  ppid?: number;
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
  parseProcessInfo(stdout: string): ProcessInfo[] | null;
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
 * Code context information
 */
export interface CodeContext {
  id: string;
  name: string;
  size: number;
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
  /** code context list */
  codeContexts: CodeContext[];
}

// ==================== Configuration Related ====================

/**
 * Extension configuration
 */
export interface TfaConfig {
  // ===== 1. Dashboard Settings =====
  /** Quota visualization style in sidebar */
  "1_dashboard.10_gaugeStyle": "semi-arc" | "classic-donut";
  /** Quota visualization mode */
  "1_dashboard.20_viewMode": "groups" | "models";
  /** History chart display time range (minutes), default 90 */
  "1_dashboard.30_historyRange": number;
  /** Polling interval (seconds), minimum value 60 */
  "1_dashboard.40_refreshRate": number;
  /** Whether to show GPT quota (GPT shares quota with Claude) */
  "1_dashboard.50_includeSecondaryModels": boolean;

  // ===== 2. Status Bar Settings =====
  /** Whether to show quota in status bar */
  "2_status.10_showQuota": boolean;
  /** Whether to show cache size in status bar */
  "2_status.20_showCache": boolean;
  /** Status bar display format */
  "2_status.30_displayFormat": "percentage" | "resetTime" | "used" | "remaining";
  /** Status bar warning threshold (%) */
  "2_status.40_warningThreshold": number;
  /** Status bar critical threshold (%) */
  "2_status.50_criticalThreshold": number;

  // ===== 3. System & Maintenance Settings =====
  /** Cache warning threshold (MB) */
  "3_system.10_cacheWarningSize": number;
  /** Whether to auto-clean cache */
  "3_system.20_autoClean": boolean;
  /** Hide empty folders in tree views */
  "3_system.30_hideEmptyFolders": boolean;
  /** Cache check interval (seconds), minimum 30 */
  "3_system.40_scanInterval": number;
  /** Custom server hostname for quota metrics (advanced users only) */
  "3_system.50_serverHost": string;
  /** Custom API path for quota metrics (advanced users only) */
  "3_system.60_apiPath": string;
  /** Whether to enable debug mode */
  "3_system.99_debugMode": boolean;
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
