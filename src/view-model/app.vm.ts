/**
 * AppViewModel: Unified application state management (MVVM architecture)
 */

import * as vscode from 'vscode';
import type { IQuotaService, ICacheService, IStorageService, IAutomationService } from '../model/services/interfaces';
import type { QuotaSnapshot, BrainTask, CacheInfo, CodeContext, FileItem, ModelQuotaInfo, UsageBucket } from '../model/types/entities';
import type { TfaConfig } from '../shared/utils/types';
import type { QuotaStrategyManager } from '../model/strategy';
import type { ConfigManager } from '../shared/config/config_manager';
import { formatBytes } from '../shared/utils/format';
import { QUOTA_RESET_HOURS_FALLBACK } from '../shared/utils/constants';
import type {
    AppState,
    QuotaViewState,
    QuotaGroupState,
    QuotaDisplayItem,
    CacheViewState,
    TreeViewState,
    StatusBarData,
    StatusBarGroupItem,
    SidebarData,
    UsageChartData,
    WeeklyUsageData,
    TokenUsageViewState,
    UserViewState,
    ConnectionStatus,
} from './types';

const ACTIVE_GROUP_THRESHOLD = 0.1;

export class AppViewModel implements vscode.Disposable {
    private _state: AppState;
    private _lastSnapshot: QuotaSnapshot | null = null;
    private _disposables: vscode.Disposable[] = [];
    private _notificationCooldowns = new Map<string, number>();
    private readonly NOTIFICATION_COOLDOWN = 30 * 60 * 1000; // 30 minutes
    /** Previous remaining % per group for request detection */
    private _prevGroupRemaining = new Map<string, number>();
    private _quotaRefreshVersion = 0;
    private _quotaUpdateQueue: Promise<void> = Promise.resolve();
    private _disposed = false;

    private _resetRefreshTimer: ReturnType<typeof setTimeout> | null = null;
    private _resetRefreshTargetMs = 0;

    // Abnormal drain detection state
    private _lastActivityTs = Date.now();
    private _idleDrainAccum = new Map<string, number>();
    private _offlineDrainChecked = new Set<string>();

    private readonly _onStateChange = new vscode.EventEmitter<AppState>();
    readonly onStateChange = this._onStateChange.event;

    private readonly _onQuotaChange = new vscode.EventEmitter<QuotaViewState>();
    readonly onQuotaChange = this._onQuotaChange.event;

    private readonly _onCacheChange = new vscode.EventEmitter<CacheViewState>();
    readonly onCacheChange = this._onCacheChange.event;

    private readonly _onTreeChange = new vscode.EventEmitter<TreeViewState>();
    readonly onTreeChange = this._onTreeChange.event;

    private _expandedTasks = new Set<string>();
    private _expandedContexts = new Set<string>();
    private _taskFilesCache = new Map<string, FileItem[]>();
    private _contextFilesCache = new Map<string, FileItem[]>();

    constructor(
        private readonly quotaService: IQuotaService,
        private readonly cacheService: ICacheService,
        private readonly storageService: IStorageService,
        private readonly configManager: ConfigManager,
        private readonly strategyManager: QuotaStrategyManager,
        private readonly automationService: IAutomationService
    ) {
        this._state = this.createEmptyState();

        // Sync initial state from config
        const initialAutoAccept = this.configManager.get('system.autoAccept', false);
        const initialInterval = this.configManager.get('system.autoAcceptInterval', 800);

        this.automationService.updateInterval(initialInterval);

        if (initialAutoAccept) {
            this.automationService.start();
        }
        this._state.automation.enabled = initialAutoAccept;

        // Editor activity feeds idle-drain detection: quota dropping while the
        // user is verifiably away is worth a warning, normal usage is not.
        this._disposables.push(
            vscode.workspace.onDidChangeTextDocument(() => this.recordUserActivity()),
            vscode.window.onDidChangeWindowState(e => {
                if (e.focused) this.recordUserActivity();
            })
        );
    }

    private recordUserActivity(): void {
        this._lastActivityTs = Date.now();
        this._idleDrainAccum.clear();
    }

    private createEmptyState(): AppState {
        const pools = this.strategyManager.getQuotaPools();
        return {
            quota: {
                groups: pools.map(pool => ({
                    id: pool.id,
                    label: pool.label,
                    remaining: 0,
                    resetTime: 'N/A',
                    themeColor: pool.themeColor,
                    hasData: false
                })),
                activeGroupId: pools[0]?.id || 'gemini',
                chart: { buckets: [], maxUsage: 1, groupColors: {} },
                displayItems: pools.map(pool => ({
                    id: pool.id,
                    label: pool.label,
                    type: 'group' as const,
                    remaining: 0,
                    resetTime: 'N/A',
                    hasData: false,
                    themeColor: pool.themeColor
                }))
            },
            cache: {
                totalSize: 0,
                brainSize: 0,
                conversationsSize: 0,
                brainCount: 0,
                formattedTotal: '0 B',
                formattedBrain: '0 B',
                formattedConversations: '0 B'
            },
            tree: {
                tasks: { expanded: false, folders: [] },
                contexts: { expanded: false, folders: [] }
            },
            automation: {
                enabled: false
            },
            connectionStatus: 'detecting',
            lastUpdated: 0
        };
    }

    async refreshQuota(): Promise<void> {
        if (this._disposed) return;
        const quotaRefreshVersion = ++this._quotaRefreshVersion;
        const quota = await this.quotaService.fetchQuota();
        if (!quota || !this.isCurrentQuotaRefresh(quotaRefreshVersion)) return;

        if (await this.enqueueQuotaUpdate(quota, quotaRefreshVersion)) {
            this._state.connectionStatus = 'connected';
            this._onQuotaChange.fire(this._state.quota);
            this._onStateChange.fire(this._state);
        }
    }

