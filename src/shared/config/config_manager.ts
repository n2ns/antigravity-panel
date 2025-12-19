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

/** Default quota API path */
export const DEFAULT_QUOTA_API_PATH = "/exa.language_server_pb.LanguageServerService/GetUserStatus";

/** Default server hostname */
export const DEFAULT_SERVER_HOST = "127.0.0.1";

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
  constructor(private readonly reader: IConfigReader) { }

  getConfig(): TfaConfig {
    const rawPollingInterval = this.reader.get<number>("1_dashboard.40_refreshRate", 120);
    const pollingInterval = Math.max(rawPollingInterval, MIN_POLLING_INTERVAL);

    const rawCacheCheckInterval = this.reader.get<number>("3_system.40_scanInterval", 120);
    const cacheCheckInterval = Math.max(rawCacheCheckInterval, MIN_CACHE_CHECK_INTERVAL);

    return {
      // 1. Dashboard Settings
      "1_dashboard.10_gaugeStyle": this.reader.get<"semi-arc" | "classic-donut">("1_dashboard.10_gaugeStyle", "semi-arc"),
      "1_dashboard.20_viewMode": this.reader.get<"groups" | "models">("1_dashboard.20_viewMode", "groups"),
      "1_dashboard.30_historyRange": this.reader.get<number>("1_dashboard.30_historyRange", 90),
      "1_dashboard.40_refreshRate": pollingInterval,
      "1_dashboard.50_includeSecondaryModels": this.reader.get<boolean>("1_dashboard.50_includeSecondaryModels", false),

      // 2. Status Bar Settings
      "2_status.10_showQuota": this.reader.get<boolean>("2_status.10_showQuota", true),
      "2_status.20_showCache": this.reader.get<boolean>("2_status.20_showCache", true),
      "2_status.30_displayFormat": this.reader.get<"percentage" | "resetTime" | "used" | "remaining">("2_status.30_displayFormat", "percentage"),
      "2_status.40_warningThreshold": this.reader.get<number>("2_status.40_warningThreshold", 30),
      "2_status.50_criticalThreshold": this.reader.get<number>("2_status.50_criticalThreshold", 10),

      // 3. System & Maintenance Settings
      "3_system.10_cacheWarningSize": this.reader.get<number>("3_system.10_cacheWarningSize", 500),
      "3_system.20_autoClean": this.reader.get<boolean>("3_system.20_autoClean", false),
      "3_system.30_hideEmptyFolders": this.reader.get<boolean>("3_system.30_hideEmptyFolders", false),
      "3_system.40_scanInterval": cacheCheckInterval,
      "3_system.50_serverHost": this.reader.get<string>("3_system.50_serverHost", DEFAULT_SERVER_HOST),
      "3_system.60_apiPath": this.reader.get<string>("3_system.60_apiPath", DEFAULT_QUOTA_API_PATH),
      "3_system.99_debugMode": this.reader.get<boolean>("3_system.99_debugMode", false),
    };
  }

  get<T>(key: string, defaultValue: T): T {
    return this.reader.get<T>(key, defaultValue);
  }
}

