/**
 * AppViewModel: Unified application state management (MVVM architecture)
 */

import * as vscode from 'vscode';
import type { IQuotaService, ICacheService, IStorageService, IAutomationService } from '../model/services/interfaces';
import type { QuotaSnapshot, BrainTask, CacheInfo, CodeContext, FileItem } from '../model/types/entities';
import type { TfaConfig } from '../shared/utils/types';
import type { QuotaStrategyManager } from '../model/strategy';
import type { ConfigManager } from '../shared/config/config_manager';
import { formatBytes } from '../shared/utils/format';
import { QUOTA_RESET_HOURS } from '../shared/utils/constants';
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
    UsageBucket,
    TokenUsageViewState,
    ConnectionStatus,
} from './types';

export type {
    AppState,
    QuotaViewState,
    QuotaGroupState,
    QuotaDisplayItem,
    CacheViewState,
    TreeViewState,
    StatusBarData,
    StatusBarGroupItem,
    SidebarData,
    TokenUsageViewState,
};

const ACTIVE_GROUP_THRESHOLD = 0.1;

export class AppViewModel implements vscode.Disposable {
    private _state: AppState;
    private _lastSnapshot: QuotaSnapshot | null = null;
    private _disposables: vscode.Disposable[] = [];
    private _notificationCooldowns = new Map<string, number>();
    private readonly NOTIFICATION_COOLDOWN = 30 * 60 * 1000; // 30 minutes

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
    }

    private createEmptyState(): AppState {
        const groups = this.strategyManager.getGroups();
        return {
            quota: {
                groups: groups.map(g => ({
                    id: g.id,
                    label: g.label,
                    remaining: 0,
                    resetTime: 'N/A',
                    themeColor: g.themeColor,
                    hasData: false
                })),
                activeGroupId: groups[0]?.id || 'gemini-pro',
                chart: { buckets: [], maxUsage: 1, groupColors: {} },
                displayItems: groups.map(g => ({
                    id: g.id,
                    label: g.label,
                    type: 'group' as const,
                    remaining: 0,
                    resetTime: 'N/A',
                    hasData: false,
                    themeColor: g.themeColor
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

    async refresh(): Promise<void> {
        const [quota, cache] = await Promise.all([
            this.quotaService.fetchQuota(),
            this.cacheService.getCacheInfo()
        ]);
        if (quota) await this.updateQuotaState(quota);
        if (cache) await this.updateCacheState(cache);
        this._state.lastUpdated = Date.now();
        this._onStateChange.fire(this._state);
    }

    async refreshQuota(): Promise<void> {
        const quota = await this.quotaService.fetchQuota();
        if (quota) {
            await this.updateQuotaState(quota);
            this._state.connectionStatus = 'connected';
            this._onQuotaChange.fire(this._state.quota);
            this._onStateChange.fire(this._state);
        }
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

    async updateContextFiles(contextId: string): Promise<void> {
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
            await this.updateQuotaState(this._lastSnapshot);
            this._onQuotaChange.fire(this._state.quota);
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

    private async updateQuotaState(snapshot: QuotaSnapshot): Promise<void> {
        this._lastSnapshot = snapshot;
        const prevState = this._state.quota;
        const newGroups = this.aggregateGroups(snapshot);
        const activeGroupId = this.detectActiveGroup(prevState, newGroups);
        const activeGroup = newGroups.find(g => g.id === activeGroupId);
        const currentRemaining = activeGroup?.remaining || 0;

        const quotaRecord: Record<string, number> = {};
        for (const group of newGroups) {
            if (group.hasData) quotaRecord[group.id] = group.remaining;
        }
        await this.storageService.recordQuotaPoint(quotaRecord);

        const chart = this.buildChartData(activeGroupId, currentRemaining);
        const displayItems = this.buildDisplayItems(newGroups);

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
        await this.storageService.setLastSnapshot(snapshot);
        await this.storageService.setLastDisplayPercentage(Math.round(currentRemaining));
        await this.storageService.setLastPrediction(
            chart.prediction?.usageRate || 0,
            chart.prediction?.runway || 'Stable',
            activeGroupId
        );

        // Cache user info and token usage for instant startup
        if (this._state.user) {
            await this.storageService.setLastUserInfo(this._state.user);
        }
        if (this._state.tokenUsage) {
            await this.storageService.setLastTokenUsage(this._state.tokenUsage);
        }

        // Trigger notifications for the active group
        this.checkQuotaNotifications(activeGroup);
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

    private aggregateGroups(snapshot: QuotaSnapshot): QuotaGroupState[] {
        const models = snapshot.models || [];
        const groups = this.strategyManager.getGroups();

        return groups.map(group => {
            const groupModels = models.filter(m =>
                this.strategyManager.getGroupForModel(m.modelId, m.label).id === group.id
            );

            if (groupModels.length === 0) {
                return {
                    id: group.id,
                    label: group.label,
                    remaining: 0,
                    resetTime: 'N/A',
                    themeColor: group.themeColor,
                    hasData: false
                };
            }

            const minModel = groupModels.reduce((min, m) =>
                m.remainingPercentage < min.remainingPercentage ? m : min
            );

            // UI Sync: If it's "Ready", force show 100% even if server hasn't updated the fraction yet
            const isReady = minModel.timeUntilReset === 'Ready';
            const remaining = isReady ? 100 : minModel.remainingPercentage;

            return {
                id: group.id,
                label: group.label,
                remaining,
                resetTime: minModel.timeUntilReset,
                themeColor: group.themeColor,
                hasData: true
            };
        });
    }

    private detectActiveGroup(prevState: QuotaViewState, newGroups: QuotaGroupState[]): string {
        const config = this.configManager.getConfig();
        const hiddenGroupId = config["dashboard.includeSecondaryModels"] ? null : 'gpt';

        let maxDrop = 0;
        let activeId = prevState.activeGroupId;
        for (const group of newGroups) {
            // Skip hidden groups (e.g., GPT when secondary models disabled)
            if (hiddenGroupId && group.id === hiddenGroupId) continue;

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
        const hiddenGroupId = config["dashboard.includeSecondaryModels"] ? null : 'gpt';

        const buckets = this.storageService.calculateUsageBuckets(
            config["dashboard.historyRange"],
            config["dashboard.refreshRate"] / 60
        );

        const groupColors: Record<string, string> = {};
        this.strategyManager.getGroups().forEach(g => { groupColors[g.id] = g.themeColor; });

        // Filter out hidden groups and apply colors
        const filteredBuckets = buckets.map(b => ({
            ...b,
            items: b.items
                .filter(item => !hiddenGroupId || item.groupId !== hiddenGroupId)
                .map(item => ({
                    ...item,
                    color: groupColors[item.groupId] || '#888'
                }))
        }));

        const prediction = this.calculatePrediction(filteredBuckets, activeGroupId, currentRemaining, config);

        return {
            buckets: filteredBuckets,
            maxUsage: this.getFilteredMaxUsage(filteredBuckets),
            groupColors,
            displayMinutes: config["dashboard.historyRange"],
            interval: config["dashboard.refreshRate"],
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

    private calculatePrediction(
        buckets: UsageBucket[],
        activeGroupId: string,
        currentRemaining: number,
        config: TfaConfig
    ): UsageChartData['prediction'] {
        let totalUsage = 0;
        for (const bucket of buckets) {
            for (const item of bucket.items) {
                if (item.groupId === activeGroupId) totalUsage += item.usage;
            }
        }
        const historyDisplayMinutes = config["dashboard.historyRange"];
        const usageRate = (historyDisplayMinutes / 60) > 0 ? totalUsage / (historyDisplayMinutes / 60) : 0;
        let runway = 'Stable';
        if (usageRate > 0 && currentRemaining > 0) {
            const estimatedUsageBeforeReset = usageRate * QUOTA_RESET_HOURS;
            if (estimatedUsageBeforeReset >= currentRemaining) {
                const hoursUntilEmpty = currentRemaining / usageRate;
                runway = hoursUntilEmpty >= 1 ? `~${Math.round(hoursUntilEmpty)}h` : `~${Math.round(hoursUntilEmpty * 60)}m`;
            }
        }
        const activeGroup = this.strategyManager.getGroups().find(g => g.id === activeGroupId);
        return {
            groupId: activeGroupId,
            groupLabel: activeGroup?.label || activeGroupId,
            usageRate,
            runway,
            remaining: currentRemaining
        };
    }

    private buildDisplayItems(groups: QuotaGroupState[]): QuotaDisplayItem[] {
        const config = this.configManager.getConfig();
        const hiddenGroupId = config["dashboard.includeSecondaryModels"] ? null : 'gpt';

        // Cache group order for sorting
        const strategyGroups = this.strategyManager.getGroups();
        const groupOrder = new Map(strategyGroups.map((g, i) => [g.id, i]));

        if (config["dashboard.viewMode"] === 'models' && this._lastSnapshot) {
            const models = this._lastSnapshot.models || [];
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
                    hasData: true,
                    themeColor: group.themeColor
                };
            });
        }
        return groups.filter(g => g.id !== hiddenGroupId).map(g => ({
            id: g.id,
            label: g.label,
            type: 'group' as const,
            remaining: g.remaining,
            resetTime: g.resetTime,
            hasData: g.hasData,
            themeColor: g.themeColor
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
            lastModified: task.createdAt,
            expanded: this._expandedTasks.has(task.id),
            loading: false,
            files: []
        }));
    }

    getState(): AppState { return this._state; }

    getStatusBarData(): StatusBarData {
        const groupsConfig = this.strategyManager.getGroups();
        const allGroups: StatusBarGroupItem[] = this._state.quota.groups
            .filter(g => g.hasData)
            .map(g => {
                const config = groupsConfig.find(cfg => cfg.id === g.id);
                return {
                    id: g.id,
                    label: g.label,
                    shortLabel: config?.shortLabel || g.label.substring(0, 3),
                    percentage: Math.round(g.remaining),
                    resetTime: g.resetTime,
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

    getSidebarData(): SidebarData {
        const config = this.configManager.getConfig();
        return {
            quotas: this._state.quota.displayItems,
            chart: this._state.quota.chart,
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

    /**
     * Get quota display items (for compatibility)
     */
    getSidebarQuotas(): QuotaDisplayItem[] {
        return this._state.quota.displayItems;
    }

    /**
     * Get chart data (for compatibility)
     */
    getChartData(): UsageChartData {
        const config = this.configManager.getConfig();
        const hiddenGroupId = config["dashboard.includeSecondaryModels"] ? null : 'gpt';

        if (!hiddenGroupId) {
            return this._state.quota.chart;
        }

        return {
            ...this._state.quota.chart,
            buckets: this._state.quota.chart.buckets.map(bucket => ({
                ...bucket,
                items: bucket.items.filter(item => item.groupId !== hiddenGroupId)
            }))
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

            // Find active group's current remaining percentage
            const activeGroup = cachedQuota.groups.find(g => g.id === cachedQuota.activeGroupId);
            const currentRemaining = activeGroup?.remaining || 0;

            // Rebuild chart from history
            const chart = this.buildChartData(cachedQuota.activeGroupId, currentRemaining);

            this._state.quota = {
                ...cachedQuota,
                chart,
                displayItems: this.buildDisplayItems(cachedQuota.groups)
            };
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
        const cachedUserInfo = this.storageService.getLastUserInfo<typeof this._state.user>();
        if (cachedUserInfo) {
            this._state.user = cachedUserInfo;
        }

        const cachedTokenUsage = this.storageService.getLastTokenUsage<typeof this._state.tokenUsage>();
        if (cachedTokenUsage) {
            this._state.tokenUsage = cachedTokenUsage;
        }

        return cachedQuota !== null || cachedTree !== null;
    }

    dispose(): void {
        this._onStateChange.dispose();
        this._onQuotaChange.dispose();
        this._onCacheChange.dispose();
        this._onTreeChange.dispose();
        this._disposables.forEach(d => d.dispose());
    }
}
