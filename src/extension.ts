/**
 * Antigravity Panel Extension - Main Entry Point (Refactored)
 */

import * as vscode from "vscode";
import { ProcessFinder } from "./shared/platform/process_finder";
import { QuotaService } from "./model/services/quota.service";
import { CacheService } from "./model/services/cache.service";
import { StorageService } from "./model/services/storage.service";
import { AutomationService } from "./model/services/automation.service";
import { QuotaStrategyManager } from "./model/strategy";
import { ConfigManager, IConfigReader, TfaConfig } from "./shared/config/config_manager";
import { Scheduler } from "./shared/utils/scheduler";
import { FeedbackManager } from './shared/utils/feedback_manager';
import { AppViewModel } from "./view-model/app.vm";
import { StatusBarManager } from "./view/status-bar";
import { SidebarProvider } from "./view/sidebar-provider";
import { initLogger, setDebugMode, infoLog, errorLog, getLogger } from "./shared/utils/logger";
import { formatBytes } from "./shared/utils/format";
import { CommunicationAttempt } from "./shared/utils/types";
import { getDetailedOSVersion } from "./shared/utils/platform";
import { generateCommitMessageCommand, setAnthropicApiKeyCommand } from "./commitMessageClaude";


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
  setDebugMode(configManager.get('system.debugMode', false));
  context.subscriptions.push(configReader);

  // 2. Initialize Model Services
  const strategyManager = new QuotaStrategyManager();
  const storageService = new StorageService(context.globalState);
  const cacheService = new CacheService();
  const quotaService = new QuotaService(configManager);
  const automationService = new AutomationService();
  context.subscriptions.push(automationService);

  // 3. Initialize ViewModel (The Brain)
  const appViewModel = new AppViewModel(
    quotaService,
    cacheService,
    storageService,
    configManager,
    strategyManager,
    automationService
  );
  context.subscriptions.push(appViewModel);

  // State for one-time notification
  let hasShownNotification = false;

  // External retry configuration (learned from competitor: vscode-antigravity-cockpit)
  const MAX_BOOT_RETRY = 3;
  const BOOT_RETRY_DELAY_MS = 5000;
  let bootRetryCount = 0;

  /**
   * Boot server connection with external retry mechanism
   * This provides an additional layer of retry on top of ProcessFinder's internal retries
   */
  async function bootServerConnection(): Promise<void> {
    const processFinder = new ProcessFinder();

    try {
      const serverInfo = await processFinder.detect();
      const extVersion = context.extension.packageJSON.version;
      const ideVersion = vscode.version;
      const commonMeta = {
        platform: process.platform,
        arch: process.arch,
        version: extVersion,
        ideVersion,
        processName: processFinder.getProcessName(),
        osDetailedVersion: getDetailedOSVersion()
      };

      if (serverInfo) {
        quotaService.setServerInfo(serverInfo);
        appViewModel.setConnectionStatus('connected');
        bootRetryCount = 0; // Reset on success

        // Update UI and check for parsing errors
        await appViewModel.refreshQuota();
        // Final check for parsing errors if no higher-level notification was shown
        if (!hasShownNotification && quotaService.parsingError) {
          let message = vscode.l10n.t("Server data parsing error detected, some features limited");

          // If it's an auth failure during quota fetch, show the login message
          if (quotaService.parsingError.startsWith('AUTH_FAILED')) {
            message = vscode.l10n.t("Please ensure you are logged into Antigravity IDE (Authentication failed).");
          }

          await FeedbackManager.showFeedbackNotification(message, {
            ...commonMeta,
            reason: "parsing_error",
            parsingInfo: quotaService.parsingError
          });
          hasShownNotification = true;
        }

        infoLog("Server connection established successfully");
      } else {
        // ProcessFinder internal retries failed, try external retry
        if (bootRetryCount < MAX_BOOT_RETRY) {
          bootRetryCount++;
          infoLog(`Boot retry ${bootRetryCount}/${MAX_BOOT_RETRY} in ${BOOT_RETRY_DELAY_MS / 1000}s...`);
          appViewModel.setConnectionStatus('connecting');

          setTimeout(() => {
            bootServerConnection();
          }, BOOT_RETRY_DELAY_MS);
          return;
        }

        // All retries exhausted, show failure notification
        bootRetryCount = 0;
        appViewModel.setConnectionStatus('failed');
        if (hasShownNotification) return;

        const reason = processFinder.failureReason || "unknown_failure";
        const count = processFinder.candidateCount;
        const attempts = processFinder.attemptDetails;

        const messages: Record<string, string> = {
          'no_process': vscode.l10n.t("Local server not found"),
          'ambiguous': vscode.l10n.t("Local server not found, unable to get quota reference"),
          'no_port': vscode.l10n.t("Server process found but no listening port detected"),
          'auth_failed': vscode.l10n.t("Handshake with server failed (CSRF check failed)")
        };

        let message = messages[reason];
        let parsingInfo: string | undefined;

        // Smart decision: If it's a single server but auth failed, it's likely a login issue
        if (reason === 'auth_failed' && count === 1) {
          message = vscode.l10n.t("Please ensure you are logged into Antigravity IDE (Authentication failed).");
        }

        // Collect useful diagnostic info only
        let attemptDetailsStr: string | undefined;
        if (attempts.length > 0) {
          parsingInfo = attempts
            .map(a => `PID:${a.pid} Port:${a.port} Status:${a.statusCode || 'Failed'}${a.error ? ` (${a.error})` : ''}`)
            .join('; ');
          attemptDetailsStr = JSON.stringify(attempts.slice(0, 3)); // Limit to first 3 attempts
        }

        if (message) {
          await FeedbackManager.showFeedbackNotification(message, {
            ...commonMeta,
            reason,
            candidateCount: count,
            parsingInfo,
            attemptDetails: attemptDetailsStr,
            // Enhanced diagnostics v2
            tokenPreview: processFinder.tokenPreview,
            portsFromCmdline: processFinder.portsFromCmdline,
            portsFromNetstat: processFinder.portsFromNetstat,
            protocolUsed: processFinder.protocolUsed,
            retryCount: processFinder.retryCount,
            bootRetryCount: MAX_BOOT_RETRY // Include external retry info
          });
          hasShownNotification = true;
        }
      }
    } catch (e) {
      errorLog("Server detection failed", e);

      // Also retry on exception
      if (bootRetryCount < MAX_BOOT_RETRY) {
        bootRetryCount++;
        infoLog(`Boot retry ${bootRetryCount}/${MAX_BOOT_RETRY} after error in ${BOOT_RETRY_DELAY_MS / 1000}s...`);
        appViewModel.setConnectionStatus('connecting');

        setTimeout(() => {
          bootServerConnection();
        }, BOOT_RETRY_DELAY_MS);
        return;
      }

      bootRetryCount = 0;
      appViewModel.setConnectionStatus('failed');
    }
  }

  // 3s Initial Delay to allow server to initialize ports (as per User Request)
  setTimeout(() => {
    bootServerConnection();
  }, 3000);

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
    interval: config['dashboard.refreshRate'] * 1000,
    execute: () => appViewModel.refreshQuota(),
    immediate: false, // Already did initial refresh
  });

  // State for notification cooldown
  let lastAutoCleanNotificationTime = 0;

  // Polling: Cache Check (for warnings and auto-clean)
  scheduler.register({
    name: "checkCache",
    interval: config['cache.scanInterval'] * 1000,
    execute: async () => {
      const state = appViewModel.getState();
      const currentConfig = configManager.getConfig();
      const cacheMB = state.cache.totalSize / (1024 * 1024);
      const thresholdMB = currentConfig['cache.warningSize'];

      if (cacheMB > thresholdMB) {
        // Option 1: Auto-Clean (if enabled)
        if (currentConfig['cache.autoClean']) {
          const beforeSize = formatBytes(state.cache.totalSize);
          const result = await appViewModel.performAutoClean();
          // performAutoClean already refreshes cache internally
          if (result && result.deletedCount > 0) {
            const now = Date.now();
            // Show notification once per hour
            if (now - lastAutoCleanNotificationTime > 3600 * 1000) {
              const afterState = appViewModel.getState();
              const afterSize = formatBytes(afterState.cache.totalSize);
              const message = vscode.l10n.t("Auto-clean completed. Before: {0}, After: {1}.", beforeSize, afterSize);
              const viewAction = vscode.l10n.t("View");

              vscode.window.showInformationMessage(message, viewAction).then(selection => {
                if (selection === viewAction) {
                  const brainDirPath = cacheService.getBrainDirPath();
                  vscode.env.openExternal(vscode.Uri.file(brainDirPath)).catch(err => {
                    errorLog("Failed to open brain directory", err);
                  });
                }
              });
              lastAutoCleanNotificationTime = now;
            }
          }
          // Auto-clean handled, don't show manual warning
          return;
        }

        // Option 2: Manual Warning (if auto-clean is OFF)
        const lastWarned = storageService.getLastCacheWarningTime();
        const now = Date.now();
        // Warning once per hour
        if (!lastWarned || now - lastWarned > 3600 * 1000) {
          const viewAction = vscode.l10n.t("View");
          const settingsAction = vscode.l10n.t("Settings");
          vscode.window.showWarningMessage(
            vscode.l10n.t("Cache size ({0}) exceeds threshold.", state.cache.formattedTotal),
            viewAction,
            settingsAction
          ).then(selection => {
            if (selection === viewAction) {
              const brainDirPath = cacheService.getBrainDirPath();
              vscode.env.openExternal(vscode.Uri.file(brainDirPath)).catch(err => {
                errorLog("Failed to open brain directory", err);
              });
            } else if (selection === settingsAction) {
              vscode.commands.executeCommand("tfa.openSettings");
            }
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
    scheduler.updateInterval("refreshQuota", newConfig['dashboard.refreshRate'] * 1000);
    scheduler.updateInterval("checkCache", newConfig['cache.scanInterval'] * 1000);
    setDebugMode(newConfig['system.debugMode']);

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
      vscode.commands.executeCommand("workbench.action.openSettings", "@ext:n2ns.antigravity-panel");
    }),
    vscode.commands.registerCommand("tfa.showDisclaimer", async () => {
      const isZh = vscode.env.language.startsWith('zh');
      const fileName = isZh ? "DISCLAIMER_zh.md" : "DISCLAIMER.md";
      const disclaimerUri = vscode.Uri.joinPath(context.extensionUri, fileName);
      // 使用 Markdown 预览模式打开（只读，更好的阅读体验）
      await vscode.commands.executeCommand('markdown.showPreview', disclaimerUri);
    }),
    vscode.commands.registerCommand("tfa.toggleAutoAccept", async () => {
      await appViewModel.toggleAutoAccept();
      const state = appViewModel.getState();
      if (state.automation.enabled) {
        vscode.window.showInformationMessage(vscode.l10n.t("Auto-Accept: ON - Agent steps will be accepted automatically."));
      } else {
        vscode.window.showInformationMessage(vscode.l10n.t("Auto-Accept: OFF - Manual approval required."));
      }
    }),
    // Claude commit message generator commands
    vscode.commands.registerCommand("tfa.generateCommitMessageClaude", () => generateCommitMessageCommand(context)),
    vscode.commands.registerCommand("tfa.setAnthropicApiKey", () => setAnthropicApiKeyCommand(context)),
    vscode.commands.registerCommand("tfa.runDiagnostics", async () => {
      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: vscode.l10n.t("Running Connectivity Diagnostics..."),
        cancellable: false
      }, async () => {
        const finder = new ProcessFinder();
        const start = Date.now();

        // Use default detect (with retries) but for diagnostics, 
        // we might want to see the steps
        infoLog("Diagnostic run started...");
        const result = await finder.detect({ verbose: true });
        const duration = ((Date.now() - start) / 1000).toFixed(1);

        const reason = finder.failureReason;
        const count = finder.candidateCount;
        const attempts = finder.attemptDetails;

        let summary = "";
        if (result) {
          summary = vscode.l10n.t("✅ Success: Connection established on port {0} (CSRF: {1})", result.port, result.csrfToken.substring(0, 8) + '...');
        } else {
          const reasonMap: Record<string, string> = {
            'no_process': vscode.l10n.t("No server process found."),
            'ambiguous': vscode.l10n.t("Multiple servers found but none belong to this IDE instance."),
            'no_port': vscode.l10n.t("Process found but no listening port detected."),
            'auth_failed': vscode.l10n.t("Handshake failed (possible login issue).")
          };
          summary = `❌ ${reasonMap[reason || 'unknown'] || vscode.l10n.t("Detection failed")}`;
        }

        const detailMsg = vscode.l10n.t("Found {0} candidates. Duration: {1}s.", count, duration);
        const fullMsg = `${summary}\n\n${detailMsg}`;

        const detailsBtn = vscode.l10n.t("Show Details");
        const selection = await vscode.window.showInformationMessage(fullMsg, { modal: true }, detailsBtn);

        if (selection === detailsBtn) {
          const outputChannel = getLogger();
          if (outputChannel) {
            outputChannel.appendLine(``);
            outputChannel.appendLine(`=========================================`);
            outputChannel.appendLine(`   ANTIGRAVITY CONNECTIVITY DIAGNOSTICS  `);
            outputChannel.appendLine(`=========================================`);
            outputChannel.appendLine(`Time:     ${new Date().toLocaleString()}`);
            outputChannel.appendLine(`Result:   ${result ? "✅ PASSED" : "❌ FAILED"}`);
            outputChannel.appendLine(`Reason:   ${reason || "N/A"}`);
            outputChannel.appendLine(`Duration: ${duration}s`);
            outputChannel.appendLine(`-----------------------------------------`);

            if (result) {
              outputChannel.appendLine(`ACTIVE CONNECTION:`);
              outputChannel.appendLine(`- Port:  ${result.port}`);
              outputChannel.appendLine(`- CSRF:  ${result.csrfToken.substring(0, 12)}...`);
              outputChannel.appendLine(``);
            }

            outputChannel.appendLine(`COMMUNICATION ATTEMPTS PER PID:`);

            const groupedAttempts = attempts.reduce((acc: Record<number, CommunicationAttempt[]>, curr: CommunicationAttempt) => {
              if (!acc[curr.pid]) acc[curr.pid] = [];
              acc[curr.pid].push(curr);
              return acc;
            }, {});

            Object.keys(groupedAttempts).forEach(pidStr => {
              const pid = parseInt(pidStr, 10);
              outputChannel.appendLine(`[PID ${pid}]`);
              groupedAttempts[pid].forEach((a: CommunicationAttempt) => {
                const status = a.statusCode ? `${a.statusCode}` : "FAILED";
                const errorLabel = a.error ? ` | Error: ${a.error}` : "";
                outputChannel.appendLine(`  --> Port ${a.port.toString().padEnd(5)} | Status: ${status.padEnd(3)}${errorLabel}`);
              });
            });

            outputChannel.appendLine(`=========================================`);
            outputChannel.show(true);
          }
        }
      });
    })
  );

  infoLog("Toolkit: Activation Complete");
}

export function deactivate(): void {
  scheduler?.dispose();
  infoLog("Toolkit: Deactivated");
}