    private async enqueueQuotaUpdate(snapshot: QuotaSnapshot, refreshVersion: number): Promise<boolean> {
        const updateTask = this._quotaUpdateQueue.then(async () => {
            if (!this.isCurrentQuotaRefresh(refreshVersion)) return false;
            return this.updateQuotaState(snapshot, refreshVersion);
        });
        this._quotaUpdateQueue = updateTask.then(() => undefined, () => undefined);
        return updateTask;
    }

    private isCurrentQuotaRefresh(version: number): boolean {
        return !this._disposed && version === this._quotaRefreshVersion;
    }


    async refreshCache(): Promise<void> {
        const cache = await this.cacheService.getCacheInfo();
        if (cache) {
            await this.updateCacheState(cache);
            this._onCacheChange.fire(this._state.cache);
            this._onTreeChange.fire(this._state.tree);
            this._onStateChange.fire(this._state);
        }
    }

    /**
     * Clean cache by removing old tasks
     * @param keepCount Number of newest tasks to keep
     */
    async cleanCache(keepCount?: number): Promise<{ deletedCount: number, freedBytes: number }> {
        const result = await this.cacheService.cleanCache(keepCount);
        await this.refreshCache();
        return result;
    }

    /**
     * Perform auto-clean based on configuration
     */
    async performAutoClean(): Promise<{ deletedCount: number, freedBytes: number } | null> {
        const config = this.configManager.getConfig();
        if (!config["cache.autoClean"]) return null;

        const keepCount = config["cache.autoCleanKeepCount"] || 5;
        const result = await this.cleanCache(keepCount);
        return result;
    }

    async deleteTask(taskId: string): Promise<void> {
        const confirm = await vscode.window.showWarningMessage(
            `Are you sure you want to delete task ${taskId}?`,
            { modal: true },
            'Delete'
        );
        if (confirm === 'Delete') {
            await this.cacheService.deleteTask(taskId);
            this._expandedTasks.delete(taskId);
            this._taskFilesCache.delete(taskId); // Clear file cache
            await this.refreshCache();
        }
    }

    async deleteContext(contextId: string): Promise<void> {
        const confirm = await vscode.window.showWarningMessage(
            `Are you sure you want to delete context ${contextId}?`,
            { modal: true },
            'Delete'
        );
        if (confirm === 'Delete') {
            await this.cacheService.deleteContext(contextId);
            this._expandedContexts.delete(contextId);
            this._contextFilesCache.delete(contextId); // Clear file cache
            await this.refreshCache();
        }
    }

    async deleteFile(filePath: string): Promise<void> {
        await this.cacheService.deleteFile(filePath);
        // We don't know exactly which folder this file belongs to, so we clear all file caches
        // and force a refresh to ensure UI consistency.
        this._taskFilesCache.clear();
        this._contextFilesCache.clear();
        await this.refreshCache();
    }

    async toggleTaskExpansion(taskId: string): Promise<void> {
        if (this._expandedTasks.has(taskId)) {
            this._expandedTasks.delete(taskId);
        } else {
            this._expandedTasks.add(taskId);
            // Optionally load files for this task if needed
            if (!this._taskFilesCache.has(taskId)) {
                const files = await this.cacheService.getTaskFiles(taskId);
                this._taskFilesCache.set(taskId, files);
            }
        }
        await this.updateTaskFiles(taskId);
        this._onTreeChange.fire(this._state.tree);
    }

    async toggleContextExpansion(contextId: string): Promise<void> {
        if (this._expandedContexts.has(contextId)) {
            this._expandedContexts.delete(contextId);
        } else {
            this._expandedContexts.add(contextId);
            if (!this._contextFilesCache.has(contextId)) {
                const files = await this.cacheService.getContextFiles(contextId);
                this._contextFilesCache.set(contextId, files);
            }
        }
        await this.updateContextFiles(contextId);
        this._onTreeChange.fire(this._state.tree);
    }

    private async updateTaskFiles(taskId: string): Promise<void> {
        const folder = this._state.tree.tasks.folders.find(f => f.id === taskId);
        if (folder) {
            folder.expanded = this._expandedTasks.has(taskId);
            if (folder.expanded) {
                const files = this._taskFilesCache.get(taskId) || [];
                folder.files = files.map(f => ({ name: f.name, path: f.path }));
            } else {
                folder.files = [];
            }
        }
    }

    private async updateContextFiles(contextId: string): Promise<void> {
        const folder = this._state.tree.contexts.folders.find(f => f.id === contextId);
        if (folder) {
            folder.expanded = this._expandedContexts.has(contextId);
            if (folder.expanded) {
                const files = this._contextFilesCache.get(contextId) || [];
                folder.files = files.map(f => ({ name: f.name, path: f.path }));
            } else {
                folder.files = [];
            }
        }
    }

    toggleTasksSection(): void {
        this._state.tree.tasks.expanded = !this._state.tree.tasks.expanded;
        this.persistTreeState();
        this._onTreeChange.fire(this._state.tree);
    }

    toggleContextsSection(): void {
        this._state.tree.contexts.expanded = !this._state.tree.contexts.expanded;
        this.persistTreeState();
        this._onTreeChange.fire(this._state.tree);
    }

    /**
     * Toggle the auto-accept automation
     */
    async toggleAutoAccept(): Promise<void> {
        const newValue = !this._state.automation.enabled;

        // 1. Update Service
        if (newValue) {
            this.automationService.start();
        } else {
            this.automationService.stop();
        }

        // 2. Update Local State
        this._state.automation.enabled = newValue;

        // 3. Update Configuration (Persistent)
        await this.configManager.update('system.autoAccept', newValue);

        // 4. Notify UI
        this._onStateChange.fire(this._state);
    }

    private async persistTreeState(): Promise<void> {
        // Persist tree state for cache-first startup
        await this.storageService.setLastTreeState({
            brainTasks: this._state.tree.tasks.folders.map(f => {
                // Find original task to get accurate bytes if possible, but path/size mapping is enough here
                return { id: f.id, title: f.label, size: "0", lastModified: Date.now() };
            }),
            codeContexts: this._state.tree.contexts.folders.map(f => {
                return { id: f.id, name: f.label, size: "0" };
            }),
            brainExpanded: this._state.tree.tasks.expanded,
            contextsExpanded: this._state.tree.contexts.expanded,
            lastUpdated: Date.now()
        });
    }

