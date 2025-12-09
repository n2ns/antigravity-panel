/**
 * Antigravity Panel Extension - Main Entry Point
 */

import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { ProcessFinder } from "./core/process_finder";
import { QuotaManager, QuotaSnapshot } from "./core/quota_manager";
import { CacheManager } from "./core/cache_manager";
import { ConfigManager } from "./core/config_manager";
import { Scheduler } from "./core/scheduler";
import { QuotaHistoryManager } from "./core/quota_history";
import { StatusBarManager } from "./ui/status_bar";
import { SidebarProvider } from "./ui/sidebar_provider";
import { getBrainDir, getConversationsDir, getCodeTrackerActiveDir } from "./utils/paths";
import { formatBytes } from "./utils/format";
import { QuotaStrategyManager } from "./core/quota_strategy_manager";
import { initLogger, setDebugMode, infoLog, errorLog } from "./utils/logger";

// Service instances
let statusBar: StatusBarManager;
let quotaManager: QuotaManager | null = null;
let cacheManager: CacheManager;
let configManager: ConfigManager;
let scheduler: Scheduler;
let quotaHistoryManager: QuotaHistoryManager;
let sidebarProvider: SidebarProvider;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  // Initialize Logger
  initLogger(context);
  infoLog("Antigravity Panel: Activating...");

  // Initialize core services
  configManager = new ConfigManager();
  setDebugMode(configManager.get('debugMode', false));

  cacheManager = new CacheManager();
  quotaHistoryManager = new QuotaHistoryManager(context.globalState);
  statusBar = new StatusBarManager();
  statusBar.showLoading();

  // Initialize scheduler
  scheduler = new Scheduler({
    onError: (taskName, error) => {
      errorLog(`Scheduler task "${taskName}" failed`, error);
    },
  });

  // Initialize sidebar
  sidebarProvider = new SidebarProvider(context.extensionUri);

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
      const confirm = await vscode.window.showWarningMessage(
        "Are you sure you want to clean all cache? This cannot be undone.",
        { modal: true },
        "Yes, Clean All"
      );
      if (confirm === "Yes, Clean All") {
        await cacheManager.clean();
        await refreshData();
        vscode.window.showInformationMessage("Cache cleaned successfully.");
      }
    }),
    vscode.commands.registerCommand("gagp.refreshQuota", async () => {
      await refreshData();
    }),
    vscode.commands.registerCommand("gagp.openSettings", () => {
      vscode.commands.executeCommand("workbench.action.openSettings", "gagp");
    })
  );

  context.subscriptions.push(statusBar);
  context.subscriptions.push(configManager);

  // Detect Antigravity Language Server
  try {
    const processFinder = new ProcessFinder();
    const serverInfo = await processFinder.detect();
    if (serverInfo) {
      // Create QuotaManager using factory method
      quotaManager = QuotaManager.create(serverInfo);

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

  // Immediately render locally cached data (solves "disappears after restart" issue)
  const initialConfig = configManager.getConfig();
  const cachedBuckets = quotaHistoryManager.calculateUsageBuckets(
    initialConfig.historyDisplayMinutes,
    initialConfig.pollingInterval / 60
  );
  if (cachedBuckets.length > 0) {
    const maxUsage = quotaHistoryManager.getMaxUsage(cachedBuckets);
    const strategyManager = new QuotaStrategyManager();
    const coloredBuckets = cachedBuckets.map(b => ({
      ...b,
      items: b.items.map(item => ({
        ...item,
        color: strategyManager.getGroups().find(g => g.id === item.groupId)?.themeColor || '#888'
      }))
    }));

    // Get cached prediction data
    const cachedPrediction = quotaHistoryManager.getLastPrediction();
    const activeGroup = strategyManager.getGroups().find(g => g.id === cachedPrediction.groupId);

    cacheManager.getCacheInfo().then(cache => {
      sidebarProvider.update(null, cache, {
        buckets: coloredBuckets,
        maxUsage,
        displayMinutes: initialConfig.historyDisplayMinutes,
        interval: initialConfig.pollingInterval,
        prediction: cachedPrediction.usageRate > 0 ? {
          groupId: cachedPrediction.groupId,
          groupLabel: activeGroup?.label || cachedPrediction.groupId,
          usageRate: cachedPrediction.usageRate,
          runway: cachedPrediction.runway,
          remaining: quotaHistoryManager.getLastDisplayPercentage()
        } : undefined
      });
    });
  }

  // Register polling task
  const config = configManager.getConfig();
  scheduler.register({
    name: "refresh",
    interval: config.pollingInterval * 1000,
    execute: refreshData,
    immediate: true,
  });

  // Start polling
  scheduler.start("refresh");

  // Listen for configuration changes
  configManager.onConfigChange((newConfig) => {
    scheduler.updateInterval("refresh", newConfig.pollingInterval * 1000);
    setDebugMode(newConfig.debugMode);
  });

  infoLog("Antigravity Panel: Activated");
}

async function processQuotaUpdate(snapshot: QuotaSnapshot): Promise<void> {
  const config = configManager.getConfig();
  const strategyManager = new QuotaStrategyManager();
  
  // 1. Dynamically infer quota pools from server data
  const models = snapshot.models || [];
  const quotaPoolsMap = new Map<string, typeof models>();
  for (const model of models) {
    const poolKey = model.remainingPercentage.toFixed(1);
    if (!quotaPoolsMap.has(poolKey)) {
      quotaPoolsMap.set(poolKey, []);
    }
    quotaPoolsMap.get(poolKey)!.push(model);
  }

  // 2. Match quota pools to UI groups
  const poolUsageMap = new Map<'gemini' | 'other', number>();
  for (const [, poolModels] of quotaPoolsMap) {
    const poolRemaining = poolModels[0].remainingPercentage;
    let geminiCount = 0;
    let otherCount = 0;
    for (const model of poolModels) {
      const group = strategyManager.getGroupForModel(model.modelId, model.label);
      if (group.id === 'gemini') geminiCount++;
      else otherCount++;
    }
    const uiGroup: 'gemini' | 'other' = geminiCount > otherCount ? 'gemini' : 'other';
    if (poolUsageMap.has(uiGroup)) {
      poolUsageMap.set(uiGroup, Math.min(poolUsageMap.get(uiGroup)!, poolRemaining));
    } else {
      poolUsageMap.set(uiGroup, poolRemaining);
    }
  }

  const geminiAvg = poolUsageMap.get('gemini') ?? 0;
  const otherAvg = poolUsageMap.get('other') ?? 0;

  // 3. Determine active state
  
  // Note: We use persisted lastActiveCategory
  const activeCategory = quotaHistoryManager.getLastActiveCategory();
  
  const displayPct = activeCategory === 'gemini' ? geminiAvg : otherAvg;
  quotaHistoryManager.setLastDisplayPercentage(Math.round(displayPct));

  const cache = await cacheManager.getCacheInfo();
  
  statusBar.update(snapshot, cache, config.showQuota, config.showCacheSize, activeCategory, undefined, config.quotaWarningThreshold, config.quotaCriticalThreshold);

  quotaHistoryManager.setLastCacheSize(cache.totalSize);
  quotaHistoryManager.setLastCacheDetails(cache.brainSize, cache.conversationsSize);

  // 4. Record history
  const quotaPoolRecord = { gemini: geminiAvg, other: otherAvg };
  await quotaHistoryManager.record(quotaPoolRecord);

  // 5. Calculate chart data
  const buckets = quotaHistoryManager.calculateUsageBuckets(
    config.historyDisplayMinutes,
    config.pollingInterval / 60
  );

  // 6. Inject colors
  const poolColorMap: Record<string, string> = {
    gemini: '#69F0AE',
    other: '#FFAB40'
  };

  const coloredBuckets = buckets.map(b => ({
    ...b,
    items: b.items.map(item => ({
      ...item,
      color: poolColorMap[item.groupId] || '#888'
    }))
  }));

  const maxUsage = quotaHistoryManager.getMaxUsage(buckets);

  // 7. Calculate predictive analysis
  const activeGroupId = activeCategory;
  const currentRemaining = activeCategory === 'gemini' ? geminiAvg : otherAvg;

  let totalUsage = 0;
  for (const bucket of buckets) {
    for (const item of bucket.items) {
      if (item.groupId === activeGroupId) {
        totalUsage += item.usage;
      }
    }
  }

  const displayHours = config.historyDisplayMinutes / 60;
  const usageRate = displayHours > 0 ? totalUsage / displayHours : 0;
  
  let runway = 'Stable';
  if (usageRate > 0 && currentRemaining > 0) {
    const hoursUntilEmpty = currentRemaining / usageRate;
    if (hoursUntilEmpty > 168) runway = '>7d';
    else if (hoursUntilEmpty > 24) runway = `~${Math.round(hoursUntilEmpty / 24)}d`;
    else if (hoursUntilEmpty > 1) runway = `~${Math.round(hoursUntilEmpty)}h`;
    else runway = `~${Math.round(hoursUntilEmpty * 60)}m`;
  }

  quotaHistoryManager.setLastPrediction(usageRate, runway, activeGroupId);
  const activeGroup = strategyManager.getGroups().find(g => g.id === activeGroupId);

  sidebarProvider.update(snapshot, cache, {
    buckets: coloredBuckets,
    maxUsage,
    displayMinutes: config.historyDisplayMinutes,
    interval: config.pollingInterval,
    prediction: {
      groupId: activeGroupId,
      groupLabel: activeGroup?.label || activeGroupId,
      usageRate,
      runway,
      remaining: currentRemaining
    }
  });
}

async function refreshData(): Promise<void> {
  const config = configManager.getConfig();

  if (quotaManager && config.showQuota) {
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

  // Fallback: Quota fetch failed or disabled
  const cache = await cacheManager.getCacheInfo();
  const activeCategory = quotaHistoryManager.getLastActiveCategory();

  statusBar.update(null, cache, config.showQuota, config.showCacheSize, activeCategory, undefined, config.quotaWarningThreshold, config.quotaCriticalThreshold);
  
  const buckets = quotaHistoryManager.calculateUsageBuckets(
    config.historyDisplayMinutes,
    config.pollingInterval / 60
  );

  const strategyManager = new QuotaStrategyManager();
  const coloredBuckets = buckets.map(b => ({
    ...b,
    items: b.items.map(item => ({
      ...item,
      color: strategyManager.getGroups().find(g => g.id === item.groupId)?.themeColor || '#888'
    }))
  }));

  const maxUsage = quotaHistoryManager.getMaxUsage(buckets);
  
  sidebarProvider.update(null, cache, {
    buckets: coloredBuckets,
    maxUsage,
    displayMinutes: config.historyDisplayMinutes,
    interval: config.pollingInterval
  });
}

export function deactivate(): void {
  scheduler?.dispose();
  infoLog("Antigravity Panel: Deactivated");
}
