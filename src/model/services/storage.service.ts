/**
 * StorageService: Manages persistent state and quota history
 * 
 * Implements IStorageService interface for dependency injection.
 * Uses VS Code's globalState for persistence.
 */

import * as vscode from 'vscode';
import type { IStorageService } from './interfaces';
import type { QuotaHistoryPoint, UsageBucket, CachedTreeState, BucketItem } from '../types/entities';

// Re-export types for backward compatibility
export type { QuotaHistoryPoint, UsageBucket, CachedTreeState, BucketItem };

const STORAGE_KEY = 'gagp.quotaHistory_v2';
const MAX_HISTORY_HOURS = 24 * 7; // 7 days

/**
 * StorageService implementation
 */
export class StorageService implements IStorageService {
    private history: QuotaHistoryPoint[] = [];
    private readonly globalState: vscode.Memento;

    constructor(globalState: vscode.Memento) {
        this.globalState = globalState;
        this.load();
    }

    // ==================== Quota History ====================

    /**
     * Record a quota data point
     */
    async recordQuotaPoint(usage: Record<string, number>): Promise<void> {
        const point: QuotaHistoryPoint = {
            timestamp: Date.now(),
            usage,
        };

        this.history.push(point);
        await this.save();
    }

    /**
     * Get recent history points
     */
    getRecentHistory(minutes: number): QuotaHistoryPoint[] {
        const cutoff = Date.now() - minutes * 60 * 1000;
        return this.history.filter(p => p.timestamp > cutoff);
    }

    /**
     * Calculate usage buckets for chart display
     */
    calculateUsageBuckets(displayMinutes: number, bucketMinutes: number): UsageBucket[] {
        const now = Date.now();
        const startTime = now - displayMinutes * 60 * 1000;
        const buckets: UsageBucket[] = [];

        const bucketCount = Math.ceil(displayMinutes / bucketMinutes);
        const relevantHistory = this.getRecentHistory(displayMinutes + bucketMinutes);

        // Collect all Group IDs that have appeared to ensure complete Map structure
        const allGroupIds = new Set<string>();
        relevantHistory.forEach(p => Object.keys(p.usage).forEach(k => allGroupIds.add(k)));

        for (let i = 0; i < bucketCount; i++) {
            const bucketStart = startTime + i * bucketMinutes * 60 * 1000;
            const bucketEnd = Math.min(bucketStart + bucketMinutes * 60 * 1000, now);

            const bucket: UsageBucket = {
                startTime: bucketStart,
                endTime: bucketEnd,
                items: []
            };

            // Find points within this time bucket
            const pointsInBucket = relevantHistory.filter(
                p => p.timestamp >= bucket.startTime && p.timestamp < bucket.endTime
            );

            // Determine Start and End values
            let startPoint: QuotaHistoryPoint | null = null;
            let endPoint: QuotaHistoryPoint | null = null;

            const pointsBefore = relevantHistory.filter(p => p.timestamp < bucket.startTime);
            if (pointsBefore.length > 0) {
                startPoint = pointsBefore[pointsBefore.length - 1];
                endPoint = pointsInBucket.length > 0 ? pointsInBucket[pointsInBucket.length - 1] : null;
            } else if (pointsInBucket.length >= 2) {
                startPoint = pointsInBucket[0];
                endPoint = pointsInBucket[pointsInBucket.length - 1];
            }

            // Calculate Delta for each Group
            if (startPoint && endPoint) {
                for (const groupId of allGroupIds) {
                    const startVal = startPoint.usage[groupId] ?? 0;
                    const endVal = endPoint.usage[groupId] ?? 0;
                    // Only calculate when both values exist to avoid jumps from mixing old and new data
                    if (startPoint.usage[groupId] !== undefined && endPoint.usage[groupId] !== undefined) {
                        const used = Math.max(0, startVal - endVal);
                        if (used > 0) {
                            bucket.items.push({ groupId, usage: used });
                        }
                    }
                }
            }

            buckets.push(bucket);
        }

        return buckets;
    }

    /**
     * Get maximum usage value for chart scaling
     */
    getMaxUsage(buckets: UsageBucket[]): number {
        let max = 0;
        for (const bucket of buckets) {
            const totalUsage = bucket.items.reduce((sum, item) => sum + item.usage, 0);
            max = Math.max(max, totalUsage);
        }
        return max || 1;
    }

    // ==================== View State Cache ====================

    getLastViewState<T>(): T | null {
        return this.globalState.get<T>('gagp.lastViewState') ?? null;
    }

    async setLastViewState<T>(state: T): Promise<void> {
        await this.globalState.update('gagp.lastViewState', state);
    }

