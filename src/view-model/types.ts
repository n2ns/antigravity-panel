/**
 * ViewModel Layer - Type Definitions
 * 
 * Types for ViewModel state and View consumption.
 * These types represent the UI-ready data structures.
 */

import type { UsageBucket, BucketItem } from '../model/types/entities';

// ==================== Quota View State ====================

/** Quota group state (aggregated from models) */
export interface QuotaGroupState {
    id: string;
    label: string;
    remaining: number;
    resetTime: string;
    themeColor: string;
    hasData: boolean;
}

/** Quota display item for sidebar (either group or model) */
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

/** Usage chart data for visualization */
export interface UsageChartData {
    buckets: UsageBucket[];
    maxUsage: number;
    groupColors: Record<string, string>;
    displayMinutes?: number;
    interval?: number;
    prediction?: {
        groupId: string;
        groupLabel: string;
        usageRate: number;
        runway: string;
        remaining: number;
    };
}

/** Quota view state */
export interface QuotaViewState {
    groups: QuotaGroupState[];
    activeGroupId: string;
    chart: UsageChartData;
    displayItems: QuotaDisplayItem[];
    lastUpdated?: number;
}

// ==================== Cache View State ====================

/** Cache view state */
export interface CacheViewState {
    totalSize: number;
    brainSize: number;
    conversationsSize: number;
    brainCount: number;
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
    lastModified?: number;
    expanded: boolean;
    loading: boolean;
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
    color: string;
    usageRate: number;
    runway: string;
}

/** StatusBar display data */
export interface StatusBarData {
    primary: StatusBarGroupItem;
    allGroups: StatusBarGroupItem[];
}

// ==================== User View State ====================

/** User subscription view state */
export interface UserViewState {
    /** User display name */
    name?: string;
    /** User email */
    email?: string;
    /** Subscription tier (e.g., "Pro", "Individual", "Enterprise") */
    tier?: string;
    /** Tier description */
    tierDescription?: string;
    /** Plan name */
    planName?: string;
    /** Whether browser feature is enabled */
    browserEnabled?: boolean;
    /** Whether knowledge base is enabled */
    knowledgeBaseEnabled?: boolean;
    /** Upgrade URI if available */
    upgradeUri?: string;
    /** Upgrade button text */
    upgradeText?: string;
}

// ==================== Token Usage View State ====================

/** Token/Credits usage view state */
export interface TokenUsageViewState {
    /** Prompt credits info */
    promptCredits?: {
        available: number;
        monthly: number;
        usedPercentage: number;
        remainingPercentage: number;
    };
    /** Flow credits info */
    flowCredits?: {
        available: number;
        monthly: number;
        usedPercentage: number;
        remainingPercentage: number;
    };
    /** Total available credits */
    totalAvailable: number;
    /** Total monthly credits */
    totalMonthly: number;
    /** Overall remaining percentage */
    overallRemainingPercentage: number;
    /** Formatted display strings */
    formatted: {
        promptAvailable: string;
        promptMonthly: string;
        flowAvailable: string;
        flowMonthly: string;
        totalAvailable: string;
        totalMonthly: string;
    };
}

// ==================== Sidebar Data ====================

/** Complete sidebar data for webview */
export interface SidebarData {
    quotas: QuotaDisplayItem[];
    chart: UsageChartData;
    cache: CacheViewState;
    user?: UserViewState;
    tokenUsage?: TokenUsageViewState;
    tasks: TreeSectionState;
    contexts: TreeSectionState;
    connectionStatus: ConnectionStatus;
    gaugeStyle?: string;
    showUserInfoCard?: boolean;
    showCreditsCard?: boolean;
    autoAcceptEnabled?: boolean;
    uiScale?: number;
}

/** Connection status for sidebar feedback */
export type ConnectionStatus = 'detecting' | 'connected' | 'failed';

// ==================== App State ====================

/** Application global state */
export interface AppState {
    quota: QuotaViewState;
    cache: CacheViewState;
    user?: UserViewState;
    tokenUsage?: TokenUsageViewState;
    tree: TreeViewState;
    connectionStatus: ConnectionStatus;
    automation: {
        enabled: boolean;
    };
    lastUpdated: number;
}

// Re-export for convenience
export type { UsageBucket, BucketItem };

/** Webview Message Protocol */
export interface WebviewMessage {
    type: string;
    taskId?: string;
    contextId?: string;
    folderId?: string;
    path?: string;
}
