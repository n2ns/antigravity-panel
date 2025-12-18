/**
 * Antigravity Panel Extension - Main Entry Point (Refactored)
 */

import * as vscode from "vscode";
import { ProcessFinder } from "./shared/platform/process_finder";
import { QuotaService } from "./model/services/quota.service";
import { CacheService } from "./model/services/cache.service";
import { StorageService } from "./model/services/storage.service";
import { QuotaStrategyManager } from "./model/strategy";
import { ConfigManager, IConfigReader, GagpConfig } from "./shared/config/config_manager";
import { Scheduler } from "./shared/utils/scheduler";
import { FeedbackManager } from './shared/utils/feedback_manager';
import { AppViewModel } from "./view-model/app.vm";
import { StatusBarManager } from "./view/status-bar";
import { SidebarProvider } from "./view/sidebar-provider";
import { initLogger, setDebugMode, infoLog, errorLog } from "./shared/utils/logger";


/**
 * VS Code implementation of IConfigReader
 */
class VscodeConfigReader implements IConfigReader, vscode.Disposable {
  private readonly section = "gagp";
  private disposables: vscode.Disposable[] = [];

  get<T>(key: string, defaultValue: T): T {
    const config = vscode.workspace.getConfiguration(this.section);
    return config.get<T>(key, defaultValue) as T;
  }

  async update<T>(key: string, value: T): Promise<void> {
    const config = vscode.workspace.getConfiguration(this.section);
    await config.update(key, value, vscode.ConfigurationTarget.Global);
  }

  onConfigChange(callback: (config: GagpConfig) => void, configManager: ConfigManager): vscode.Disposable {
    const disposable = vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(this.section)) {
        callback(configManager.getConfig());
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

// Service instances (kept for debugging if needed)
let scheduler: Scheduler;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  // Initialize Logger
  initLogger(context);
  infoLog("Toolkit: Activating (MVVM Refactored)...");

  // 1. Initialize Core & Configuration
  const configReader = new VscodeConfigReader();
  const configManager = new ConfigManager(configReader);
  setDebugMode(configManager.get('debugMode', false));
  context.subscriptions.push(configReader);

  // 2. Initialize Model Services
  const strategyManager = new QuotaStrategyManager();
  const storageService = new StorageService(context.globalState);
  const cacheService = new CacheService();
  const quotaService = new QuotaService(configManager);

  // 3. Initialize ViewModel (The Brain)
  const appViewModel = new AppViewModel(
    quotaService,
    cacheService,
    storageService,
    configManager,
    strategyManager
  );
  context.subscriptions.push(appViewModel);

  // State for one-time notification
  let hasShownNotification = false;

  // Detect server for QuotaService (Async, non-blocking)
  const processFinder = new ProcessFinder();

  processFinder.detect().then(async serverInfo => {
    const extVersion = context.extension.packageJSON.version;
    const commonMeta = {
      platform: process.platform,
      arch: process.arch,
      version: extVersion
    };

    if (serverInfo) {
      quotaService.setServerInfo(serverInfo);

      // Update UI and check for parsing errors
      await appViewModel.refreshQuota();
      if (!hasShownNotification && quotaService.parsingError) {
        await FeedbackManager.showFeedbackNotification(
          vscode.l10n.t("notification.parsing_error"),
          { ...commonMeta, reason: "parsing_error", parsingInfo: quotaService.parsingError }
        );
        hasShownNotification = true;
      }
    } else {
      if (hasShownNotification) return;

      const reason = processFinder.failureReason || "unknown_failure";
      const count = processFinder.candidateCount;

      const messages: Record<string, string> = {
        'no_process': vscode.l10n.t("notification.no_process"),
        'ambiguous': vscode.l10n.t("notification.ambiguous"),
        'no_port': vscode.l10n.t("notification.no_port"),
        'auth_failed': vscode.l10n.t("notification.auth_failed")
      };

      const message = messages[reason];
      if (message) {
        await FeedbackManager.showFeedbackNotification(message, {
          ...commonMeta,
          reason,
          candidateCount: count
        });
        hasShownNotification = true;
      }
    }
  }).catch(e => errorLog("Server detection failed", e));

  // 4. Initialize View Components (The Face)
  const sidebarProvider = new SidebarProvider(context.extensionUri, appViewModel);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(SidebarProvider.viewType, sidebarProvider),
    sidebarProvider
  );

