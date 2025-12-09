/**
 * ConfigManager: Handles reading and writing gagp.* configuration settings
 *
 * Note: pollingInterval has a minimum value of 60 seconds
 */

import * as vscode from "vscode";
import { GagpConfig } from "../utils/types";

// Re-export types for backward compatibility
export type { GagpConfig };

/** Minimum polling interval in seconds */
const MIN_POLLING_INTERVAL = 60;

export class ConfigManager implements vscode.Disposable {
  private readonly section = "gagp";
  private disposables: vscode.Disposable[] = [];

  getConfig(): GagpConfig {
    const config = vscode.workspace.getConfiguration(this.section);

    // Ensure polling interval is not below minimum value
    const rawPollingInterval = config.get<number>("pollingInterval", 120);
    const pollingInterval = Math.max(rawPollingInterval, MIN_POLLING_INTERVAL);

    return {
      showCacheSize: config.get<boolean>("showCacheSize", true),
      showQuota: config.get<boolean>("showQuota", true),
      pollingInterval,
      cacheWarningThreshold: config.get<number>("cacheWarningThreshold", 500),
      quotaWarningThreshold: config.get<number>("quotaWarningThreshold", 30),
      quotaCriticalThreshold: config.get<number>("quotaCriticalThreshold", 10),
      autoCleanCache: config.get<boolean>("autoCleanCache", false),
      quotaDisplayStyle: config.get<"percentage" | "resetTime" | "used" | "remaining">("quotaDisplayStyle", "percentage"),
      visualizationMode: config.get<"groups" | "models">("visualizationMode", "groups"),
      // History chart configuration
      historyDisplayMinutes: config.get<number>("historyDisplayMinutes", 60),
    };
  }

  get<T>(key: string, defaultValue: T): T {
    const config = vscode.workspace.getConfiguration(this.section);
    return config.get<T>(key, defaultValue) as T;
  }

  async update<T>(key: string, value: T): Promise<void> {
    const config = vscode.workspace.getConfiguration(this.section);
    await config.update(key, value, vscode.ConfigurationTarget.Global);
  }

  onConfigChange(callback: (config: GagpConfig) => void): vscode.Disposable {
    const disposable = vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(this.section)) {
        callback(this.getConfig());
      }
    });
    this.disposables.push(disposable);
    return disposable;
  }

  dispose(): void {
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
  }
}

