/**
 * ConfigManager: Handles reading tfa.* configuration settings
 *
 * Architecture: Uses dependency injection for testability.
 * - IConfigReader: Abstract interface for reading config values
 * - ConfigManager: Pure business logic, no vscode dependency
 * - VscodeConfigReader: VS Code implementation (in extension.ts)
 */

import type { TfaConfig } from "../utils/types";

/** Minimum polling interval in seconds */
export const MIN_POLLING_INTERVAL = 30;

/** Minimum cache check interval in seconds */
export const MIN_CACHE_CHECK_INTERVAL = 30;

/** Minimum auto-accept interval in milliseconds */
const MIN_AUTO_ACCEPT_INTERVAL = 200;

/** Clamp a numeric setting to its declared range, falling back to the default for non-numbers */
function clampNumber(value: unknown, defaultValue: number, min: number, max = Infinity): number {
  if (typeof value !== "number" || Number.isNaN(value)) return defaultValue;
  return Math.min(Math.max(value, min), max);
}

/** Default quota API path */
const DEFAULT_QUOTA_API_PATH = "/exa.language_server_pb.LanguageServerService/GetUserStatus";

/** Default server hostname */
const DEFAULT_SERVER_HOST = "127.0.0.1";

/**
 * Configuration reader interface - abstracts config source
 */
export interface IConfigReader {
  get<T>(key: string, defaultValue: T): T;
  update?<T>(key: string, value: T): Promise<void>;
}

/**
 * ConfigManager: Pure configuration logic without VS Code dependency
 */
export class ConfigManager {
  constructor(private readonly reader: IConfigReader) { }

  getConfig(): TfaConfig {
    const pollingInterval = clampNumber(this.reader.get<number>("dashboard.refreshRate", 90), 90, MIN_POLLING_INTERVAL);

    const cacheCheckInterval = clampNumber(this.reader.get<number>("cache.scanInterval", 120), 120, MIN_CACHE_CHECK_INTERVAL, 600);

    const rawAutoCleanKeepCount = this.reader.get<number>("cache.autoCleanKeepCount", 5);
    const autoCleanKeepCount = typeof rawAutoCleanKeepCount === "number" && !Number.isNaN(rawAutoCleanKeepCount)
      ? Math.min(Math.max(Math.floor(rawAutoCleanKeepCount), 1), 50)
      : 5;

    return {
      // 1. Dashboard Settings
      "dashboard.gaugeStyle": this.reader.get<"semi-arc" | "classic-donut">("dashboard.gaugeStyle", "semi-arc"),
      "dashboard.viewMode": this.reader.get<"groups" | "models">("dashboard.viewMode", "groups"),
      "dashboard.historyRange": clampNumber(this.reader.get<number>("dashboard.historyRange", 90), 90, 10, 120),
      "dashboard.refreshRate": pollingInterval,
      "dashboard.includeSecondaryModels": this.reader.get<boolean>("dashboard.includeSecondaryModels", false),
      "dashboard.showCreditsCard": this.reader.get<boolean>("dashboard.showCreditsCard", false),
      "dashboard.uiScale": Math.min(Math.max(this.reader.get<number>("dashboard.uiScale", 1.0), 0.8), 2.0),
      "dashboard.showWeeklyCard": this.reader.get<boolean>("dashboard.showWeeklyCard", true),

      // 2. Status Bar Settings
      "status.showQuota": this.reader.get<boolean>("status.showQuota", true),
      "status.showCache": this.reader.get<boolean>("status.showCache", true),
      "status.warningThreshold": clampNumber(this.reader.get<number>("status.warningThreshold", 40), 40, 5, 100),
      "status.criticalThreshold": clampNumber(this.reader.get<number>("status.criticalThreshold", 20), 20, 1, 50),
      "status.scope": this.reader.get<"primary" | "all">("status.scope", "all"),

      // 3. Cache Settings
      "cache.autoClean": this.reader.get<boolean>("cache.autoClean", false),
      "cache.autoCleanKeepCount": autoCleanKeepCount,
      "cache.scanInterval": cacheCheckInterval,
      "cache.warningSize": clampNumber(this.reader.get<number>("cache.warningSize", 500), 500, 100),
      "cache.hideEmptyFolders": this.reader.get<boolean>("cache.hideEmptyFolders", false),

      // 4. System & Maintenance Settings
      "system.serverHost": this.reader.get<string>("system.serverHost", DEFAULT_SERVER_HOST),
      "system.apiPath": this.reader.get<string>("system.apiPath", DEFAULT_QUOTA_API_PATH),
      "system.debugMode": this.reader.get<boolean>("system.debugMode", false),
      "system.autoAccept": this.reader.get<boolean>("system.autoAccept", false),
      "system.autoAcceptInterval": clampNumber(
        this.reader.get<number>("system.autoAcceptInterval", 800),
        800,
        MIN_AUTO_ACCEPT_INTERVAL,
        5000
      ),
      "system.autoAcceptTerminal": this.reader.get<boolean>("system.autoAcceptTerminal", false),
      "system.notifyOnQuotaReset": this.reader.get<boolean>("system.notifyOnQuotaReset", true),
      "system.notifyOnAbnormalDrain": this.reader.get<boolean>("system.notifyOnAbnormalDrain", true),
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
