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
    CleanPlan,
    CleanResult,
    QuotaHistoryPoint,
    UsageBucket,
    CachedTreeState,
    QuotaUpdateCallback,
    ErrorCallback,
    LanguageServerInfo,
} from '../types/entities';

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
     * Dry run of cleanCache: the brain tasks beyond the keepCount most recently active,
     * and orphan conversation files (no brain task) beyond the newest keepCount.
     */
    getCleanPlan(keepCount?: number): Promise<CleanPlan>;

    /**
     * Delete exactly the entries of a plan from getCleanPlan.
     * Each deletion is attempted independently; failures are logged and counted.
     */
    executeCleanPlan(plan: CleanPlan): Promise<CleanResult>;

    /**
     * Clean cache: executeCleanPlan(getCleanPlan(keepCount))
     * @param keepCount Number of most recently active tasks to keep
     */
    cleanCache(keepCount?: number): Promise<CleanResult>;
}

// ==================== Storage Service ====================

/** Storage service interface - manages persistent state and history */
export interface IStorageService {
    // ==================== Quota History ====================

    /**
     * Record a quota data point
     * @param resets Group IDs whose quota reset was detected at this point
     */
    recordQuotaPoint(usage: Record<string, number>, resets?: string[]): Promise<void>;

    /**
     * Get recent history points
     * @param minutes Number of minutes to look back
     */
    getRecentHistory(minutes: number): QuotaHistoryPoint[];

    /**
     * Calculate usage buckets for chart display
     */
    calculateUsageBuckets(displayMinutes: number, bucketMinutes: number, maxSampleGapMs?: number): UsageBucket[];

    /**
     * Timestamp of the latest recorded reset marker for a group, or null if
     * no reset is on record. Rate windows restart at this point.
     */
    getLatestResetTime(groupId: string): number | null;

    /**
     * Per-day consumption sums (percentage points) for a group over the
     * trailing `days` local calendar days, chronological, today included.
     */
    getDailyConsumption(groupId: string, days: number, maxSampleGapMs?: number): { dayStart: number; usage: number; hasData: boolean }[];



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

    // ==================== User & Token Cache ====================

    /**
     * Get cached user info
     */
    getLastUserInfo<T>(): T | null;

    /**
     * Set user info cache
     */
    setLastUserInfo<T>(userInfo: T): Promise<void>;

    /**
     * Get cached token usage
     */
    getLastTokenUsage<T>(): T | null;

    /**
     * Set token usage cache
     */
    setLastTokenUsage<T>(tokenUsage: T): Promise<void>;

    /**
     * Clear all history
     */
    clear(): Promise<void>;

    /**
     * Get history count
     */
    readonly count: number;
}

// ==================== Context Service ====================

/** Context window of the most recently active conversation, as reported by the Language Server */
export interface ConversationContext {
    cascadeId: string;
    /** Conversation title; empty when the server has none yet */
    title: string;
    stepCount: number;
    running: boolean;
    /** Tokens of the latest model call: the server estimate, at least the prompt actually sent */
    usedTokens: number;
    maxTokens: number;
    /** Model of the latest call, e.g. gemini-3.8-flash; empty when unknown */
    model: string;
    /** Compression checkpoint of the latest call; -1 before the first compression */
    checkpointIndex: number;
    /** The latest call hit the context limit (truncationReason was set) */
    truncated: boolean;
}

/** Context service - reads the conversation context window from the Language Server */
export interface IContextService {
    setServerInfo(info: LanguageServerInfo): void;

    /**
     * Context of the most recently active conversation; null when there is no
     * conversation, the server is unknown, or the request fails
     */
    fetchContext(): Promise<ConversationContext | null>;
}

// ==================== Automation Service ====================

/**
 * CDP connection state observed by the last Auto-Accept pass.
 * unknown: no pass has finished since start; unavailable: the debugging port did not answer;
 * noTarget: the port answered but no workbench target is connected; noPanel: targets are connected but
 * no scan found the Agent panel; connected: a scan found the Agent panel (or no scan result was received).
 */
export type AutomationCdpState = 'unknown' | 'unavailable' | 'noTarget' | 'noPanel' | 'connected';

/** An action observed in the Agent panel by a CDP pass */
export interface AutomationActionEvent {
    outcome: 'accepted' | 'skipped';
    /** Button text, lower-cased and truncated */
    label: string;
    /** Why a skipped action was left for manual handling */
    reason?: 'dangerous' | 'noCommandText' | 'terminalDisabled';
    /** Epoch ms when the host received the event */
    at: number;
}

/** Runtime status of Auto-Accept; observed state only, never inferred */
export interface AutomationStatus {
    running: boolean;
    /** Registered IDE accept commands; null before discovery */
    commandCount: number | null;
    cdp: AutomationCdpState;
    lastAction: AutomationActionEvent | null;
}

/**
 * Automation service - handles hands-free features like auto-accepting steps
 */
export interface IAutomationService {
    /**
     * Current runtime status
     */
    getStatus(): AutomationStatus;

    /**
     * Register a callback fired when the runtime status changes
     */
    onStatusChange(callback: (status: AutomationStatus) => void): void;

    /**
     * Start the auto-accept loop
     */
    start(): void;

    /**
     * Stop the auto-accept loop
     */
    stop(): void;

    /**
     * Update execution interval
     */
    updateInterval(ms: number): void;

    /**
     * Allow or block clicking Run in terminal-command prompts (CDP only; the command API never approves terminal commands)
     */
    setAcceptTerminalCommands(enabled: boolean): void;
}