    /**
     * Handle configuration changes immediately without waiting for network
     */
    async onConfigurationChanged(): Promise<void> {
        // If we have cached data, re-render UI with new config (e.g. chart time range)
        if (this._lastSnapshot) {
            const refreshVersion = ++this._quotaRefreshVersion;
            if (await this.enqueueQuotaUpdate(this._lastSnapshot, refreshVersion)) {
                this._onQuotaChange.fire(this._state.quota);
            }
        } else {
            // No data implies we might need to fetch
            await this.refreshQuota();
        }

        // Also refresh cache view in case thresholds changed
        await this.refreshCache();

        // Handle auto-accept config change
        const autoAccept = this.configManager.get('system.autoAccept', false);
        const interval = this.configManager.get('system.autoAcceptInterval', 800);

        this.automationService.updateInterval(interval);

        if (autoAccept !== this._state.automation.enabled) {
            if (autoAccept) this.automationService.start();
            else this.automationService.stop();

            this._state.automation.enabled = autoAccept;
            this._onStateChange.fire(this._state);
        }
    }

    private async updateQuotaState(snapshot: QuotaSnapshot, refreshVersion: number): Promise<boolean> {
        this._lastSnapshot = snapshot;
        const prevState = this._state.quota;
        const newGroups = this.aggregateGroups(snapshot);
        const observedRemaining = new Map<string, number>();
        for (const group of newGroups) {
            const model = this.getMinModelForPool(snapshot, group.id);
            if (model) observedRemaining.set(group.id, model.remainingPercentage);
        }
        const activeGroupId = this.detectActiveGroup(prevState, newGroups);
        const activeGroup = newGroups.find(g => g.id === activeGroupId);
        const currentRemaining = activeGroup?.remaining || 0;

        // === Quota reset detection: compare with previous remaining to reset consumption rate ===
        const RESET_THRESHOLD_PP = 0.1;
        const resetGroups: string[] = [];
        for (const group of newGroups) {
            if (!group.hasData) continue;
            const currentObserved = observedRemaining.get(group.id) ?? group.remaining;
            const prev = this._prevGroupRemaining.get(group.id);
            if (prev !== undefined) {
                if (currentObserved > prev + RESET_THRESHOLD_PP) {
                    // Quota increased -> reset detected. Mark the point instead of
                    // deleting history: rate windows restart at the marker while the
                    // usage timeline keeps its pre-reset consumption bars.
                    resetGroups.push(group.id);
                    this._idleDrainAccum.delete(group.id);
                    this.maybeNotifyQuotaReset(group, prev, currentObserved);
                } else {
                    this.trackIdleDrain(group, prev, currentObserved);
                }
            } else {
                // First live value this session: check for drain while the IDE was closed
                this.checkOfflineDrain(group, currentObserved);
            }
            this._prevGroupRemaining.set(group.id, currentObserved);
        }

        this.scheduleResetRefresh(newGroups);

        const quotaRecord: Record<string, number> = {};
        for (const group of newGroups) {
            if (group.hasData) quotaRecord[group.id] = observedRemaining.get(group.id) ?? group.remaining;
        }
        await this.storageService.recordQuotaPoint(quotaRecord, resetGroups);
        if (!this.isCurrentQuotaRefresh(refreshVersion)) return false;

        const chart = this.buildChartData(activeGroupId, currentRemaining);

        // Compute accumulated pp consumed per group from chart buckets,
        // counting only consumption after each group's latest reset
        const groupConsumption = new Map<string, number>();
        const latestResetCache = new Map<string, number | null>();
        const latestResetFor = (groupId: string): number | null => {
            if (!latestResetCache.has(groupId)) {
                latestResetCache.set(groupId, this.storageService.getLatestResetTime(groupId));
            }
            return latestResetCache.get(groupId)!;
        };
        for (const bucket of chart.buckets) {
            for (const item of bucket.items) {
                const latestReset = latestResetFor(item.groupId);
                if (latestReset !== null && bucket.endTime <= latestReset) continue;
                groupConsumption.set(item.groupId, (groupConsumption.get(item.groupId) || 0) + item.usage);
            }
        }

        const displayItems = this.buildDisplayItems(newGroups, groupConsumption);

        this._state.quota = {
            groups: newGroups,
            activeGroupId,
            chart,
            displayItems
        };
        this._state.connectionStatus = 'connected';

        // Update user info if available
        if (snapshot.userInfo) {
            this._state.user = {
                name: snapshot.userInfo.name,
                email: snapshot.userInfo.email,
                tier: snapshot.userInfo.tier,
                tierDescription: snapshot.userInfo.tierDescription,
                planName: snapshot.userInfo.planName,
                browserEnabled: snapshot.userInfo.browserEnabled,
                knowledgeBaseEnabled: snapshot.userInfo.knowledgeBaseEnabled,
                upgradeUri: snapshot.userInfo.upgradeUri,
                upgradeText: snapshot.userInfo.upgradeText,
            };
        }

        // Update token usage if available
        if (snapshot.tokenUsage) {
            const tu = snapshot.tokenUsage;
            this._state.tokenUsage = {
                promptCredits: tu.promptCredits,
                flowCredits: tu.flowCredits,
                totalAvailable: tu.totalAvailable,
                totalMonthly: tu.totalMonthly,
                overallRemainingPercentage: tu.overallRemainingPercentage,
                userCredits: tu.userCredits,
                formatted: {
                    promptAvailable: this.formatCredits(tu.promptCredits?.available),
                    promptMonthly: this.formatCredits(tu.promptCredits?.monthly),
                    flowAvailable: this.formatCredits(tu.flowCredits?.available),
                    flowMonthly: this.formatCredits(tu.flowCredits?.monthly),
                    totalAvailable: this.formatCredits(tu.totalAvailable),
                    totalMonthly: this.formatCredits(tu.totalMonthly),
                },
            };
        }

        await this.storageService.setLastViewState(this._state.quota);
        if (!this.isCurrentQuotaRefresh(refreshVersion)) return false;
        await this.storageService.setLastSnapshot(snapshot);
        if (!this.isCurrentQuotaRefresh(refreshVersion)) return false;
        await this.storageService.setLastDisplayPercentage(Math.round(currentRemaining));
        if (!this.isCurrentQuotaRefresh(refreshVersion)) return false;
        await this.storageService.setLastPrediction(
            chart.prediction?.usageRate || 0,
            chart.prediction?.runway || 'Stable',
            activeGroupId
        );
        if (!this.isCurrentQuotaRefresh(refreshVersion)) return false;

        // Cache user info and token usage for instant startup
        if (this._state.user) {
            await this.storageService.setLastUserInfo(this._state.user);
            if (!this.isCurrentQuotaRefresh(refreshVersion)) return false;
        }
        if (this._state.tokenUsage) {
            await this.storageService.setLastTokenUsage(this._state.tokenUsage);
            if (!this.isCurrentQuotaRefresh(refreshVersion)) return false;
        }

        // Trigger notifications for the active group
        this.checkQuotaNotifications(activeGroup);
        return true;
    }