  const statusBar = new StatusBarManager(appViewModel, configManager);
  context.subscriptions.push(statusBar);

  // 5. Restore State & Initial Render
  const restored = appViewModel.restoreFromCache();
  if (restored) {
    // If cache restoration success, View components will auto-update via ViewModel events
    infoLog("State restored from cache");
  } else {
    statusBar.showLoading();
  }

  // Initial Async Refresh
  appViewModel.refresh().catch(e => errorLog("Initial refresh failed", e));

  // 6. Register Scheduler & Polling
  scheduler = new Scheduler({
    onError: (taskName, error) => errorLog(`Task "${taskName}" failed`, error),
  });

  const config = configManager.getConfig();

  // Polling: Quota Refresh
  scheduler.register({
    name: "refreshQuota",
    interval: config.pollingInterval * 1000,
    execute: () => appViewModel.refreshQuota(),
    immediate: false, // Already did initial refresh
  });

  // Polling: Cache Check (for warnings)
  scheduler.register({
    name: "checkCache",
    interval: config.cacheCheckInterval * 1000,
    execute: async () => {
      // Check cache size threshold logic here or move to VM?
      // For now, let's keep simple check in extension or move to VM 'checkWarnings'
      const state = appViewModel.getState();
      const cacheMB = state.cache.totalSize / (1024 * 1024);
      if (cacheMB > config.cacheWarningThreshold) {
        const lastWarned = storageService.getLastCacheWarningTime();
        const now = Date.now();
        if (!lastWarned || now - lastWarned > 24 * 3600 * 1000) {
          vscode.window.showWarningMessage(
            `Cache size (${state.cache.formattedTotal}) exceeds threshold.`,
            "Clean Now"
          ).then(s => {
            if (s === "Clean Now") appViewModel.cleanCache();
          });
          storageService.setLastCacheWarningTime(now);
        }
      }
    },
    immediate: false
  });

  scheduler.start("refreshQuota");
  scheduler.start("checkCache");

  // Config listener to update scheduler
  configReader.onConfigChange((newConfig) => {
    scheduler.updateInterval("refreshQuota", newConfig.pollingInterval * 1000);
    scheduler.updateInterval("checkCache", newConfig.cacheCheckInterval * 1000);
    setDebugMode(newConfig.debugMode);

    // Also trigger a refresh on config change to update UI view modes
    appViewModel.onConfigurationChanged();
  }, configManager);

  // 7. Register Commands (Delegating to VM/View)
  context.subscriptions.push(
    vscode.commands.registerCommand("gagp.openPanel", () => {
      vscode.commands.executeCommand(`workbench.view.extension.gagp-sidebar`);
    }),
    vscode.commands.registerCommand("gagp.refreshQuota", () => appViewModel.refreshQuota()),
    vscode.commands.registerCommand("gagp.cleanCache", () => appViewModel.cleanCache()),
    vscode.commands.registerCommand("gagp.showCacheSize", () => {
      const state = appViewModel.getState();
      vscode.window.showInformationMessage(`Cache size: ${state.cache.formattedTotal}`);
    }),
    vscode.commands.registerCommand("gagp.openSettings", () => {
      vscode.commands.executeCommand("workbench.action.openSettings", "gagp");
    }),
    vscode.commands.registerCommand("gagp.showDisclaimer", async () => {
      const uri = vscode.Uri.joinPath(context.extensionUri, "DISCLAIMER.md");
      await vscode.commands.executeCommand("markdown.showPreview", uri);
    })
  );

  infoLog("Toolkit: Activation Complete");
}

export function deactivate(): void {
  scheduler?.dispose();
  infoLog("Toolkit: Deactivated");
}