    getLastTreeState(): CachedTreeState | null {
        return this.globalState.get<CachedTreeState>('gagp.lastTreeState') ?? null;
    }

    async setLastTreeState(state: CachedTreeState): Promise<void> {
        await this.globalState.update('gagp.lastTreeState', state);
    }

    getLastSnapshot<T>(): T | null {
        const cached = this.globalState.get<{ data: T; timestamp: number }>('gagp.lastSnapshot');
        if (!cached) return null;

        // Apply 7-day expiry
        const cutoff = Date.now() - MAX_HISTORY_HOURS * 60 * 60 * 1000;
        if (cached.timestamp < cutoff) return null;

        return cached.data;
    }

    async setLastSnapshot<T>(snapshot: T): Promise<void> {
        await this.globalState.update('gagp.lastSnapshot', {
            data: snapshot,
            timestamp: Date.now()
        });
    }

    // ==================== Metadata ====================

    getLastCacheWarningTime(): number {
        return this.globalState.get<number>('gagp.lastCacheWarningTime') ?? 0;
    }

    async setLastCacheWarningTime(time: number): Promise<void> {
        await this.globalState.update('gagp.lastCacheWarningTime', time);
    }

    getLastDisplayPercentage(): number {
        return this.globalState.get<number>('gagp.lastDisplayPercentage') ?? 0;
    }

    async setLastDisplayPercentage(pct: number): Promise<void> {
        await this.globalState.update('gagp.lastDisplayPercentage', pct);
    }

    getLastCacheSize(): number {
        return this.globalState.get<number>('gagp.lastCacheSize') ?? 0;
    }

    async setLastCacheSize(size: number): Promise<void> {
        await this.globalState.update('gagp.lastCacheSize', size);
    }

    getLastCacheDetails(): { brain: number; workspace: number } {
        return {
            brain: this.globalState.get<number>('gagp.lastBrainSize') ?? 0,
            workspace: this.globalState.get<number>('gagp.lastWorkspaceSize') ?? 0
        };
    }

    async setLastCacheDetails(brain: number, workspace: number): Promise<void> {
        await this.globalState.update('gagp.lastBrainSize', brain);
        await this.globalState.update('gagp.lastWorkspaceSize', workspace);
    }

    getLastPrediction(): { usageRate: number; runway: string; groupId: string } {
        return {
            usageRate: this.globalState.get<number>('gagp.lastUsageRate') ?? 0,
            runway: this.globalState.get<string>('gagp.lastRunway') ?? 'Stable',
            groupId: this.globalState.get<string>('gagp.lastPredictionGroup') ?? 'gemini'
        };
    }

    async setLastPrediction(usageRate: number, runway: string, groupId: string): Promise<void> {
        await this.globalState.update('gagp.lastUsageRate', usageRate);
        await this.globalState.update('gagp.lastRunway', runway);
        await this.globalState.update('gagp.lastPredictionGroup', groupId);
    }

    // ==================== Core Logic ====================

    private load(): void {
        const data = this.globalState.get<QuotaHistoryPoint[]>(STORAGE_KEY);
        if (data && Array.isArray(data)) {
            const cutoff = Date.now() - MAX_HISTORY_HOURS * 60 * 60 * 1000;
            this.history = data.filter(p => p.timestamp > cutoff);
        }
    }

    private async save(): Promise<void> {
        const cutoff = Date.now() - MAX_HISTORY_HOURS * 60 * 60 * 1000;
        this.history = this.history.filter(p => p.timestamp > cutoff);
        await this.globalState.update(STORAGE_KEY, this.history);
    }

    async clear(): Promise<void> {
        this.history = [];
        await this.globalState.update(STORAGE_KEY, []);
    }

    get count(): number {
        return this.history.length;
    }

    // ==================== Legacy Compatibility ====================

    /** Legacy: Get last active category */
    getLastActiveCategory(): 'gemini' | 'other' {
        return this.globalState.get<'gemini' | 'other'>('gagp.activeCategory') || 'gemini';
    }

    /** Legacy: Set active category */
    async setActiveCategory(category: 'gemini' | 'other'): Promise<void> {
        await this.globalState.update('gagp.activeCategory', category);
    }

    /** Legacy: Record quota history (same as recordQuotaPoint) */
    async record(usageMap: Record<string, number>): Promise<void> {
        return this.recordQuotaPoint(usageMap);
    }
}

// Backward compatibility: Re-export as QuotaHistoryManager
export { StorageService as QuotaHistoryManager };

// Re-export cached info types for backward compatibility
export type {
    CachedTaskInfo,
    CachedContextInfo
} from '../types/entities';
