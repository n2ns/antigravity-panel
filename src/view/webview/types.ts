/**
 * Webview public type definitions
 */

// ==================== Quota Types ====================

export interface QuotaDisplayItem {
  label: string;
  remaining: number;
  resetTime: string;
  /** Absolute reset timestamp (epoch ms); absent when unknown or server value was invalid */
  resetDate?: number;
  hasData: boolean;
  themeColor: string;
  /** Official weekly limit of the pool (pool view only) */
  weekly?: WeeklyLimitData;
}

export interface WeeklyLimitData {
  remaining: number;
  resetTime: string;
  /** Absolute reset timestamp (epoch ms); absent when unknown or server value was invalid */
  resetDate?: number;
}

// ==================== Chart Types ====================

export interface BucketItem {
  groupId: string;
  usage: number;
  color: string;
}

export interface UsageBucket {
  endTime: number;
  items: BucketItem[];
}

export interface UsageChartData {
  buckets: UsageBucket[];
  /** Display label mapping for each group ID */
  groupLabels?: Record<string, string>;
  displayMinutes: number;
  interval: number;
  /** Prediction data (optional, calculated by ViewModel) */
  prediction?: {
    /** Usage rate (pp/hour - percentage points consumed per hour) */
    usageRate: number;
    /** Estimated duration description (e.g. "~38h" or "Stable") */
    runway: string;
  };
}

// ==================== Tree Types ====================

/** File item */
export interface FileItem {
  name: string;
  path: string;
}

/** Folder item (task/context) */
export interface FolderItem {
  id: string;
  label: string;
  size: string;
  sizeBytes?: number;
  lastModified?: number;
  files: FileItem[];
  expanded?: boolean;
}

/** Tree section state */
export interface TreeSectionState {
  stats: string;
  collapsed: boolean;
  folders: FolderItem[];
  loading?: boolean;
}

// ==================== Message Types ====================

export interface WebviewMessage {
  type: string;
  taskId?: string;
  contextId?: string;
  path?: string;
}

// ==================== User Info Types ====================

/** User info data */
export interface UserInfoData {
  email?: string;
  tier?: string;
}

export interface UserCreditData {
  creditType: string;
  creditAmount: string;
}

/** Token usage data */
export interface TokenUsageData {
  promptCredits?: {
    available: number;
    monthly: number;
    remainingPercentage: number;
  };
  flowCredits?: {
    available: number;
    monthly: number;
    remainingPercentage: number;
  };
  userCredits?: UserCreditData[];
  formatted: {
    promptAvailable: string;
    promptMonthly: string;
    flowAvailable: string;
    flowMonthly: string;
  };
}

/** Connection status for sidebar feedback */
export type ConnectionStatus = 'connected' | 'failed' | 'detecting';

/** Local 7-day usage estimate across all quota pools */
export interface WeeklyUsageData {
  /** Chronological days, today last; each day stacks per-pool consumption */
  days: {
    dayStart: number;
    /** UTC midnight of the extension host's local date; format with timeZone 'UTC' */
    labelDate: number;
    hasData: boolean;
    items: { usage: number; color: string; label: string }[];
  }[];
  /** Sum over all days and pools (percentage points of the short-term pools) */
  total: number;
  /** Previous seven-day sum, or null when that period has no sampled intervals */
  previousTotal: number | null;
}

/** Context window of the current conversation (mirrors ContextViewData in the view model) */
export interface ContextViewData {
  title: string;
  model: string;
  usedTokens: number;
  maxTokens: number;
  percent: number;
  warningThreshold: number;
  compressedAt: number | null;
}

export interface WebviewStateUpdate {
  quotas?: QuotaDisplayItem[];
  chart?: UsageChartData;
  /** null = card disabled or no data yet */
  weekly?: WeeklyUsageData | null;
  /** null = no current conversation or no data */
  context?: ContextViewData | null;
  user?: UserInfoData;
  tokenUsage?: TokenUsageData;
  tasks?: TreeSectionState;
  contexts?: TreeSectionState;
  connectionStatus?: ConnectionStatus;
  failureReason?: 'no_process' | 'no_port' | 'auth_failed' | 'workspace_mismatch' | null;
  gaugeStyle?: string;
  showUserInfoCard?: boolean;
  showCreditsCard?: boolean;
  cache?: {
    formattedBrain: string;
    formattedConversations: string;
  };
  autoAcceptEnabled?: boolean;
  autoAcceptStatus?: AutoAcceptStatus;
  uiScale?: number;
}

/** Auto-Accept runtime status (mirrors AutomationStatus in the model layer) */
export interface AutoAcceptStatus {
  running: boolean;
  commandCount: number | null;
  cdp: 'unknown' | 'unavailable' | 'noTarget' | 'noPanel' | 'connected';
  lastAction: {
    outcome: 'accepted' | 'skipped';
    label: string;
    reason?: 'dangerous' | 'noCommandText' | 'terminalDisabled';
    at: number;
  } | null;
}

// ==================== VS Code API ====================

export interface VsCodeApi {
  postMessage(message: WebviewMessage): void;
  getState(): (Record<string, unknown> & { payload?: WebviewStateUpdate }) | undefined;
  setState(state: Record<string, unknown> & { payload?: WebviewStateUpdate }): void;
}

export interface WindowWithVsCode {
  vscodeApi?: VsCodeApi;
  __TRANSLATIONS__?: Record<string, string>;
  __VERSION__?: string;
}
