/**
 * Antigravity Panel Extension - Main Entry Point
 */

import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { ProcessFinder } from "./core/process_finder";
import { QuotaManager, QuotaSnapshot } from "./core/quota_manager";
import { CacheManager } from "./core/cache_manager";
import { ConfigManager, IConfigReader, IDisposable, GagpConfig } from "./core/config_manager";
import { Scheduler } from "./core/scheduler";
import { QuotaHistoryManager } from "./core/quota_history";
import { QuotaViewModel } from "./core/quota_view_model";
import { QuotaStrategyManager } from "./core/quota_strategy_manager";
import { StatusBarManager } from "./ui/status_bar";
import { SidebarProvider } from "./ui/sidebar_provider";
import { getBrainDir, getConversationsDir, getCodeTrackerActiveDir } from "./utils/paths";
import { formatBytes } from "./utils/format";
import { initLogger, setDebugMode, infoLog, errorLog } from "./utils/logger";

/**
 * VS Code implementation of IConfigReader
 * Bridges VS Code workspace configuration to ConfigManager
 */
class VscodeConfigReader implements IConfigReader, IDisposable {
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

// Service instances
let statusBar: StatusBarManager;
let quotaManager: QuotaManager | null = null;
let cacheManager: CacheManager;
let configReader: VscodeConfigReader;
let configManager: ConfigManager;
let strategyManager: QuotaStrategyManager;
let scheduler: Scheduler;
let quotaHistoryManager: QuotaHistoryManager;
let quotaViewModel: QuotaViewModel;
let sidebarProvider: SidebarProvider;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  // Initialize Logger
  initLogger(context);
  infoLog("Toolkit: Activating...");

  // Initialize core services with dependency injection
  configReader = new VscodeConfigReader();
  configManager = new ConfigManager(configReader);
  setDebugMode(configManager.get('debugMode', false));

  strategyManager = new QuotaStrategyManager();
  cacheManager = new CacheManager();
  quotaHistoryManager = new QuotaHistoryManager(context.globalState);
  quotaViewModel = new QuotaViewModel(quotaHistoryManager, configManager);
  statusBar = new StatusBarManager();

  // Initialize scheduler
  scheduler = new Scheduler({
    onError: (taskName, error) => {
      errorLog(`Scheduler task "${taskName}" failed`, error);
    },
  });

  // Initialize sidebar with dependencies
  sidebarProvider = new SidebarProvider(context.extensionUri, configManager, strategyManager);

  // Subscribe to business events: delete task
  sidebarProvider.onDeleteTask(async (taskId: string) => {
    const confirm = await vscode.window.showWarningMessage(
      "Delete this task and its conversation history?",
      { modal: true },
      "Delete"
    );
    if (confirm === "Delete") {
      try {
        // Close all files from this task if they're open in any editor
        const taskDir = `${getBrainDir()}/${taskId}`;
        const tabs = vscode.window.tabGroups.all
          .flatMap(group => group.tabs)
          .filter(tab => {
            const tabInput = tab.input;
            if (tabInput instanceof vscode.TabInputText) {
              const rel = path.relative(taskDir, tabInput.uri.fsPath);
              return !rel.startsWith('..') && !path.isAbsolute(rel);
            }
            return false;
          });
        
        for (const tab of tabs) {
          await vscode.window.tabGroups.close(tab);
        }

        await fs.promises.rm(`${getBrainDir()}/${taskId}`, { recursive: true, force: true });
        await fs.promises.rm(`${getConversationsDir()}/${taskId}.pb`, { force: true }).catch(() => {});
        await refreshData();
      } catch (e) {
        vscode.window.showErrorMessage(`Failed to delete task: ${e}`);
      }
    }
  });

