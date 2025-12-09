/**
 * QuotaHistoryManager: Manages quota history data (refactored version)
 *
 * Features:
 * - Records quota snapshots from each polling cycle (supports arbitrary grouping)
 * - Persists to VS Code globalState
 * - Calculates usage over time periods
 * - Generates stacked bar chart data
 */

import * as vscode from "vscode";

/** Quota history data point */
export interface QuotaHistoryPoint {
  timestamp: number;
  /** Group quota remaining { groupId: percentage } */
  usage: Record<string, number>;
}

/** Bar chart data item */
export interface BucketItem {
  groupId: string;
  usage: number; // Consumed percentage
}

/** Usage time bucket */
export interface UsageBucket {
  startTime: number;
  endTime: number;
  items: BucketItem[]; // Supports multi-segment stacking
}

const STORAGE_KEY = "gagp.quotaHistory_v2"; // Upgraded key to avoid old data conflicts
const MAX_HISTORY_HOURS = 24;

export class QuotaHistoryManager {
  private history: QuotaHistoryPoint[] = [];
  private readonly globalState: vscode.Memento;

  constructor(globalState: vscode.Memento) {
    this.globalState = globalState;
    this.load();
  }

  // Simple getter/setter methods for backward compatibility

  getLastActiveCategory(): 'gemini' | 'other' {
     // Legacy compatibility - may no longer be critical
    return this.globalState.get<'gemini' | 'other'>("gagp.activeCategory") || 'gemini';
  }

  async setActiveCategory(category: 'gemini' | 'other'): Promise<void> {
    await this.globalState.update("gagp.activeCategory", category);
  }

  getLastDisplayPercentage(): number {
    return this.globalState.get<number>("gagp.lastDisplayPercentage") ?? 0;
  }

  async setLastDisplayPercentage(pct: number): Promise<void> {
    await this.globalState.update("gagp.lastDisplayPercentage", pct);
  }

  getLastCacheSize(): number {
    return this.globalState.get<number>("gagp.lastCacheSize") ?? 0;
  }

  async setLastCacheSize(size: number): Promise<void> {
    await this.globalState.update("gagp.lastCacheSize", size);
  }

  getLastCacheDetails(): { brain: number, workspace: number } {
    return {
      brain: this.globalState.get<number>("gagp.lastBrainSize") ?? 0,
      workspace: this.globalState.get<number>("gagp.lastWorkspaceSize") ?? 0
    };
  }

  async setLastCacheDetails(brain: number, workspace: number): Promise<void> {
    await this.globalState.update("gagp.lastBrainSize", brain);
    await this.globalState.update("gagp.lastWorkspaceSize", workspace);
  }

  // Prediction data cache
  getLastPrediction(): { usageRate: number; runway: string; groupId: string } {
    return {
      usageRate: this.globalState.get<number>("gagp.lastUsageRate") ?? 0,
      runway: this.globalState.get<string>("gagp.lastRunway") ?? 'Stable',
      groupId: this.globalState.get<string>("gagp.lastPredictionGroup") ?? 'gemini'
    };
  }

  async setLastPrediction(usageRate: number, runway: string, groupId: string): Promise<void> {
    await this.globalState.update("gagp.lastUsageRate", usageRate);
    await this.globalState.update("gagp.lastRunway", runway);
    await this.globalState.update("gagp.lastPredictionGroup", groupId);
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

  /**
   * Record new quota data point
   * @param usageMap { groupId: remainingPercentage }
   */
  async record(usageMap: Record<string, number>): Promise<void> {
    const point: QuotaHistoryPoint = {
      timestamp: Date.now(),
      usage: usageMap,
    };

    this.history.push(point);
    await this.save();
  }

  getRecentHistory(minutes: number): QuotaHistoryPoint[] {
    const cutoff = Date.now() - minutes * 60 * 1000;
    return this.history.filter(p => p.timestamp > cutoff);
  }

  /**
   * Calculate usage bar chart data
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
          // Simple handling: if both have values, calculate consumption
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
   * Get maximum usage (for bar chart scaling)
   */
  getMaxUsage(buckets: UsageBucket[]): number {
    let max = 0;
    for (const bucket of buckets) {
      // Total height of stacked chart is sum of all items usage
      const totalUsage = bucket.items.reduce((sum, item) => sum + item.usage, 0);
      max = Math.max(max, totalUsage);
    }
    return max || 1;
  }

  async clear(): Promise<void> {
    this.history = [];
    await this.globalState.update(STORAGE_KEY, []);
  }

  get count(): number {
    return this.history.length;
  }
}
