/**
 * StatusBarManager: Encapsulates status bar UI
 */

import * as vscode from "vscode";
import { QuotaSnapshot, ModelQuotaInfo } from "../core/quota_manager";
import { CacheInfo } from "../core/cache_manager";
import { formatBytes } from "../utils/format";

export class StatusBarManager implements vscode.Disposable {
  private item: vscode.StatusBarItem;

  constructor() {
    this.item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    this.item.command = "gagp.openPanel";
  }

  showLoading(): void {
    this.item.text = "$(sync~spin) GAGP";
    this.item.tooltip = "Antigravity Panel: Detecting...";
    this.item.show();
  }

  showError(message: string): void {
    this.item.text = "$(warning) GAGP";
    this.item.tooltip = `Antigravity Panel: ${message}`;
    this.item.show();
  }

  update(
    quota: QuotaSnapshot | null,
    cache: CacheInfo | null,
    showQuota: boolean,
    showCache: boolean,
    activeCategory: 'gemini' | 'other' = 'gemini',
    cachedPercentage?: number,
    quotaWarningThreshold?: number,
    quotaCriticalThreshold?: number
  ): void {
    const parts: string[] = [];
    const tooltipParts: string[] = [];

    if (showQuota) {
      let displayPct = 0;
      let hasQuotaData = false;

      if (quota) {
        // UI only calculates MIN for display simplicity, which is fast.
        const stats = this.getCategoryStats(quota.models, activeCategory);
        displayPct = Math.round(stats.min);
        hasQuotaData = true;
      } else if (cachedPercentage !== undefined) {
        displayPct = cachedPercentage;
        hasQuotaData = true;
      }

      if (hasQuotaData) {
        parts.push(`${displayPct}%`);

        // Warning color
        if (quotaCriticalThreshold !== undefined && displayPct < quotaCriticalThreshold) {
            this.item.backgroundColor = new vscode.ThemeColor("statusBarItem.errorBackground");
        } else if (quotaWarningThreshold !== undefined && displayPct < quotaWarningThreshold) {
            this.item.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
        } else {
            this.item.backgroundColor = undefined;
        }

        // Tooltip details
        // Tooltip details
        tooltipParts.push(
          `Active: ${activeCategory === 'gemini' ? 'Gemini' : 'Claude'}`,
          `Quota:  ${displayPct}%`
        );
      }
    }

    if (showCache && cache) {
      parts.push(formatBytes(cache.totalSize));
      tooltipParts.push(`Cache: ${formatBytes(cache.totalSize)}`);
    }

    if (parts.length === 0) {
      this.item.text = "$(dashboard) GAGP";
    } else {
      this.item.text = `$(dashboard) ${parts.join(" | ")}`;
    }

    this.item.tooltip = tooltipParts.join("\n");
    this.item.show();
  }

  private getCategoryStats(models: ModelQuotaInfo[], category: 'gemini' | 'other') {
    const filtered = models.filter((m) => 
      category === 'gemini' 
        ? m.label.toLowerCase().includes("gemini")
        : !m.label.toLowerCase().includes("gemini")
    );

    if (filtered.length === 0) return { min: 0 };

    const min = filtered.reduce((m, item) => Math.min(m, item.remainingPercentage), 100);
    return { min };
  }

  dispose(): void {
    this.item.dispose();
  }
}