    /**
     * Notify when a group's quota rebounds enough to be a real reset.
     * Uses its own high threshold, separate from the 0.1pp rate-clearing
     * threshold above, so server-side fraction jitter never produces a toast.
     */
    private maybeNotifyQuotaReset(group: QuotaGroupState, prevRemaining: number, currentRemaining: number): void {
        const RESET_NOTIFY_THRESHOLD_PP = 5;
        if (currentRemaining - prevRemaining < RESET_NOTIFY_THRESHOLD_PP) return;

        const config = this.configManager.getConfig();
        if (!config["system.notifyOnQuotaReset"]) return;

        const cooldownKey = `reset:${group.id}`;
        const now = Date.now();
        const lastNotify = this._notificationCooldowns.get(cooldownKey) || 0;
        if (now - lastNotify < this.NOTIFICATION_COOLDOWN) return;

        vscode.window.showInformationMessage(
            vscode.l10n.t("Quota reset: {0} is back to {1}%.", group.label, Math.round(currentRemaining))
        );
        this._notificationCooldowns.set(cooldownKey, now);
    }

    /**
     * Warn when the first live value of a session sits far below the last value
     * persisted by the previous session — quota drained while the IDE was closed.
     * Skipped when a reset fell inside the offline window: the old value is then
     * not a valid baseline for the comparison.
     */
    private checkOfflineDrain(group: QuotaGroupState, currentRemaining: number): void {
        if (this._offlineDrainChecked.has(group.id)) return;
        this._offlineDrainChecked.add(group.id);

        // Runs before this cycle's recordQuotaPoint, so the newest matching
        // history point still belongs to the previous session.
        const history = this.storageService.getRecentHistory(7 * 24 * 60);
        let lastValue: number | undefined;
        let lastTimestamp = 0;
        for (let i = history.length - 1; i >= 0; i--) {
            const value = history[i].usage[group.id];
            if (value !== undefined) {
                lastValue = value;
                lastTimestamp = history[i].timestamp;
                break;
            }
        }
        if (lastValue === undefined) return;

        const drop = lastValue - currentRemaining;
        if (drop < AppViewModel.ABNORMAL_DRAIN_THRESHOLD_PP) return;

        const stored = this.storageService.getLastSnapshot<QuotaSnapshot>();
        if (stored?.models) {
            const model = this.getMinModelForPool(stored, group.id);
            if (model && !model.resetTimeIsFallback) {
                const resetMs = this.getResetTimestamp(model);
                if (resetMs !== undefined && resetMs > lastTimestamp && resetMs <= Date.now()) return;
            }
        }

        this.notifyAbnormalDrain(group, drop, currentRemaining, 'offline');
    }

    /**
     * Accumulate quota drops that happen while the user is verifiably idle
     * (window unfocused / no edits for a sustained period) and warn once the
     * accumulated drain crosses the threshold. Any activity clears the tally.
     */
    private trackIdleDrain(group: QuotaGroupState, prevRemaining: number, currentRemaining: number): void {
        const IDLE_MS = 10 * 60 * 1000;
        const drop = prevRemaining - currentRemaining;
        if (drop <= 0) return;
        if (vscode.window.state.focused || Date.now() - this._lastActivityTs < IDLE_MS) {
            this._idleDrainAccum.delete(group.id);
            return;
        }

        const accumulated = (this._idleDrainAccum.get(group.id) || 0) + drop;
        if (accumulated >= AppViewModel.ABNORMAL_DRAIN_THRESHOLD_PP) {
            this._idleDrainAccum.delete(group.id);
            this.notifyAbnormalDrain(group, accumulated, currentRemaining, 'idle');
        } else {
            this._idleDrainAccum.set(group.id, accumulated);
        }
    }

    private static readonly ABNORMAL_DRAIN_THRESHOLD_PP = 5;

    private notifyAbnormalDrain(
        group: QuotaGroupState,
        drop: number,
        currentRemaining: number,
        kind: 'offline' | 'idle'
    ): void {
        const config = this.configManager.getConfig();
        if (!config["system.notifyOnAbnormalDrain"]) return;

        const cooldownKey = `drain:${group.id}`;
        const now = Date.now();
        const lastNotify = this._notificationCooldowns.get(cooldownKey) || 0;
        if (now - lastNotify < this.NOTIFICATION_COOLDOWN) return;

        const message = kind === 'offline'
            ? vscode.l10n.t(
                "Abnormal quota drain: {0} dropped {1}pp while the IDE was closed (now {2}%).",
                group.label, Math.round(drop), Math.round(currentRemaining)
            )
            : vscode.l10n.t(
                "Abnormal quota drain: {0} dropped {1}pp with no editor activity (now {2}%).",
                group.label, Math.round(drop), Math.round(currentRemaining)
            );
        vscode.window.showWarningMessage(message);
        this._notificationCooldowns.set(cooldownKey, now);
    }

