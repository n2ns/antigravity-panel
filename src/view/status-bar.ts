/**
 * StatusBarManager: Encapsulates status bar UI
 * 
 * Subscribes to AppViewModel for updates.
 */

import * as vscode from "vscode";
import { AppViewModel } from "../view-model/app.vm";
import { StatusBarData, StatusBarGroupItem } from "../view-model/types";
import { ConfigManager } from "../shared/config/config_manager";
import { formatBytes } from "../shared/utils/format";

export class StatusBarManager implements vscode.Disposable {
    private item: vscode.StatusBarItem;
    private _disposables: vscode.Disposable[] = [];

    constructor(
        private readonly viewModel: AppViewModel,
        private readonly configManager: ConfigManager
    ) {
        this.item = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            100
        );
        this.item.command = "tfa.openPanel";

        // Subscribe to state changes
        this._disposables.push(
            this.viewModel.onStateChange(() => this.update()),
            this.viewModel.onQuotaChange(() => this.update()),
            this.viewModel.onCacheChange(() => this.update())
        );
    }

    showLoading(): void {
        this.item.text = "$(sync~spin) TFA";
        this.item.tooltip = "Toolkit: Detecting...";
        this.item.show();
    }

    showError(message: string): void {
        this.item.text = "$(warning) TFA";
        this.item.tooltip = `Toolkit: ${message}`;
        this.item.show();
    }

    /**
     * Update StatusBar from ViewModel data
     */
    update(): void {
        const config = this.configManager.getConfig();
        const appState = this.viewModel.getState();
        const statusData = this.viewModel.getStatusBarData();
        const cache = appState.cache;

        // Show if either quota or cache is enabled
        if (config["status.showQuota"] || config["status.showCache"]) {
            this.render(
                statusData,
                cache,
                config["status.showQuota"],
                config["status.showCache"],
                config["status.scope"],
                config["status.warningThreshold"],
                config["status.criticalThreshold"],
                config["dashboard.includeSecondaryModels"]
            );
        } else {
            this.item.hide();
        }
    }

    private render(
        statusData: StatusBarData,
        cache: { totalSize: number } | null,
        showQuota: boolean,
        showCache: boolean,
        scope: 'primary' | 'all',
        warningThreshold: number,
        criticalThreshold: number,
        includeSecondaryModels: boolean
    ): void {
        const parts: string[] = [];
        const tooltipRows: string[] = [];

        // Filter groups based on config
        const visibleGroups = statusData.allGroups.filter(g =>
            includeSecondaryModels || g.id !== 'gpt'
        );

        if (showQuota) {
            if (scope === 'all' && visibleGroups.length > 0) {
                // Display all visible groups with percentage + reset time combined
                visibleGroups.forEach(group => {
                    const statusEmoji = this.getStatusEmoji(
                        group.percentage,
                        warningThreshold,
                        criticalThreshold
                    );
                    const combinedText = this.formatCombinedDisplay(group);
                    parts.push(`${statusEmoji} ${combinedText}`);
                });
            } else {
                // Default: Display primary only (if it's not hidden)
                const primary = statusData.primary;
                if (includeSecondaryModels || primary.id !== 'gpt') {
                    const statusEmoji = this.getStatusEmoji(
                        primary.percentage,
                        warningThreshold,
                        criticalThreshold
                    );
                    const combinedText = this.formatCombinedDisplay(primary);
                    parts.push(`${statusEmoji} ${combinedText}`);
                }
            }

            // Build markdown table rows for each visible group
            visibleGroups.forEach(g => {
                const emoji = this.getStatusEmoji(g.percentage, warningThreshold, criticalThreshold);
                tooltipRows.push(`| ${emoji} ${g.label} | ${g.percentage}% |  | ⏱ ${g.resetTime} |`);
            });
        }

        if (showCache && cache) {
            parts.push(`💿 ${formatBytes(cache.totalSize)}`);
            tooltipRows.push(`| 💿 Cache | ${formatBytes(cache.totalSize)} |  | |`);
        }

        if (showQuota) {
            const credits = this.viewModel.getState().tokenUsage?.userCredits || [];
            credits.forEach(credit => {
                parts.push(`💳 ${credit.creditAmount}`);
                const label = credit.creditType
                    .split('_')
                    .map(w => w.toLowerCase() === 'ai' ? 'AI' : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
                    .join(' ');
                tooltipRows.push(`| 💳 ${label} | ${credit.creditAmount} |  | |`);
            });
        }

        if (parts.length === 0) {
            this.item.text = "$(check) TFA";
        } else {
            this.item.text = parts.join(" | ");
        }

        // Use MarkdownString with table for perfect alignment (no header)
        if (tooltipRows.length > 0) {
            const md = new vscode.MarkdownString();
            // Hidden header row (required for markdown table) + spacer column
            md.appendMarkdown('|  |  |  |  |\n');
            md.appendMarkdown('|:--|--:|:--:|:--|\n');
            md.appendMarkdown(tooltipRows.join('\n'));
            this.item.tooltip = md;
        } else {
            this.item.tooltip = "Antigravity Panel";
        }
        this.item.show();
    }

    /**
     * Combined display: always shows shortLabel + percentage + reset time
     * Example: "Flash 75% 2h 30m" or "Pro 100% Ready"
     */
    private formatCombinedDisplay(group: StatusBarGroupItem): string {
        return `${group.shortLabel} ${group.percentage}% ${group.resetTime}`;
    }

    private getStatusEmoji(
        percentage: number,
        warningThreshold: number,
        criticalThreshold: number
    ): string {
        if (percentage <= criticalThreshold) {
            return '🔴';
        } else if (percentage <= warningThreshold) {
            return '🟡';
        }
        return '🟢';
    }

    dispose(): void {
        this.item.dispose();
        this._disposables.forEach(d => d.dispose());
    }
}