  // Subscribe to business events: delete context
  sidebarProvider.onDeleteContext(async (contextId: string) => {
    const confirm = await vscode.window.showWarningMessage(
      "Delete this code context cache?",
      { modal: true },
      "Delete"
    );
    if (confirm === "Delete") {
      try {
        const contextPath = `${getCodeTrackerActiveDir()}/${contextId}`;

        // Close all files from this context if they're open in any editor
        const tabs = vscode.window.tabGroups.all
          .flatMap(group => group.tabs)
          .filter(tab => {
            const tabInput = tab.input;
            if (tabInput instanceof vscode.TabInputText) {
              const rel = path.relative(contextPath, tabInput.uri.fsPath);
              return !rel.startsWith('..') && !path.isAbsolute(rel);
            }
            return false;
          });

        for (const tab of tabs) {
          await vscode.window.tabGroups.close(tab);
        }

        await fs.promises.rm(contextPath, { recursive: true, force: true });
        await refreshData();
      } catch (e) {
        vscode.window.showErrorMessage(`Failed to delete context: ${e}`);
      }
    }
  });

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("gagp.sidebar", sidebarProvider),
    sidebarProvider  // Add to subscriptions to ensure dispose
  );

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand("gagp.openPanel", () => {
      vscode.commands.executeCommand("workbench.view.extension.gagp-sidebar");
    }),
    vscode.commands.registerCommand("gagp.showCacheSize", async () => {
      const cache = await cacheManager.getCacheInfo();
      vscode.window.showInformationMessage(`Cache size: ${formatBytes(cache.totalSize)}`);
    }),
    vscode.commands.registerCommand("gagp.cleanCache", async () => {
      const cache = await cacheManager.getCacheInfo();
      const action = await vscode.window.showWarningMessage(
        `Clean cache? ${cache.brainCount} brain tasks, ${cache.conversationsCount} conversations. Newest 5 brain tasks will be kept.`,
        { modal: true },
        "Open Folder",
        "Yes, Clean"
      );
      if (action === "Open Folder") {
        const brainDir = cacheManager.getBrainDirPath();
        await vscode.commands.executeCommand("revealFileInOS", vscode.Uri.file(brainDir));
      } else if (action === "Yes, Clean") {
        const deletedCount = await cacheManager.clean();
        await refreshData();
        vscode.window.showInformationMessage(
          `Cache cleaned: ${deletedCount} brain tasks removed, conversations cleared. Newest 5 brain tasks kept.`
        );
      }
    }),
    vscode.commands.registerCommand("gagp.refreshQuota", async () => {
      await refreshData();
    }),
    vscode.commands.registerCommand("gagp.openSettings", () => {
      vscode.commands.executeCommand("workbench.action.openSettings", "gagp");
    }),
    vscode.commands.registerCommand("gagp.showDisclaimer", async () => {
      const uri = vscode.Uri.joinPath(context.extensionUri, "DISCLAIMER.md");
      await vscode.commands.executeCommand("markdown.showPreview", uri);
    })
  );

  context.subscriptions.push(statusBar);
  context.subscriptions.push(configReader);

  // Detect Antigravity Language Server
  try {
    const processFinder = new ProcessFinder();
    const serverInfo = await processFinder.detect();
    if (serverInfo) {
      // Create QuotaManager using factory method with configured API path and host
      const config = configManager.getConfig();
      quotaManager = QuotaManager.create(serverInfo, config.advancedQuotaApiPath, config.advancedServerHost);

      // Setup callbacks
      quotaManager.onUpdate((snapshot) => {
        processQuotaUpdate(snapshot).catch(e => errorLog("Error in onUpdate", e));
      });

      quotaManager.onError((error) => {
        errorLog("Quota fetch error", error);
      });
    }
  } catch (e) {
    errorLog("Failed to detect Antigravity server", e);
  }

  // Cache-first startup: immediately render cached data
  const cachedState = quotaViewModel.restoreFromCache();
  const cachedTreeState = quotaHistoryManager.getLastTreeState();

  if (cachedState && cachedState.groups.some(g => g.hasData)) {
    // StatusBar: show cached quota immediately
    const config = configManager.getConfig();
    const statusData = quotaViewModel.getStatusBarData();
    statusBar.updateFromViewModel(
      statusData,
      null,
      config.statusBarShowQuota,
      config.statusBarShowCache,
      config.statusBarStyle,
      config.statusBarThresholdWarning,
      config.statusBarThresholdCritical
    );

    // Sidebar: show cached quota and tree data immediately
    sidebarProvider.updateFromCacheFirst(
      quotaViewModel.getSidebarQuotas(),
      quotaViewModel.getChartData(),
      cachedTreeState
    );

    // Then async refresh with real cache info
    cacheManager.getCacheInfo().then(async cache => {
      sidebarProvider.updateFromViewModel(
        quotaViewModel.getSidebarQuotas(),
        cache,
        quotaViewModel.getChartData()
      );
      // Update tree cache for next startup
      await updateTreeCache(cache);
    });
  } else {
    // No cache, show loading
    statusBar.showLoading();
  }

  // Register polling task
  const config = configManager.getConfig();
  scheduler.register({
    name: "refresh",
    interval: config.pollingInterval * 1000,
    execute: refreshData,
    immediate: true,
  });

  // Register cache check task (independent from quota polling)
  scheduler.register({
    name: "cacheCheck",
    interval: config.cacheCheckInterval * 1000,
    execute: checkCacheThreshold,
    immediate: false, // First check after interval, not immediately
  });

  // Start polling
  scheduler.start("refresh");
  scheduler.start("cacheCheck");

  // Listen for configuration changes
  configReader.onConfigChange((newConfig) => {
    scheduler.updateInterval("refresh", newConfig.pollingInterval * 1000);
    scheduler.updateInterval("cacheCheck", newConfig.cacheCheckInterval * 1000);
    setDebugMode(newConfig.debugMode);
  }, configManager);

  infoLog("Toolkit: Activated");
}

