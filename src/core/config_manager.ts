/**
 * ConfigManager: Handles reading gagp.* configuration settings
 *
 * Architecture: Uses dependency injection for testability.
 * - IConfigReader: Abstract interface for reading config values
 * - ConfigManager: Pure business logic, no vscode dependency
 * - VscodeConfigReader: VS Code implementation (in extension.ts)
 */

import { GagpConfig } from "../utils/types";

// Re-export types for backward compatibility
export type { GagpConfig };

/** Minimum polling interval in seconds */
export const MIN_POLLING_INTERVAL = 60;

/** Minimum cache check interval in seconds */
export const MIN_CACHE_CHECK_INTERVAL = 30;

/**
 * Configuration reader interface - abstracts config source
 */
export interface IConfigReader {
  get<T>(key: string, defaultValue: T): T;
}

/**
 * Disposable interface for resource cleanup
 */
export interface IDisposable {
  dispose(): void;
}

/**
 * ConfigManager: Pure configuration logic without VS Code dependency
 */
export class ConfigManager {
  constructor(private readonly reader: IConfigReader) {}

  getConfig(): GagpConfig {
    const rawPollingInterval = this.reader.get<number>("pollingInterval", 120);
    const pollingInterval = Math.max(rawPollingInterval, MIN_POLLING_INTERVAL);

    const rawCacheCheckInterval = this.reader.get<number>("cacheCheckInterval", 120);
    const cacheCheckInterval = Math.max(rawCacheCheckInterval, MIN_CACHE_CHECK_INTERVAL);

    return {
      // Status Bar Settings
      statusBarShowQuota: this.reader.get<boolean>("statusBarShowQuota", true),
      statusBarShowCache: this.reader.get<boolean>("statusBarShowCache", true),
      statusBarStyle: this.reader.get<"percentage" | "resetTime" | "used" | "remaining">("statusBarStyle", "percentage"),
      statusBarThresholdWarning: this.reader.get<number>("statusBarThresholdWarning", 30),
      statusBarThresholdCritical: this.reader.get<number>("statusBarThresholdCritical", 10),
      // Quota Settings
      pollingInterval,
      visualizationMode: this.reader.get<"groups" | "models">("visualizationMode", "groups"),
      showGptQuota: this.reader.get<boolean>("showGptQuota", false),
      historyDisplayMinutes: this.reader.get<number>("historyDisplayMinutes", 60),
      // Cache Settings
      cacheCheckInterval,
      cacheWarningThreshold: this.reader.get<number>("cacheWarningThreshold", 500),
      cacheHideEmptyFolders: this.reader.get<boolean>("cacheHideEmptyFolders", false),
      autoCleanCache: this.reader.get<boolean>("autoCleanCache", false),
      // Debug Settings
      debugMode: this.reader.get<boolean>("debugMode", false),
    };
  }

  get<T>(key: string, defaultValue: T): T {
    return this.reader.get<T>(key, defaultValue);
  }
}

