/**
 * StorageService: Manages persistent state and quota history
 * 
 * Implements IStorageService interface for dependency injection.
 * Uses VS Code's globalState for persistence.
 */

import * as vscode from 'vscode';
import type { IStorageService } from './interfaces';
import type { QuotaHistoryPoint, UsageBucket, CachedTreeState } from '../types/entities';

const STORAGE_KEY = 'tfa.quotaHistory_v2';
const HISTORY_DAY_COUNT = 14;
const MAX_SNAPSHOT_AGE_MS = HISTORY_DAY_COUNT * 24 * 60 * 60 * 1000;

/** Points younger than this keep raw polling granularity */
const RAW_RETENTION_MS = 24 * 60 * 60 * 1000;
/** Older points are merged down to one per slot to bound globalState size */
const DOWNSAMPLE_SLOT_MS = 5 * 60 * 1000;
/** Larger gaps represent time when the IDE was not sampling quota. */
const MAX_CONTINUOUS_SAMPLE_GAP_MS = DOWNSAMPLE_SLOT_MS * 2;

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
     * @param resets Group IDs whose quota reset was detected at this point
     */
    async recordQuotaPoint(usage: Record<string, number>, resets?: string[]): Promise<void> {
        const point: QuotaHistoryPoint = {
            timestamp: Date.now(),
            usage,
        };
        if (resets && resets.length > 0) {
            point.resets = resets;
        }

        this.history.push(point);
        await this.save();
    }

    /**
     * Per-day consumption sums for a group over the trailing `days` local
     * calendar days (today included, chronological). Deltas are computed
     * point-to-point and never span a reset marker; `hasData` distinguishes
     * "nothing consumed" from "no sampling" (IDE closed).
     */
    getDailyConsumption(
        groupId: string,
        days: number,
        maxSampleGapMs = MAX_CONTINUOUS_SAMPLE_GAP_MS
    ): { dayStart: number; usage: number; hasData: boolean }[] {
        const dayStartOf = (ts: number) => new Date(ts).setHours(0, 0, 0, 0);
        const byDay = new Map<number, { usage: number; hasData: boolean }>();

        for (let i = 1; i < this.history.length; i++) {
            const prev = this.history[i - 1];
            const curr = this.history[i];
            const startVal = prev.usage[groupId];
            const endVal = curr.usage[groupId];
            if (startVal === undefined || endVal === undefined) continue;
            if (curr.timestamp - prev.timestamp > maxSampleGapMs) continue;

            const day = dayStartOf(curr.timestamp);
            const entry = byDay.get(day) ?? { usage: 0, hasData: false };
            entry.hasData = true;
            if (!curr.resets?.includes(groupId)) {
                entry.usage += Math.max(0, startVal - endVal);
            }
            byDay.set(day, entry);
        }

        const todayStart = dayStartOf(Date.now());
        const result: { dayStart: number; usage: number; hasData: boolean }[] = [];
        for (let i = days - 1; i >= 0; i--) {
            const date = new Date(todayStart);
            date.setDate(date.getDate() - i);
            const dayStart = date.getTime();
            const entry = byDay.get(dayStart);
            result.push({ dayStart, usage: entry?.usage ?? 0, hasData: entry?.hasData ?? false });
        }
        return result;
    }

    /**
     * Timestamp of the latest recorded reset marker for a group, or null.
     */
    getLatestResetTime(groupId: string): number | null {
        for (let i = this.history.length - 1; i >= 0; i--) {
            if (this.history[i].resets?.includes(groupId)) {
                return this.history[i].timestamp;
            }
        }
        return null;
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
    calculateUsageBuckets(
        displayMinutes: number,
        bucketMinutes: number,
        maxSampleGapMs = MAX_CONTINUOUS_SAMPLE_GAP_MS
    ): UsageBucket[] {
        const now = Date.now();
        const startTime = now - displayMinutes * 60 * 1000;
        const buckets: UsageBucket[] = [];

        const bucketCount = Math.ceil(displayMinutes / bucketMinutes);
        const baselineMinutes = Math.max(bucketMinutes, Math.ceil(maxSampleGapMs / 60_000));
        const relevantHistory = this.getRecentHistory(displayMinutes + baselineMinutes);

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

            const pointsBefore = relevantHistory.filter(p => p.timestamp < bucket.startTime);
            const segmentPoints = pointsBefore.length > 0
                ? [pointsBefore[pointsBefore.length - 1], ...pointsInBucket]
                : pointsInBucket;

            // Sum only adjacent, continuously sampled deltas. Assign each delta
            // to the bucket containing its ending sample.
            if (segmentPoints.length >= 2) {
                for (const groupId of allGroupIds) {
                    let used = 0;
                    for (let j = 1; j < segmentPoints.length; j++) {
                        const prev = segmentPoints[j - 1];
                        const curr = segmentPoints[j];
                        if (curr.timestamp - prev.timestamp > maxSampleGapMs) continue;
                        if (curr.resets?.includes(groupId)) continue;
                        const startVal = prev.usage[groupId];
                        const endVal = curr.usage[groupId];
                        if (startVal === undefined || endVal === undefined) continue;
                        used += Math.max(0, startVal - endVal);
                    }
                    if (used > 0) {
                        bucket.items.push({ groupId, usage: used });
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
        return this.globalState.get<T>('tfa.lastViewState') ?? null;
    }

    async setLastViewState<T>(state: T): Promise<void> {
        await this.globalState.update('tfa.lastViewState', state);
    }

    getLastTreeState(): CachedTreeState | null {
        return this.globalState.get<CachedTreeState>('tfa.lastTreeState') ?? null;
    }

    async setLastTreeState(state: CachedTreeState): Promise<void> {
        await this.globalState.update('tfa.lastTreeState', state);
    }

    getLastSnapshot<T>(): T | null {
        const cached = this.globalState.get<{ data: T; timestamp: number }>('tfa.lastSnapshot');
        if (!cached) return null;

        // Keep the comparison window's most recent snapshot available.
        const cutoff = Date.now() - MAX_SNAPSHOT_AGE_MS;
        if (cached.timestamp < cutoff) return null;

        return cached.data;
    }

    async setLastSnapshot<T>(snapshot: T): Promise<void> {
        await this.globalState.update('tfa.lastSnapshot', {
            data: snapshot,
            timestamp: Date.now()
        });
    }

    // ==================== Metadata ====================

    getLastCacheWarningTime(): number {
        return this.globalState.get<number>('tfa.lastCacheWarningTime') ?? 0;
    }

    async setLastCacheWarningTime(time: number): Promise<void> {
        await this.globalState.update('tfa.lastCacheWarningTime', time);
    }

    getLastDisplayPercentage(): number {
        return this.globalState.get<number>('tfa.lastDisplayPercentage') ?? 0;
    }

    async setLastDisplayPercentage(pct: number): Promise<void> {
        await this.globalState.update('tfa.lastDisplayPercentage', pct);
    }

    getLastCacheSize(): number {
        return this.globalState.get<number>('tfa.lastCacheSize') ?? 0;
    }

    async setLastCacheSize(size: number): Promise<void> {
        await this.globalState.update('tfa.lastCacheSize', size);
    }

    getLastCacheDetails(): { brain: number; workspace: number } {
        return {
            brain: this.globalState.get<number>('tfa.lastBrainSize') ?? 0,
            workspace: this.globalState.get<number>('tfa.lastWorkspaceSize') ?? 0
        };
    }

    async setLastCacheDetails(brain: number, workspace: number): Promise<void> {
        await this.globalState.update('tfa.lastBrainSize', brain);
        await this.globalState.update('tfa.lastWorkspaceSize', workspace);
    }

    getLastPrediction(): { usageRate: number; runway: string; groupId: string } {
        return {
            usageRate: this.globalState.get<number>('tfa.lastUsageRate') ?? 0,
            runway: this.globalState.get<string>('tfa.lastRunway') ?? 'Stable',
            groupId: this.globalState.get<string>('tfa.lastPredictionGroup') ?? 'gemini'
        };
    }

    async setLastPrediction(usageRate: number, runway: string, groupId: string): Promise<void> {
        await this.globalState.update('tfa.lastUsageRate', usageRate);
        await this.globalState.update('tfa.lastRunway', runway);
        await this.globalState.update('tfa.lastPredictionGroup', groupId);
    }

    // ==================== User & Token Cache ====================

    /**
     * Get cached user info
     */
    getLastUserInfo<T>(): T | null {
        return this.globalState.get<T>('tfa.lastUserInfo') ?? null;
    }

    /**
     * Cache user info
     */
    async setLastUserInfo<T>(userInfo: T): Promise<void> {
        await this.globalState.update('tfa.lastUserInfo', userInfo);
    }

    /**
     * Get cached token usage
     */
    getLastTokenUsage<T>(): T | null {
        return this.globalState.get<T>('tfa.lastTokenUsage') ?? null;
    }

    /**
     * Cache token usage
     */
    async setLastTokenUsage<T>(tokenUsage: T): Promise<void> {
        await this.globalState.update('tfa.lastTokenUsage', tokenUsage);
    }

    // ==================== Core Logic ====================

    private load(): void {
        const data = this.globalState.get<QuotaHistoryPoint[]>(STORAGE_KEY);
        if (data && Array.isArray(data)) {
            const cutoff = this.getHistoryCutoff(Date.now());
            this.history = data.filter(p => p.timestamp > cutoff);
        }
    }

    private async save(): Promise<void> {
        const now = Date.now();
        const cutoff = this.getHistoryCutoff(now);
        this.history = this.downsample(this.history.filter(p => p.timestamp > cutoff), now);
        await this.globalState.update(STORAGE_KEY, this.history);
    }

    private getHistoryCutoff(now: number): number {
        const cutoffDate = new Date(now);
        cutoffDate.setHours(0, 0, 0, 0);
        // Keep one preceding local-calendar day as the baseline for the oldest
        // displayed day, including DST transitions.
        cutoffDate.setDate(cutoffDate.getDate() - HISTORY_DAY_COUNT);
        return cutoffDate.getTime();
    }

    /**
     * Merge points older than RAW_RETENTION_MS down to one per DOWNSAMPLE_SLOT_MS
     * slot (keeping the slot's latest values) so fourteen days of 30s polling stays
     * bounded. Reset markers from merged points are preserved on the kept point.
     */
    private downsample(points: QuotaHistoryPoint[], now: number): QuotaHistoryPoint[] {
        const rawCutoff = now - RAW_RETENTION_MS;
        const out: QuotaHistoryPoint[] = [];
        let currentSlot: number | null = null;

        for (const p of points) {
            if (p.timestamp > rawCutoff) {
                out.push(p);
                currentSlot = null;
                continue;
            }
            const slot = Math.floor(p.timestamp / DOWNSAMPLE_SLOT_MS);
            if (slot === currentSlot && out.length > 0) {
                const kept = out[out.length - 1];
                const resets = [...new Set([...(kept.resets ?? []), ...(p.resets ?? [])])];
                const merged: QuotaHistoryPoint = { timestamp: p.timestamp, usage: p.usage };
                if (resets.length > 0) merged.resets = resets;
                out[out.length - 1] = merged;
            } else {
                out.push(p);
                currentSlot = slot;
            }
        }
        return out;
    }

    async clear(): Promise<void> {
        this.history = [];
        await this.globalState.update(STORAGE_KEY, []);
    }

    get count(): number {
        return this.history.length;
    }

}
