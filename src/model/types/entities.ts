/**
 * Model Layer - Entity Type Definitions
 * 
 * Unified type definitions for all domain entities.
 * This file consolidates types from utils/types.ts and core/*.ts
 * 
 * NOTE: During transition, we re-export from utils/types.ts to avoid breaking changes.
 * After refactoring is complete, types will be defined here directly.
 */

// Re-export existing types to maintain compatibility during transition
export type {
    // Quota Related
    ModelQuotaInfo,
    PromptCreditsInfo,
    QuotaSnapshot,

    // Process Detection Related
    LanguageServerInfo,
    DetectOptions,
    ProcessInfo,
    PlatformStrategy,

    // Cache Related
    BrainTask,
    CacheInfo,

    // Configuration Related
    TfaConfig,

    // Callback Types
    QuotaUpdateCallback,
    ErrorCallback,
} from '../../shared/utils/types';

// ==================== Additional Entities ====================

/** Code context (project) metadata */
export interface CodeContext {
    id: string;
    name: string;
    size: number;
}

/** File item for tree views */
export interface FileItem {
    name: string;
    path: string;
}

// ==================== History Related ====================

/** Quota history data point */
export interface QuotaHistoryPoint {
    timestamp: number;
    /** Group quota remaining { groupId: percentage } */
    usage: Record<string, number>;
}

/** Bar chart data item */
export interface BucketItem {
    groupId: string;
    usage: number;
    color?: string;
}

/** Usage time bucket */
export interface UsageBucket {
    startTime: number;
    endTime: number;
    items: BucketItem[];
}

/** Cached task info for tree cache-first startup */
export interface CachedTaskInfo {
    id: string;
    title: string;
    size: string;
    lastModified: number;
}

/** Cached context info for tree cache-first startup */
export interface CachedContextInfo {
    id: string;
    name: string;
    size: string;
}

/** Cached tree state */
export interface CachedTreeState {
    brainTasks: CachedTaskInfo[];
    codeContexts: CachedContextInfo[];
    brainExpanded?: boolean;
    contextsExpanded?: boolean;
    lastUpdated: number;
}
