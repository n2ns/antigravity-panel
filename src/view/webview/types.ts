/**
 * Webview public type definitions
 */

// ==================== Quota Types ====================

export interface QuotaDisplayItem {
  id: string;
  label: string;
  type: 'group' | 'model';
  remaining: number;
  resetTime: string;
  hasData: boolean;
  themeColor: string;
  subLabel?: string;
}

// ==================== Chart Types ====================

export interface BucketItem {
  groupId: string;
  usage: number;
  color: string;
}

export interface UsageBucket {
  startTime: number;
  endTime: number;
  items: BucketItem[];
}

export interface UsageChartData {
  buckets: UsageBucket[];
  maxUsage: number;
  displayMinutes: number;
  interval: number;
  /** Prediction data (optional, calculated by ViewModel) */
  prediction?: {
    /** Active group ID */
    groupId: string;
    /** Active group display name */
    groupLabel: string;
    /** Usage rate (%/hour) */
    usageRate: number;
    /** Estimated duration description (e.g. "~38h" or "Stable") */
    runway: string;
    /** Current remaining percentage */
    remaining: number;
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
  files: FileItem[];
  expanded?: boolean;
}

/** Tree section state */
export interface TreeSectionState {
  title: string;
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
  folderId?: string;
  path?: string;
}

// ==================== User Info Types ====================

/** User info data */
export interface UserInfoData {
  name?: string;
  email?: string;
  tier?: string;
  tierDescription?: string;
  planName?: string;
  browserEnabled?: boolean;
  knowledgeBaseEnabled?: boolean;
  upgradeUri?: string;
  upgradeText?: string;
}

/** Token usage data */
export interface TokenUsageData {
  promptCredits?: {
    available: number;
    monthly: number;
    usedPercentage: number;
    remainingPercentage: number;
  };
  flowCredits?: {
    available: number;
    monthly: number;
    usedPercentage: number;
    remainingPercentage: number;
  };
  totalAvailable: number;
  totalMonthly: number;
  overallRemainingPercentage: number;
  formatted: {
    promptAvailable: string;
    promptMonthly: string;
    flowAvailable: string;
    flowMonthly: string;
    totalAvailable: string;
    totalMonthly: string;
  };
}

/** Connection status for sidebar feedback */
export type ConnectionStatus = 'detecting' | 'connected' | 'failed';

export interface WebviewStateUpdate {
  quotas?: QuotaDisplayItem[];
  chart?: UsageChartData;
  user?: UserInfoData;
  tokenUsage?: TokenUsageData;
  tasks?: TreeSectionState;
  contexts?: TreeSectionState;
  connectionStatus?: ConnectionStatus;
  gaugeStyle?: string;
  showUserInfoCard?: boolean;
  showCreditsCard?: boolean;
  cache?: {
    totalSize: number;
    brainSize: number;
    conversationsSize: number;
    brainCount: number;
    formattedTotal: string;
    formattedBrain: string;
    formattedConversations: string;
  };
  autoAcceptEnabled?: boolean;
  uiScale?: number;
}

// ==================== VS Code API ====================

export interface VsCodeApi {
  postMessage(message: WebviewMessage): void;
  getState(): { payload?: WebviewStateUpdate } | undefined;
  setState(state: { payload: WebviewStateUpdate }): void;
}

export interface WindowWithVsCode {
  vscodeApi?: VsCodeApi;
  __TRANSLATIONS__?: Record<string, string>;
}