    /**
     * Schedule one refresh right after the earliest upcoming quota reset, so the
     * panel reflects a reset within seconds instead of waiting a polling cycle.
     * The next updateQuotaState reschedules against fresh server data, so a
     * server-side late reset simply pushes the timer forward — no retry loop.
     */
    private scheduleResetRefresh(groups: QuotaGroupState[]): void {
        const RESET_REFRESH_BUFFER_MS = 45_000;
        const now = Date.now();

        let earliest: number | null = null;
        for (const group of groups) {
            if (!group.hasData || group.resetDate === undefined) continue;
            if (group.resetDate <= now) continue;
            if (earliest === null || group.resetDate < earliest) earliest = group.resetDate;
        }
        if (earliest === null) {
            if (this._resetRefreshTimer) {
                clearTimeout(this._resetRefreshTimer);
                this._resetRefreshTimer = null;
                this._resetRefreshTargetMs = 0;
            }
            return;
        }

        const target = earliest + RESET_REFRESH_BUFFER_MS;
        // Keep an already-armed timer aimed at the same reset
        if (this._resetRefreshTimer && Math.abs(target - this._resetRefreshTargetMs) < 1000) return;

        if (this._resetRefreshTimer) clearTimeout(this._resetRefreshTimer);
        this._resetRefreshTargetMs = target;
        this._resetRefreshTimer = setTimeout(() => {
            this._resetRefreshTimer = null;
            if (!this._disposed) void this.refreshQuota();
        }, target - now);
        // Never keep the process alive just for this convenience refresh
        this._resetRefreshTimer.unref?.();
    }

    /**
     * Check if notifications should be shown for a quota group
     */
    private checkQuotaNotifications(group?: QuotaGroupState): void {
        if (!group || !group.hasData) return;

        const config = this.configManager.getConfig();
        const warningThreshold = config["status.warningThreshold"] ?? 40;
        const criticalThreshold = config["status.criticalThreshold"] ?? 20;

        const now = Date.now();
        const lastNotify = this._notificationCooldowns.get(group.id) || 0;

        if (now - lastNotify < this.NOTIFICATION_COOLDOWN) {
            return;
        }

        let message: string | undefined;
        let severity: 'warning' | 'critical' | undefined;

        if (group.remaining <= criticalThreshold) {
            message = vscode.l10n.t(
                "CRITICAL Quota: {0} quota is below {1}% ({2}% remaining). Use with caution!",
                group.label, criticalThreshold, Math.round(group.remaining)
            );
            severity = 'critical';
        } else if (group.remaining <= warningThreshold) {
            message = vscode.l10n.t(
                "Low Quota Warning: {0} quota is below {1}% ({2}% remaining).",
                group.label, warningThreshold, Math.round(group.remaining)
            );
            severity = 'warning';
        }

        if (message) {
            if (severity === 'critical') {
                vscode.window.showWarningMessage(message);
            } else {
                vscode.window.showInformationMessage(message);
            }
            this._notificationCooldowns.set(group.id, now);
        }
    }

    /**
     * Format credits number for display
     */
    private formatCredits(value?: number): string {
        if (value === undefined || value === null) return 'N/A';
        if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
        if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
        return value.toString();
    }

    /** Resolve all model rows that consume from one configured backend quota pool. */
    private getModelsForPoolFromSnapshot(snapshot: QuotaSnapshot, poolId: string): ModelQuotaInfo[] {
        const models = snapshot.models || [];
        return models.filter(model => {
            const group = this.strategyManager.getGroupForModel(model.modelId, model.label);
            return group.quotaPoolId === poolId;
        });
    }

    /**
     * Lowest-remaining model row of a pool — the row that defines the pool's
     * displayed quota and reset time everywhere (groups, status bar, prediction).
     */
    private getMinModelForPool(snapshot: QuotaSnapshot, poolId: string): ModelQuotaInfo | null {
        const poolModels = this.getModelsForPoolFromSnapshot(snapshot, poolId);
        if (poolModels.length === 0) return null;
        return poolModels.reduce((min, m) =>
            m.remainingPercentage < min.remainingPercentage ? m : min
        );
    }

    private getResetTimestamp(model: ModelQuotaInfo): number | undefined {
        if (model.resetTimeIsFallback) return undefined;
        const timestamp = model.resetTime instanceof Date
            ? model.resetTime.getTime()
            : new Date(model.resetTime as unknown as string).getTime();
        return Number.isFinite(timestamp) ? timestamp : undefined;
    }

    private aggregateGroups(snapshot: QuotaSnapshot): QuotaGroupState[] {
        const pools = this.strategyManager.getQuotaPools();

        return pools.map(pool => {
            const minModel = this.getMinModelForPool(snapshot, pool.id);

            if (!minModel) {
                return {
                    id: pool.id,
                    label: pool.label,
                    remaining: 0,
                    resetTime: 'N/A',
                    themeColor: pool.themeColor,
                    hasData: false
                };
            }

            // UI Sync: If it's "Ready", force show 100% even if server hasn't updated the fraction yet
            const isReady = minModel.timeUntilReset === 'Ready';
            const remaining = isReady ? 100 : minModel.remainingPercentage;

            return {
                id: pool.id,
                label: pool.label,
                remaining,
                resetTime: minModel.timeUntilReset,
                resetDate: this.getResetTimestamp(minModel),
                themeColor: pool.themeColor,
                hasData: true
            };
        });
    }

