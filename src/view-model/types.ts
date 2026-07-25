/**
 * ViewModel Layer - Type Definitions
 * 
 * Types for ViewModel state and View consumption.
 * These types represent the UI-ready data structures.
 */

import type { UserCredit } from '../model/types/entities';

// ==================== Quota View State ====================

/** Quota group state (aggregated from models) */
export interface QuotaGroupState {
    id: string;
    label: string;
    remaining: number;
    resetTime: string;
    /** Absolute reset timestamp (epoch ms); absent when unknown or server value was invalid */
    resetDate?: number;
    themeColor: string;
    hasData: boolean;
}

/** Quota display item for sidebar (either group or model) */
export interface QuotaDisplayItem {
    label: string;
    remaining: number;
    resetTime: string;
    /** Absolute reset timestamp (epoch ms); absent when unknown or server value was invalid */
    resetDate?: number;
    hasData: boolean;
    themeColor: string;
}

/** Local 7-day usage estimate across all quota pools */
export interface WeeklyUsageData {
    /** Chronological days, today last; each day stacks per-pool consumption */
    days: {
        dayStart: number;
        hasData: boolean;
        items: { usage: number; color: string; label: string }[];
    }[];
    /** Sum over all days and pools (percentage points of the short-term pools) */
    total: number;
    /** Previous seven-day sum, or null when that period has no sampled intervals */
    previousTotal: number | null;
}

/** Usage bucket projected for the Webview */
export interface UsageChartBucket {
    endTime: number;
    items: { groupId: string; usage: number; color: string }[];
}

/** Usage chart data for visualization */
export interface UsageChartData {
    buckets: UsageChartBucket[];
    groupLabels?: Record<string, string>;
    displayMinutes?: number;
    interval?: number;
    prediction?: {
        usageRate: number;
        runway: string;
    };
}

/** Quota view state */
export interface QuotaViewState {
    groups: QuotaGroupState[];
    activeGroupId: string;
    chart: UsageChartData;
    displayItems: QuotaDisplayItem[];
}

// ==================== Cache View State ====================

/** Cache view state */
export interface CacheViewState {
    totalSize: number;
    formattedTotal: string;
    formattedBrain: string;
    formattedConversations: string;
}

// ==================== Tree View State ====================

/** File item for tree view */
export interface TreeFileItem {
    name: string;
    path: string;
}

/** Folder item for tree view */
export interface TreeFolderItem {
    id: string;
    label: string;
    size: string;
    sizeBytes?: number;
    lastModified?: number;
    expanded: boolean;
    files: TreeFileItem[];
}

/** Tree section state */
export interface TreeSectionState {
    expanded: boolean;
    folders: TreeFolderItem[];
}

/** Combined tree view state */
export interface TreeViewState {
    tasks: TreeSectionState;
    contexts: TreeSectionState;
}

// ==================== StatusBar Data ====================

/** StatusBar individual group info */
export interface StatusBarGroupItem {
    id: string;
    label: string;
    shortLabel: string;
    percentage: number;
    resetTime: string;
}

/** StatusBar display data */
export interface StatusBarData {
    primary: StatusBarGroupItem;
    allGroups: StatusBarGroupItem[];
}

// ==================== User View State ====================

/** User subscription view state */
export interface UserViewState {
    /** User email */
    email?: string;
    /** Subscription tier (e.g., "Pro", "Individual", "Enterprise") */
    tier?: string;
}

// ==================== Token Usage View State ====================

/** Token/Credits usage view state */
export interface TokenUsageViewState {
    /** Prompt credits info */
    promptCredits?: {
        available: number;
        monthly: number;
        remainingPercentage: number;
    };
    /** Flow credits info */
    flowCredits?: {
        available: number;
        monthly: number;
        remainingPercentage: number;
    };
    /** User tier credits (like GOOGLE_ONE_AI) */
    userCredits?: Pick<UserCredit, 'creditType' | 'creditAmount'>[];
    /** Formatted display strings */
    formatted: {
        promptAvailable: string;
        promptMonthly: string;
        flowAvailable: string;
        flowMonthly: string;
    };
}

// ==================== Sidebar Data ====================

/** Complete sidebar data for webview */
export interface SidebarData {
    quotas: QuotaDisplayItem[];
    chart: UsageChartData;
    /** null = card disabled or no data yet (explicit so the webview can clear it) */
    weekly: WeeklyUsageData | null;
    cache: Pick<CacheViewState, 'formattedBrain' | 'formattedConversations'>;
    user?: UserViewState;
    tokenUsage?: TokenUsageViewState;
    tasks: TreeSectionState;
    contexts: TreeSectionState;
    connectionStatus: ConnectionStatus;
    failureReason?: 'no_process' | 'no_port' | 'auth_failed' | 'workspace_mismatch' | null;
    gaugeStyle?: string;
    showUserInfoCard?: boolean;
    showCreditsCard?: boolean;
    autoAcceptEnabled?: boolean;
    uiScale?: number;
}

/** Connection status for sidebar feedback */
export type ConnectionStatus = 'connected' | 'failed' | 'detecting';

// ==================== App State ====================

/** Application global state */
export interface AppState {
    quota: QuotaViewState;
    cache: CacheViewState;
    user?: UserViewState;
    tokenUsage?: TokenUsageViewState;
    tree: TreeViewState;
    connectionStatus: ConnectionStatus;
    failureReason?: 'no_process' | 'no_port' | 'auth_failed' | 'workspace_mismatch' | null;
    automation: {
        enabled: boolean;
    };
}

/** Webview Message Protocol */
export interface WebviewMessage {
    type: string;
    taskId?: string;
    contextId?: string;
    path?: string;
}
