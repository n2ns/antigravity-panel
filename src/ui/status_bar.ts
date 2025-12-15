/**
 * StatusBarManager: Encapsulates status bar UI
 */

import * as vscode from "vscode";
import { CacheInfo } from "../core/cache_manager";
import { StatusBarData } from "../core/quota_view_model";
import { formatBytes } from "../utils/format";
import { GagpConfig } from "../utils/types";

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
    this.item.tooltip = "Toolkit: Detecting...";
    this.item.show();
  }

  showError(message: string): void {
    this.item.text = "$(warning) GAGP";
    this.item.tooltip = `Toolkit: ${message}`;
    this.item.show();
  }

  /**
   * Format quota display based on style setting
   */
  private formatQuotaDisplay(
    statusData: StatusBarData,
    style: GagpConfig['statusBarStyle']
  ): string {
    switch (style) {
      case 'resetTime':
        return statusData.resetTime;
      case 'used':
        return `${100 - statusData.percentage}%`;
      case 'remaining':
        return `${statusData.percentage}%`;
      case 'percentage':
      default:
        return `${statusData.percentage}%`;
    }
  }

  /**
   * Get background color based on quota percentage and thresholds
   */
  private getBackgroundColor(
    percentage: number,
    warningThreshold: number,
    criticalThreshold: number
  ): vscode.ThemeColor | undefined {
    if (percentage <= criticalThreshold) {
      return new vscode.ThemeColor('statusBarItem.errorBackground');
    } else if (percentage <= warningThreshold) {
      return new vscode.ThemeColor('statusBarItem.warningBackground');
    }
    return undefined; // Normal state, use default background
  }

  /**
   * Update StatusBar from ViewModel data (unified data source)
   */
  updateFromViewModel(
    statusData: StatusBarData,
    cache: CacheInfo | null,
    showQuota: boolean,
    showCache: boolean,
    statusBarStyle: GagpConfig['statusBarStyle'] = 'percentage',
    warningThreshold: number = 30,
    criticalThreshold: number = 10
  ): void {
    const parts: string[] = [];
    const tooltipParts: string[] = [];

    if (showQuota) {
      const displayText = this.formatQuotaDisplay(statusData, statusBarStyle);
      parts.push(displayText);

      // Tooltip always shows full details
      tooltipParts.push(
        `Active: ${statusData.label}`,
        `Remaining: ${statusData.percentage}%`,
        `Reset: ${statusData.resetTime}`,
        `Rate: ${statusData.usageRate.toFixed(1)}%/h`,
        `Runway: ${statusData.runway}`
      );

      // Set background color based on thresholds
      this.item.backgroundColor = this.getBackgroundColor(
        statusData.percentage,
        warningThreshold,
        criticalThreshold
      );
    } else {
      // No quota shown, reset background
      this.item.backgroundColor = undefined;
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

  dispose(): void {
    this.item.dispose();
  }
}