    /**
     * Hours until the next quota reset for the active group, from API `resetTime` on the
     * lowest-remaining model (same rule as aggregateGroups for every configured pool).
     * Used for prediction instead of a fixed window.
     */
    private getHoursUntilResetForGroup(groupId: string): number | null {
        if (!this._lastSnapshot?.models?.length) return null;
        const minModel = this.getMinModelForPool(this._lastSnapshot, groupId);
        if (!minModel) return null;
        const resetTimestamp = this.getResetTimestamp(minModel);
        if (resetTimestamp === undefined) return null;
        const ms = resetTimestamp - Date.now();
        if (isNaN(ms) || ms <= 0) return null;
        return ms / 3_600_000;
    }

    private detectActiveGroup(prevState: QuotaViewState, newGroups: QuotaGroupState[]): string {
        let maxDrop = 0;
        let activeId = prevState.activeGroupId;
        for (const group of newGroups) {
            if (!group.hasData) continue;
            const prev = prevState.groups.find(g => g.id === group.id);
            if (prev && prev.hasData) {
                const drop = prev.remaining - group.remaining;
                if (drop > maxDrop && drop > ACTIVE_GROUP_THRESHOLD) {
                    maxDrop = drop;
                    activeId = group.id;
                }
            }
        }
        return activeId;
    }

    private buildChartData(activeGroupId: string, currentRemaining: number): UsageChartData {
        const config = this.configManager.getConfig();
        const displayMinutes = config["dashboard.historyRange"];
        const pollingMinutes = config["dashboard.refreshRate"] / 60;
        // The language server may report quota changes less frequently than we poll it.
        // Keep the sidebar chart readable and avoid implying per-poll precision.
        const maxChartBuckets = 24;
        const bucketMinutes = Math.max(pollingMinutes, Math.ceil(displayMinutes / maxChartBuckets));

        const rawBuckets = this.storageService.calculateUsageBuckets(
            displayMinutes,
            bucketMinutes,
            Math.max(10 * 60_000, config["dashboard.refreshRate"] * 3_000)
        );

        const groupColors: Record<string, string> = {};
        const groupLabels: Record<string, string> = {};
        this.strategyManager.getQuotaPools().forEach(pool => {
            groupColors[pool.id] = pool.themeColor;
            groupLabels[pool.id] = pool.label;
        });
        const currentPoolIds = new Set(Object.keys(groupColors));

        // Older releases recorded model groups independently. Collapse aliases into their
        // configured pool and keep the largest mirrored delta so one shared drop is counted once.
        const filteredBuckets = rawBuckets.map(bucket => {
            const usageByPool = new Map<string, number>();
            for (const item of bucket.items) {
                const poolId = this.strategyManager.getPoolIdForHistoryKey(item.groupId);
                if (!currentPoolIds.has(poolId)) continue;
                usageByPool.set(poolId, Math.max(usageByPool.get(poolId) || 0, item.usage));
            }
            return {
                ...bucket,
                items: Array.from(usageByPool, ([groupId, usage]) => ({
                    groupId,
                    usage,
                    color: groupColors[groupId] || '#888'
                }))
            };
        });

        const prediction = this.calculatePrediction(filteredBuckets, activeGroupId, currentRemaining, config);

        return {
            buckets: filteredBuckets,
            maxUsage: this.getFilteredMaxUsage(filteredBuckets),
            groupColors,
            groupLabels,
            displayMinutes,
            interval: Math.round(bucketMinutes * 60),
            prediction
        };
    }

    /**
     * Calculate max usage from filtered buckets for proper Y-axis scaling
     */
    private getFilteredMaxUsage(buckets: UsageBucket[]): number {
        let max = 0;
        for (const bucket of buckets) {
            const totalUsage = bucket.items.reduce((sum, item) => sum + item.usage, 0);
            max = Math.max(max, totalUsage);
        }
        return max || 1;
    }

    /** Human-readable runway for the usage chart when burn rate would exhaust quota before reset. */
    private formatRunwayDuration(hours: number): string {
        if (hours < 1) {
            return `~${Math.round(hours * 60)}m`;
        }
        if (hours < 24) {
            return `~${Math.round(hours)}h`;
        }
        const days = hours / 24;
        if (days < 7) {
            return `~${Math.round(days)}d`;
        }
        const weeks = Math.floor(days / 7);
        const remDays = Math.round(days - weeks * 7);
        if (remDays <= 0) {
            return `~${weeks}w`;
        }
        return `~${weeks}w ${remDays}d`;
    }

    private calculatePrediction(
        buckets: UsageBucket[],
        activeGroupId: string,
        currentRemaining: number,
        config: TfaConfig
    ): UsageChartData['prediction'] {
        // Rate restarts at the latest reset: skip buckets that ended before it
        const latestReset = this.storageService.getLatestResetTime(activeGroupId);
        let totalUsage = 0;
        for (const bucket of buckets) {
            if (latestReset !== null && bucket.endTime <= latestReset) continue;
            for (const item of bucket.items) {
                if (item.groupId === activeGroupId) totalUsage += item.usage;
            }
        }
        const historyDisplayMinutes = config["dashboard.historyRange"];
        const usageRate = (historyDisplayMinutes / 60) > 0 ? totalUsage / (historyDisplayMinutes / 60) : 0;
        let runway = 'Stable';
        if (usageRate > 0 && currentRemaining > 0) {
            const hoursUntilReset =
                this.getHoursUntilResetForGroup(activeGroupId) ?? QUOTA_RESET_HOURS_FALLBACK;
            const estimatedUsageBeforeReset = usageRate * hoursUntilReset;
            if (estimatedUsageBeforeReset >= currentRemaining) {
                const hoursUntilEmpty = currentRemaining / usageRate;
                runway = this.formatRunwayDuration(hoursUntilEmpty);
            }
        }
        const activeGroup = this.strategyManager.getQuotaPools().find(pool => pool.id === activeGroupId);
        return {
            groupId: activeGroupId,
            groupLabel: activeGroup?.label || activeGroupId,
            usageRate,
            runway,
            remaining: currentRemaining
        };
    }

