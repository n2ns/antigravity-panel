/**
 * ConfigManager: Handles reading tfa.* configuration settings
 *
 * Architecture: Uses dependency injection for testability.
 * - IConfigReader: Abstract interface for reading config values
 * - ConfigManager: Pure business logic, no vscode dependency
 * - VscodeConfigReader: VS Code implementation (in extension.ts)
 */

import { TfaConfig } from "../utils/types";

// Re-export types for backward compatibility
export type { TfaConfig };

/** Minimum polling interval in seconds */
export const MIN_POLLING_INTERVAL = 60;

/** Minimum cache check interval in seconds */
export const MIN_CACHE_CHECK_INTERVAL = 30;

/** Minimum auto-accept interval in milliseconds */
export const MIN_AUTO_ACCEPT_INTERVAL = 200;

/** Default quota API path */
export const DEFAULT_QUOTA_API_PATH = "/exa.language_server_pb.LanguageServerService/GetUserStatus";

/** Default server hostname */
export const DEFAULT_SERVER_HOST = "127.0.0.1";

/**
 * Configuration reader interface - abstracts config source
 */
export interface IConfigReader {
  get<T>(key: string, defaultValue: T): T;
  update?<T>(key: string, value: T): Promise<void>;
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
  constructor(private readonly reader: IConfigReader) { }

  getConfig(): TfaConfig {
    const rawPollingInterval = this.reader.get<number>("dashboard.refreshRate", 120);
    const pollingInterval = Math.max(rawPollingInterval, MIN_POLLING_INTERVAL);

    const rawCacheCheckInterval = this.reader.get<number>("cache.scanInterval", 120);
    const cacheCheckInterval = Math.max(rawCacheCheckInterval, MIN_CACHE_CHECK_INTERVAL);

    return {
      // 1. Dashboard Settings
      "dashboard.gaugeStyle": this.reader.get<"semi-arc" | "classic-donut">("dashboard.gaugeStyle", "semi-arc"),
      "dashboard.viewMode": this.reader.get<"groups" | "models">("dashboard.viewMode", "groups"),
      "dashboard.historyRange": this.reader.get<number>("dashboard.historyRange", 90),
      "dashboard.refreshRate": pollingInterval,
      "dashboard.includeSecondaryModels": this.reader.get<boolean>("dashboard.includeSecondaryModels", false),
      "dashboard.showCreditsCard": this.reader.get<boolean>("dashboard.showCreditsCard", true),
      "dashboard.uiScale": Math.min(Math.max(this.reader.get<number>("dashboard.uiScale", 1.0), 0.8), 2.0),

      // 2. Status Bar Settings
      "status.showQuota": this.reader.get<boolean>("status.showQuota", true),
      "status.showCache": this.reader.get<boolean>("status.showCache", true),
      "status.displayFormat": this.reader.get<"percentage" | "resetTime" | "used" | "remaining">("status.displayFormat", "percentage"),
      "status.warningThreshold": this.reader.get<number>("status.warningThreshold", 30),
      "status.criticalThreshold": this.reader.get<number>("status.criticalThreshold", 10),
      "status.scope": this.reader.get<"primary" | "all">("status.scope", "all"),

      // 3. Cache Settings
      "cache.autoClean": this.reader.get<boolean>("cache.autoClean", false),
      "cache.autoCleanKeepCount": this.reader.get<number>("cache.autoCleanKeepCount", 5),
      "cache.scanInterval": cacheCheckInterval,
      "cache.warningSize": this.reader.get<number>("cache.warningSize", 500),
      "cache.hideEmptyFolders": this.reader.get<boolean>("cache.hideEmptyFolders", false),

      // 4. System & Maintenance Settings
      "system.serverHost": this.reader.get<string>("system.serverHost", DEFAULT_SERVER_HOST),
      "system.apiPath": this.reader.get<string>("system.apiPath", DEFAULT_QUOTA_API_PATH),
      "system.debugMode": this.reader.get<boolean>("system.debugMode", false),
      "system.autoAccept": this.reader.get<boolean>("system.autoAccept", false),
      "system.autoAcceptInterval": Math.max(
        this.reader.get<number>("system.autoAcceptInterval", 800),
        MIN_AUTO_ACCEPT_INTERVAL
      ),
    };
  }

  get<T>(key: string, defaultValue: T): T {
    const value = this.reader.get<T>(key, defaultValue);

    // Enforce safety constraints
    if (key === "system.autoAcceptInterval" && typeof value === "number") {
      return Math.max(value, MIN_AUTO_ACCEPT_INTERVAL) as unknown as T;
    }
    if (key === "dashboard.refreshRate" && typeof value === "number") {
      return Math.max(value, MIN_POLLING_INTERVAL) as unknown as T;
    }
    if (key === "cache.scanInterval" && typeof value === "number") {
      return Math.max(value, MIN_CACHE_CHECK_INTERVAL) as unknown as T;
    }

    return value;
  }

  async update<T>(key: string, value: T): Promise<void> {
    if (this.reader.update) {
      await this.reader.update(key, value);
    }
  }
}

