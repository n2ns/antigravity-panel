/**
 * Webview 端公共类型定义
 */

// ==================== 配额相关 ====================

// ==================== 配额相关 ====================

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

// ==================== 图表相关 ====================

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
  /** 预测分析数据（可选，由 ViewModel 计算） */
  prediction?: {
    /** 活跃分组 ID */
    groupId: string;
    /** 活跃分组显示名称 */
    groupLabel: string;
    /** 使用率 (%/hour) */
    usageRate: number;
    /** 预计持续时间描述 (如 "~38h" 或 "Stable") */
    runway: string;
    /** 当前剩余百分比 */
    remaining: number;
  };
}

// ==================== 目录树相关 ====================

/** 文件项 */
export interface FileItem {
  name: string;
  path: string;
}

/** 目录项（任务/上下文） */
export interface FolderItem {
  id: string;
  label: string;
  size: string;
  files: FileItem[];
  expanded?: boolean;
}

/** 目录树区块状态 */
export interface TreeSectionState {
  title: string;
  stats: string;
  collapsed: boolean;
  folders: FolderItem[];
  loading?: boolean;
}

// ==================== 消息相关 ====================

export interface WebviewMessage {
  type: string;
  taskId?: string;
  contextId?: string;
  folderId?: string;
  path?: string;
}

export interface WebviewStateUpdate {
  quotas?: QuotaDisplayItem[];
  chart?: UsageChartData;
  tasks?: TreeSectionState;
  contexts?: TreeSectionState;
}

// ==================== VS Code API ====================

export interface VsCodeApi {
  postMessage(message: WebviewMessage): void;
  getState(): { payload?: WebviewStateUpdate } | undefined;
  setState(state: { payload: WebviewStateUpdate }): void;
}

export interface WindowWithVsCode {
  vscodeApi?: VsCodeApi;
}