    private buildDisplayItems(groups: QuotaGroupState[], groupConsumption?: Map<string, number>): QuotaDisplayItem[] {
        const config = this.configManager.getConfig();

        // Cache group order for sorting
        const strategyGroups = this.strategyManager.getGroups();
        const groupOrder = new Map(strategyGroups.map((g, i) => [g.id, i]));

        /** Format hourly consumption rate for display as subLabel */
        const historyHours = config["dashboard.historyRange"] / 60;
        const formatConsumption = (groupId: string): string | undefined => {
            if (!groupConsumption || historyHours <= 0) return undefined;
            const pp = groupConsumption.get(groupId);
            if (pp === undefined || pp <= 0) return undefined;
            const ratePerHour = pp / historyHours;
            return `🔥${ratePerHour.toFixed(1)} pp/h`;
        };

        if (config["dashboard.viewMode"] === 'models' && this._lastSnapshot) {
            const models = this._lastSnapshot.models || [];
            const hiddenGroupId = config["dashboard.includeSecondaryModels"] ? null : 'gpt';
            const filteredModels = hiddenGroupId ? models.filter(m => this.strategyManager.getGroupForModel(m.modelId, m.label).id !== hiddenGroupId) : models;

            // Sort models based on group order defined in strategy
            const sortedModels = [...filteredModels].sort((a, b) => {
                const groupA = this.strategyManager.getGroupForModel(a.modelId, a.label);
                const groupB = this.strategyManager.getGroupForModel(b.modelId, b.label);
                const orderA = groupOrder.get(groupA.id) ?? 999;
                const orderB = groupOrder.get(groupB.id) ?? 999;
                return orderA - orderB;
            });

            return sortedModels.map(m => {
                const group = this.strategyManager.getGroupForModel(m.modelId, m.label);

                // UI Sync: Force 100% if "Ready"
                const remaining = m.timeUntilReset === 'Ready' ? 100 : m.remainingPercentage;

                return {
                    id: m.modelId,
                    label: this.strategyManager.getModelDisplayName(m.modelId, m.label) || m.label || m.modelId,
                    type: 'model' as const,
                    remaining,
                    resetTime: m.timeUntilReset,
                    resetDate: this.getResetTimestamp(m),
                    hasData: true,
                    themeColor: group.themeColor,
                    subLabel: formatConsumption(group.quotaPoolId)
                };
            });
        }
        return groups.map(g => ({
            id: g.id,
            label: g.label,
            type: 'group' as const,
            remaining: g.remaining,
            resetTime: g.resetTime,
            resetDate: g.resetDate,
            hasData: g.hasData,
            themeColor: g.themeColor,
            subLabel: formatConsumption(g.id)
        }));
    }

    private async updateCacheState(cache: CacheInfo): Promise<void> {
        this._state.cache = {
            totalSize: cache.totalSize,
            brainSize: cache.brainSize,
            conversationsSize: cache.conversationsSize,
            brainCount: cache.brainCount,
            formattedTotal: formatBytes(cache.totalSize),
            formattedBrain: formatBytes(cache.brainSize),
            formattedConversations: formatBytes(cache.conversationsSize)
        };
        await this.updateTreeState(cache.brainTasks);
        await this.updateContextTreeState(cache.codeContexts);
        await this.storageService.setLastCacheSize(cache.totalSize);

        await this.persistTreeState();
    }

    private async updateContextTreeState(contexts: CodeContext[]): Promise<void> {
        this._state.tree.contexts.folders = (contexts || []).map(ctx => ({
            id: ctx.id,
            label: ctx.name || ctx.id,
            size: formatBytes(ctx.size),
            sizeBytes: ctx.size,
            lastModified: ctx.lastModified,
            expanded: this._expandedContexts.has(ctx.id),
            loading: false,
            files: []
        }));
    }

    private async updateTreeState(tasks: BrainTask[]): Promise<void> {
        this._state.tree.tasks.folders = tasks.map(task => ({
            id: task.id,
            label: task.label || `Task ${task.id.split('-')[0]}`,
            size: formatBytes(task.size),
            sizeBytes: task.size,
            lastModified: task.createdAt,
            expanded: this._expandedTasks.has(task.id),
            loading: false,
            files: []
        }));
    }

    getState(): AppState { return this._state; }

    getStatusBarData(): StatusBarData {
        const poolsConfig = this.strategyManager.getQuotaPools();
        const allGroups: StatusBarGroupItem[] = this._state.quota.groups
            .filter(g => g.hasData)
            .map(g => {
                const config = poolsConfig.find(cfg => cfg.id === g.id);
                // Find the original model info to get absolute date
                let resetDate: Date | undefined;
                if (this._lastSnapshot && this._lastSnapshot.models) {
                    const model = this.getMinModelForPool(this._lastSnapshot, g.id);
                    const timestamp = model ? this.getResetTimestamp(model) : undefined;
                    resetDate = timestamp === undefined ? undefined : new Date(timestamp);
                }

                return {
                    id: g.id,
                    label: g.label,
                    shortLabel: config?.shortLabel || g.label.substring(0, 3),
                    percentage: Math.round(g.remaining),
                    resetTime: g.resetTime,
                    resetDate: resetDate,
                    color: g.themeColor,
                    usageRate: 0,
                    runway: 'Stable'
                };
            });
        const primary = allGroups.find(g => g.id === this._state.quota.activeGroupId) || allGroups[0] || {
            id: 'unknown', label: 'Unknown', shortLabel: 'N/A', percentage: 0, resetTime: 'N/A', color: '#888', usageRate: 0, runway: 'Stable'
        };
        return { primary, allGroups };
    }

    setConnectionStatus(status: ConnectionStatus, reason?: 'no_process' | 'ambiguous' | 'no_port' | 'auth_failed' | 'workspace_mismatch' | null): void {
        this._state.connectionStatus = status;
        this._state.failureReason = status === 'failed' ? reason : null;
        this._onStateChange.fire(this._state);
    }

