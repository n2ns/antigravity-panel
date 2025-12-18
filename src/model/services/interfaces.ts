/**
 * Model Layer - Service Interfaces
 * 
 * Abstract interfaces for all Model layer services.
 * These interfaces enable dependency injection and testability.
 */

import type {
    QuotaSnapshot,
    CacheInfo,
    BrainTask,
    CodeContext,
    FileItem,
    QuotaHistoryPoint,
    UsageBucket,
    CachedTreeState,
    QuotaUpdateCallback,
    ErrorCallback,
} from '../types/entities';

// ==================== Configuration Reader ====================

/** Configuration reader interface (already exists, re-exported for consistency) */
export interface IConfigReader {
    get<T>(key: string, defaultValue: T): T;
    update<T>(key: string, value: T): Promise<void>;
}

// ==================== Quota Service ====================

/** Quota service interface - fetches quota data from Language Server */
export interface IQuotaService {
    /**
     * Fetch current quota snapshot from server
     * @returns QuotaSnapshot or null if fetch fails
     */
    fetchQuota(): Promise<QuotaSnapshot | null>;

    /**
     * Register callback for quota updates
     */
    onUpdate(callback: QuotaUpdateCallback): void;

    /**
     * Register callback for errors
     */
    onError(callback: ErrorCallback): void;
}

// ==================== Cache Service ====================

/** Cache service interface - manages brain tasks and code contexts */
export interface ICacheService {
    /**
     * Get cache information summary
     */
    getCacheInfo(): Promise<CacheInfo>;

    /**
     * Get list of brain tasks
     */
    getBrainTasks(): Promise<BrainTask[]>;

    /**
     * Get list of code contexts (projects)
     */
    getCodeContexts(): Promise<CodeContext[]>;

    /**
     * Get files within a brain task
     */
    getTaskFiles(taskId: string): Promise<FileItem[]>;

    /**
     * Get files within a code context
     */
    getContextFiles(contextId: string): Promise<FileItem[]>;

    /**
     * Delete a brain task
     */
    deleteTask(taskId: string): Promise<void>;

    /**
     * Delete a code context
     */
    deleteContext(contextId: string): Promise<void>;

    /**
     * Delete a single file
     */
    deleteFile(filePath: string): Promise<void>;

    /**
     * Clean cache by removing old tasks
     * @param keepCount Number of newest tasks to keep
     * @returns Number of tasks deleted
     */
    cleanCache(keepCount?: number): Promise<number>;
}

// ==================== Storage Service ====================

/** Storage service interface - manages persistent state and history */
export interface IStorageService {
    // ==================== Quota History ====================

    /**
     * Record a quota data point
     */
    recordQuotaPoint(usage: Record<string, number>): Promise<void>;

    /**
     * Get recent history points
     * @param minutes Number of minutes to look back
     */
    getRecentHistory(minutes: number): QuotaHistoryPoint[];

    /**
     * Calculate usage buckets for chart display
     */
    calculateUsageBuckets(displayMinutes: number, bucketMinutes: number): UsageBucket[];

    /**
     * Get maximum usage value for chart scaling
     */
    getMaxUsage(buckets: UsageBucket[]): number;

    // ==================== View State Cache ====================

    /**
     * Get last cached view state
     */
    getLastViewState<T>(): T | null;

    /**
     * Set view state cache
     */
    setLastViewState<T>(state: T): Promise<void>;

    /**
     * Get last cached tree state (for cache-first startup)
     */
    getLastTreeState(): CachedTreeState | null;

    /**
     * Set tree state cache
     */
    setLastTreeState(state: CachedTreeState): Promise<void>;

    /**
     * Get last cached snapshot
     */
    getLastSnapshot<T>(): T | null;

    /**
     * Set snapshot cache
     */
    setLastSnapshot<T>(snapshot: T): Promise<void>;

    // ==================== Metadata ====================

    /**
     * Get last cache warning time
     */
    getLastCacheWarningTime(): number;

    /**
     * Set last cache warning time
     */
    setLastCacheWarningTime(time: number): Promise<void>;

    /**
     * Get last display percentage
     */
    getLastDisplayPercentage(): number;

    /**
     * Set last display percentage
     */
    setLastDisplayPercentage(pct: number): Promise<void>;

    /**
     * Get last cache size
     */
    getLastCacheSize(): number;

    /**
     * Set last cache size
     */
    setLastCacheSize(size: number): Promise<void>;

    /**
     * Get last cache details
     */
    getLastCacheDetails(): { brain: number; workspace: number };

    /**
     * Set last cache details
     */
    setLastCacheDetails(brain: number, workspace: number): Promise<void>;

    /**
     * Get last prediction data
     */
    getLastPrediction(): { usageRate: number; runway: string; groupId: string };

    /**
     * Set last prediction data
     */
    setLastPrediction(usageRate: number, runway: string, groupId: string): Promise<void>;

    /**
     * Clear all history
     */
    clear(): Promise<void>;

    /**
     * Get history count
     */
    readonly count: number;
}
