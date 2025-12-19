/**
 * Antigravity Panel Extension - Main Entry Point (Refactored)
 */

import * as vscode from "vscode";
import { ProcessFinder } from "./shared/platform/process_finder";
import { QuotaService } from "./model/services/quota.service";
import { CacheService } from "./model/services/cache.service";
import { StorageService } from "./model/services/storage.service";
import { QuotaStrategyManager } from "./model/strategy";
import { ConfigManager, IConfigReader, TfaConfig } from "./shared/config/config_manager";
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
  private readonly section = "tfa";
  private disposables: vscode.Disposable[] = [];

  get<T>(key: string, defaultValue: T): T {
    const config = vscode.workspace.getConfiguration(this.section);
    return config.get<T>(key, defaultValue) as T;
  }

  async update<T>(key: string, value: T): Promise<void> {
    const config = vscode.workspace.getConfiguration(this.section);
    await config.update(key, value, vscode.ConfigurationTarget.Global);
  }

  onConfigChange(callback: (config: TfaConfig) => void, configManager: ConfigManager): vscode.Disposable {
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
  setDebugMode(configManager.get('3_system.99_debugMode', false));
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
      // Final check for parsing errors if no higher-level notification was shown
      if (!hasShownNotification && quotaService.parsingError) {
        let message = vscode.l10n.t("notification.parsing_error");

        // If it's an auth failure during quota fetch, show the login message
        if (quotaService.parsingError.startsWith('AUTH_FAILED')) {
          message = vscode.l10n.t("notification.login_required");
        }

        await FeedbackManager.showFeedbackNotification(message, {
          ...commonMeta,
          reason: "parsing_error",
          parsingInfo: quotaService.parsingError
        });
        hasShownNotification = true;
      }
    } else {
      if (hasShownNotification) return;

      const reason = processFinder.failureReason || "unknown_failure";
      const count = processFinder.candidateCount;
      const attempts = processFinder.attemptDetails;

      const messages: Record<string, string> = {
        'no_process': vscode.l10n.t("notification.no_process"),
        'ambiguous': vscode.l10n.t("notification.ambiguous"),
        'no_port': vscode.l10n.t("notification.no_port"),
        'auth_failed': vscode.l10n.t("notification.auth_failed")
      };

      let message = messages[reason];
      let parsingInfo: string | undefined;

      // Smart decision: If it's a single server but auth failed, it's likely a login issue
      if (reason === 'auth_failed' && count === 1) {
        message = vscode.l10n.t("notification.login_required");
      }

      // Collect useful diagnostic info only
      if (attempts.length > 0) {
        parsingInfo = attempts
          .map(a => `PID:${a.pid} Port:${a.port} Status:${a.statusCode || 'Failed'}${a.error ? ` (${a.error})` : ''}`)
          .join('; ');
      }

      if (message) {
        await FeedbackManager.showFeedbackNotification(message, {
          ...commonMeta,
          reason,
          candidateCount: count,
          parsingInfo
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
    vscode.commands.registerCommand("tfa.openPanel", () => {
      vscode.commands.executeCommand(`workbench.view.extension.tfa-sidebar`);
    }),
    vscode.commands.registerCommand("tfa.refreshQuota", async () => {
      await appViewModel.refreshQuota();
      vscode.window.showInformationMessage("Toolkit: Data Updated.");
    }),
    vscode.commands.registerCommand("tfa.restartLanguageServer", async () => {
      try {
        await vscode.commands.executeCommand("antigravity.restartLanguageServer");
        vscode.window.showInformationMessage("Toolkit: Agent Service restarted.");
      } catch (e) {
        errorLog("Failed to restart Language Server", e);
        vscode.window.showErrorMessage("Failed to restart Antigravity Agent Service.");
      }
    }),
    vscode.commands.registerCommand("tfa.restartUserStatusUpdater", async () => {
      try {
        await vscode.commands.executeCommand("antigravity.restartUserStatusUpdater");
        vscode.window.showInformationMessage("Toolkit: User status updater reset.");
      } catch (e) {
        errorLog("Failed to reset Status Updater", e);
        vscode.window.showErrorMessage("Failed to reset Antigravity status updater.");
      }
    }),
    vscode.commands.registerCommand("tfa.cleanCache", () => appViewModel.cleanCache()),
    vscode.commands.registerCommand("tfa.showCacheSize", () => {
      const state = appViewModel.getState();
      vscode.window.showInformationMessage(`Cache size: ${state.cache.formattedTotal}`);
    }),
    vscode.commands.registerCommand("tfa.openSettings", () => {
      vscode.commands.executeCommand("workbench.action.openSettings", "tfa");
    }),
    vscode.commands.registerCommand("tfa.showDisclaimer", async () => {
      const isZh = vscode.env.language.startsWith('zh');
      const fileName = isZh ? "DISCLAIMER_zh.md" : "DISCLAIMER.md";
      const url = `https://github.com/n2ns/antigravity-panel/blob/main/${fileName}`;
      await vscode.env.openExternal(vscode.Uri.parse(url));
    })
  );

  infoLog("Toolkit: Activation Complete");
}

export function deactivate(): void {
  scheduler?.dispose();
  infoLog("Toolkit: Deactivated");
}