async function processQuotaUpdate(snapshot: QuotaSnapshot): Promise<void> {
  const config = configManager.getConfig();

  // Use ViewModel to aggregate and detect active group
  await quotaViewModel.updateFromSnapshot(snapshot);

  // Get cache info
  const cache = await cacheManager.getCacheInfo();
  quotaHistoryManager.setLastCacheSize(cache.totalSize);
  quotaHistoryManager.setLastCacheDetails(cache.brainSize, cache.conversationsSize);

  // Update StatusBar from ViewModel
  const statusData = quotaViewModel.getStatusBarData();
  statusBar.updateFromViewModel(
    statusData,
    cache,
    config.statusBarShowQuota,
    config.statusBarShowCache,
    config.statusBarStyle,
    config.statusBarThresholdWarning,
    config.statusBarThresholdCritical
  );

  // Update Sidebar from ViewModel
  sidebarProvider.updateFromViewModel(
    quotaViewModel.getSidebarQuotas(),
    cache,
    quotaViewModel.getChartData()
  );

  // Update tree cache for next startup
  await updateTreeCache(cache);
}

/** Update tree cache for cache-first startup */
async function updateTreeCache(cache: import("./utils/types").CacheInfo): Promise<void> {
  const brainTasks = cache.brainTasks.map(task => ({
    id: task.id,
    title: task.title,
    size: formatBytes(task.size || 0),
    lastModified: task.lastModified
  }));

  // Get code contexts from sidebar if available
  const codeContexts: import("./core/quota_history").CachedContextInfo[] = [];

  await quotaHistoryManager.setLastTreeState({
    brainTasks,
    codeContexts,
    lastUpdated: Date.now()
  });
}

async function refreshData(): Promise<void> {
  const config = configManager.getConfig();

  if (quotaManager && config.statusBarShowQuota) {
    try {
      const quota = await quotaManager.fetchQuota();
      if (quota) {
        // Await the processing to ensure UI is updated before returning
        await processQuotaUpdate(quota);
        return;
      }
    } catch (e) {
      errorLog("Failed to get quota", e);
    }
  }

  // Fallback: Quota fetch failed or disabled - use cached ViewModel state
  const cache = await cacheManager.getCacheInfo();

  const statusData = quotaViewModel.getStatusBarData();
  statusBar.updateFromViewModel(
    statusData,
    cache,
    config.statusBarShowQuota,
    config.statusBarShowCache,
    config.statusBarStyle,
    config.statusBarThresholdWarning,
    config.statusBarThresholdCritical
  );

  sidebarProvider.updateFromViewModel(
    quotaViewModel.getSidebarQuotas(),
    cache,
    quotaViewModel.getChartData()
  );
}

/** Check cache threshold and show warning if exceeded */
async function checkCacheThreshold(): Promise<void> {
  const config = configManager.getConfig();
  const cache = await cacheManager.getCacheInfo();
  const cacheMB = cache.totalSize / (1024 * 1024);

  if (cacheMB > config.cacheWarningThreshold) {
    // Check if we already warned within 24 hours
    const lastWarned = quotaHistoryManager.getLastCacheWarningTime();
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;

    if (!lastWarned || now - lastWarned > oneDay) {
      const action = await vscode.window.showWarningMessage(
        `Cache size (${formatBytes(cache.totalSize)}) exceeds threshold (${config.cacheWarningThreshold}MB). Consider cleaning.`,
        "Clean Now",
        "Remind Later"
      );

      if (action === "Clean Now") {
        await vscode.commands.executeCommand("gagp.cleanCache");
      }

      // Record warning time (even if user dismissed or clicked "Remind Later")
      await quotaHistoryManager.setLastCacheWarningTime(now);
    }
  }
}

export function deactivate(): void {
  scheduler?.dispose();
  infoLog("Toolkit: Deactivated");
}