    /** Local 7-day usage estimate for the active pool (null when disabled or empty) */
    private buildWeeklyUsage(): WeeklyUsageData | null {
        const config = this.configManager.getConfig();
        if (!config["dashboard.showWeeklyCard"]) return null;

        const activeGroupId = this._state.quota.activeGroupId;
        const allDays = this.storageService.getDailyConsumption(
            activeGroupId,
            14,
            Math.max(10 * 60_000, config["dashboard.refreshRate"] * 3_000)
        );
        const previousDays = allDays.slice(0, 7);
        const days = allDays.slice(7);
        if (!days.some(d => d.hasData)) return null;

        const activeGroup = this.strategyManager.getQuotaPools().find(pool => pool.id === activeGroupId);
        return {
            groupId: activeGroupId,
            groupLabel: activeGroup?.label || activeGroupId,
            themeColor: activeGroup?.themeColor || '#888',
            days,
            total: days.reduce((sum, d) => sum + d.usage, 0),
            previousTotal: previousDays.some(d => d.hasData)
                ? previousDays.reduce((sum, d) => sum + d.usage, 0)
                : null
        };
    }

    getSidebarData(): SidebarData {
        const config = this.configManager.getConfig();
        return {
            quotas: this._state.quota.displayItems,
            chart: this._state.quota.chart,
            weekly: this.buildWeeklyUsage(),
            cache: this._state.cache,
            user: this._state.user,
            tokenUsage: this._state.tokenUsage,
            tasks: this._state.tree.tasks,
            contexts: this._state.tree.contexts,
            connectionStatus: this._state.connectionStatus,
            failureReason: this._state.failureReason,
            autoAcceptEnabled: this._state.automation.enabled,
            gaugeStyle: config["dashboard.gaugeStyle"],
            showUserInfoCard: this.configManager.get('dashboard.showUserInfoCard', true),
            showCreditsCard: config["dashboard.showCreditsCard"],
            uiScale: config["dashboard.uiScale"]
        };
    }

    // ==================== Cache Restoration ====================

    /**
     * Restore state from cache (for startup)
     */
    restoreFromCache(): boolean {
        const cachedQuota = this.storageService.getLastViewState<QuotaViewState>();
        const cachedSnapshot = this.storageService.getLastSnapshot<QuotaSnapshot>();
        const cachedTree = this.storageService.getLastTreeState();

        if (cachedQuota && cachedQuota.groups) {
            this._lastSnapshot = cachedSnapshot || null;
            const currentPoolIds = new Set(this.strategyManager.getQuotaPools().map(pool => pool.id));
            const cacheAlreadyUsesPools = cachedQuota.groups.every(group => currentPoolIds.has(group.id));
            const restoredGroups = cachedSnapshot?.models
                ? this.aggregateGroups(cachedSnapshot)
                : cacheAlreadyUsesPools ? cachedQuota.groups : [];

            if (restoredGroups.length > 0) {
                const restoredActiveId = this.strategyManager.getPoolIdForHistoryKey(cachedQuota.activeGroupId);
                const activeGroupId = restoredGroups.some(group => group.id === restoredActiveId)
                    ? restoredActiveId
                    : restoredGroups.find(group => group.hasData)?.id ?? restoredGroups[0]?.id ?? 'gemini';

                // Find active group's current remaining percentage
                const activeGroup = restoredGroups.find(group => group.id === activeGroupId);
                const currentRemaining = activeGroup?.remaining || 0;

                // Rebuild chart from history
                const chart = this.buildChartData(activeGroupId, currentRemaining);

                this._state.quota = {
                    ...cachedQuota,
                    groups: restoredGroups,
                    activeGroupId,
                    chart,
                    displayItems: this.buildDisplayItems(restoredGroups)
                };
            }
        }

        if (cachedTree) {
            this._state.tree.tasks.expanded = cachedTree.brainExpanded ?? false;
            this._state.tree.contexts.expanded = cachedTree.contextsExpanded ?? false;

            this._state.tree.tasks.folders = (cachedTree.brainTasks || []).map(t => ({
                id: t.id,
                label: t.title,
                size: formatBytes(typeof t.size === 'string' ? parseInt(t.size) : t.size),
                lastModified: t.lastModified,
                expanded: false,
                loading: false,
                files: []
            }));

            this._state.tree.contexts.folders = (cachedTree.codeContexts || []).map(c => ({
                id: c.id,
                label: c.name,
                size: formatBytes(typeof c.size === 'string' ? parseInt(c.size) : c.size),
                expanded: false,
                loading: false,
                files: []
            }));
        }

        // Restore cache metadata
        const cacheDetails = this.storageService.getLastCacheDetails();
        const totalSize = this.storageService.getLastCacheSize();
        this._state.cache = {
            totalSize,
            brainSize: cacheDetails.brain,
            conversationsSize: cacheDetails.workspace,
            brainCount: this._state.tree.tasks.folders.length,
            formattedTotal: formatBytes(totalSize),
            formattedBrain: formatBytes(cacheDetails.brain),
            formattedConversations: formatBytes(cacheDetails.workspace)
        };

        // Restore user info and token usage for instant startup
        const cachedUserInfo = this.storageService.getLastUserInfo<UserViewState>();
        if (cachedUserInfo) {
            this._state.user = cachedUserInfo;
        }

        const cachedTokenUsage = this.storageService.getLastTokenUsage<TokenUsageViewState>();
        if (cachedTokenUsage) {
            this._state.tokenUsage = cachedTokenUsage;
        }

        return cachedQuota !== null || cachedTree !== null;
    }

    dispose(): void {
        if (this._disposed) return;
        this._disposed = true;
        this._quotaRefreshVersion++;
        if (this._resetRefreshTimer) {
            clearTimeout(this._resetRefreshTimer);
            this._resetRefreshTimer = null;
        }
        this._onStateChange.dispose();
        this._onQuotaChange.dispose();
        this._onCacheChange.dispose();
        this._onTreeChange.dispose();
        this._disposables.forEach(d => d.dispose());
    }
}
