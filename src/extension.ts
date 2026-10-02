/**
 * Antigravity Panel Extension - Main Entry Point (Refactored)
 */

import * as vscode from "vscode";
import { ProcessFinder } from "./shared/platform/process_finder";
import { QuotaService } from "./model/services/quota.service";
import { ConnectionService } from "./model/services/connection.service";
import { CacheService } from "./model/services/cache.service";
import { StorageService } from "./model/services/storage.service";
import { AutomationService } from "./model/services/automation.service";
import { QuotaStrategyManager } from "./model/strategy";
import { ConfigManager, IConfigReader } from "./shared/config/config_manager";
import { Scheduler } from "./shared/utils/scheduler";
import { FeedbackManager } from './shared/utils/feedback_manager';
import { AppViewModel } from "./view-model/app.vm";
import { StatusBarManager } from "./view/status-bar";
import { SidebarProvider } from "./view/sidebar-provider";
import { initLogger, setDebugMode, infoLog, errorLog, warnLog, debugLog, getLogger, logQuotaSnapshot } from "./shared/utils/logger";
import { formatBytes } from "./shared/utils/format";
import type { CommunicationAttempt, TfaConfig } from "./shared/utils/types";
import { getDetailedOSVersion, getIdeProductInfo } from "./shared/utils/platform";
import { getExpectedWorkspaceIds } from "./shared/utils/workspace_id";
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
let bootTimeoutHandle: ReturnType<typeof setTimeout> | undefined;
let connectionService: ConnectionService<ProcessFinder> | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  // === Phase 0: Logger (infallible) ===
  initLogger(context);
  infoLog("Antigravity Panel: Activating (MVVM Refactored)...");
  const ideIdentity = {
    ideName: vscode.env.appName,
    ...getIdeProductInfo(vscode.env.appRoot),
    remoteName: vscode.env.remoteName ?? "none",
  };
  infoLog(`IDE identity: ${JSON.stringify(ideIdentity)}`);

  // Mutable service references — command closures capture these variables
  // and read their current value at invocation time, not at registration time.
  // This allows commands to be registered before services are initialized.
  let configManager: ConfigManager | undefined;
  let appViewModel: AppViewModel | undefined;
  let cacheService: CacheService | undefined;
  let storageService: StorageService | undefined;

  // === Phase 1: Register Commands FIRST ===
  // Guarantees "command not found" never happens, even if Phase 2 throws.
  // Commands that depend on services use a null-guard and show a user-friendly
  // "still initializing" message instead of the cryptic VS Code error.
  context.subscriptions.push(
    vscode.commands.registerCommand("tfa.openPanel", () => {
      vscode.commands.executeCommand(`workbench.view.extension.tfa-sidebar`);
    }),
    vscode.commands.registerCommand("tfa.refreshQuota", async () => {
      if (!appViewModel) {
        vscode.window.showWarningMessage(
          vscode.l10n.t("Toolkit is still initializing or failed to start. Try reloading the window.")
        );
        return;
      }
      // refreshNow() also starts a reconnect when the fetch fails (not on HTTP 401/403)
      const result = connectionService
        ? await connectionService.refreshNow()
        : (await appViewModel.refreshQuota() ? 'ok' : 'failed');
      if (result === 'ok') {
        vscode.window.showInformationMessage("Antigravity Panel: Data Updated.");
      } else if (result === 'auth_failed') {
        vscode.window.showErrorMessage(
          vscode.l10n.t("Please ensure you are logged into Antigravity IDE (Authentication failed).")
        );
      } else if (result === 'server_error') {
        // The server answered without usable data: no reconnect is started
        vscode.window.showWarningMessage(
          vscode.l10n.t("Server data parsing error detected, some features limited")
        );
      } else {
        vscode.window.showWarningMessage(
          vscode.l10n.t("Failed to refresh quota data. Reconnecting to the language server...")
        );
      }
    }),
    vscode.commands.registerCommand("tfa.restartLanguageServer", async () => {
      try {
        await vscode.commands.executeCommand("antigravity.restartLanguageServer");
        vscode.window.showInformationMessage("Antigravity Panel: Agent Service restarted.");
        // The server needs time to come back: bounded retries, first probe delayed
        void connectionService?.reconnect({ supersede: true, delayFirstAttempt: true });
      } catch (e) {
        errorLog("Failed to restart Language Server", e);
        vscode.window.showErrorMessage("Failed to restart Antigravity Agent Service.");
      }
    }),
    vscode.commands.registerCommand("tfa.restartUserStatusUpdater", async () => {
      try {
        await vscode.commands.executeCommand("antigravity.restartUserStatusUpdater");
        vscode.window.showInformationMessage("Antigravity Panel: User status updater reset.");
      } catch (e) {
        errorLog("Failed to reset Status Updater", e);
        vscode.window.showErrorMessage("Failed to reset Antigravity status updater.");
      }
    }),
    vscode.commands.registerCommand("tfa.cleanCache", async () => {
      if (!appViewModel) return;
      await appViewModel.cleanCache();
    }),
    vscode.commands.registerCommand("tfa.showCacheSize", () => {
      if (!appViewModel) return;
      const state = appViewModel.getState();
      vscode.window.showInformationMessage(`Cache size: ${state.cache.formattedTotal}`);
    }),
    vscode.commands.registerCommand("tfa.openSettings", () => {
      vscode.commands.executeCommand("workbench.action.openSettings", "@ext:n2ns.antigravity-panel");
    }),
    vscode.commands.registerCommand("tfa.showLogs", () => {
      const logger = getLogger();
      if (logger) {
        logger.show(true); // Focus output panel
      } else {
        vscode.window.showWarningMessage("Antigravity Panel: Output channel not initialized.");
      }
    }),
    vscode.commands.registerCommand("tfa.showDisclaimer", async () => {
      const disclaimerUri = vscode.Uri.joinPath(context.extensionUri, "docs", "DISCLAIMER.md");
      // Open in Markdown preview mode (read-only, better reading experience)
      await vscode.commands.executeCommand('markdown.showPreview', disclaimerUri);
    }),
    vscode.commands.registerCommand("tfa.toggleAutoAccept", async () => {
      if (!appViewModel) return;
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
        infoLog(`IDE identity: ${JSON.stringify(ideIdentity)}`);
        const result = await finder.detect({ verbose: true });
        const duration = ((Date.now() - start) / 1000).toFixed(1);
        // Use the server found by diagnostics instead of discarding it
        if (result) void connectionService?.useServerInfo(result);

        const reason = finder.failureReason;
        const count = finder.candidateCount;
        const attempts = finder.attemptDetails;

        let summary: string;
        if (result) {
          summary = vscode.l10n.t("✅ Success: Connection established on port {0} (CSRF: {1})", result.port, result.csrfToken.substring(0, 8) + '...');
        } else {
          const reasonMap: Record<string, string> = {
            'no_process': vscode.l10n.t("No server process found."),
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
                const proto = a.protocol ? `[${a.protocol.toUpperCase()}] ` : "";
                const errorLabel = a.error ? ` | Error: ${a.error}` : "";
                outputChannel.appendLine(`  --> ${a.hostname}:${a.port.toString().padEnd(5)} | ${proto}Status: ${status.padEnd(3)}${errorLabel}`);
              });
            });

            outputChannel.appendLine(`=========================================`);
            outputChannel.show(true);
          }
        }
      });
    })
  );

  // === Phase 2: Initialize Services (fail-safe) ===
  // Wrapped in try/catch so a transient initialization error (corrupted cache,
  // config read failure, etc.) never prevents the extension from activating.
  try {
    // 1. Core & Configuration
    const configReader = new VscodeConfigReader();
    configManager = new ConfigManager(configReader);
    setDebugMode(configManager.get('system.debugMode', false));
    context.subscriptions.push(configReader);

    // 2. Model Services
    const strategyManager = new QuotaStrategyManager();
    storageService = new StorageService(context.globalState);
    cacheService = new CacheService();
    const quotaService = new QuotaService(configManager);
    const automationService = new AutomationService();
    context.subscriptions.push(automationService);

    // Register debug quota logging
    quotaService.onUpdate((snapshot) => {
      logQuotaSnapshot(snapshot);
    });
    quotaService.onError((error) => {
      errorLog("Quota fetch error", error);
    });

    // 3. ViewModel (The Brain)
    appViewModel = new AppViewModel(
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

    const MAX_BOOT_RETRY = 7;
    const BOOT_RETRY_DELAY_MS = 5000;

    const commonMetaFor = (processFinder: ProcessFinder) => ({
      platform: process.platform,
      arch: process.arch,
      version: context.extension.packageJSON.version,
      ideVersion: vscode.version,
      ...ideIdentity,
      processName: processFinder.getProcessName(),
      osDetailedVersion: getDetailedOSVersion()
    });

    /**
     * Server connection with an external retry layer on top of ProcessFinder's
     * internal retries. Used for boot and every later reconnect.
     */
    const connection = new ConnectionService<ProcessFinder>({
      createDetector: () => new ProcessFinder(),
      setServerInfo: (info) => quotaService.setServerInfo(info),
      setStatus: (status, reason) => appViewModel!.setConnectionStatus(status, reason),
      refreshQuota: async () => {
        if (await appViewModel!.refreshQuota()) return 'ok';
        const reason = quotaService.parsingError;
        if (!reason) return 'failed';
        return reason.startsWith('AUTH_FAILED') ? 'auth_failed' : 'server_error';
      },
      onAuthFailed: () => {
        warnLog(`Quota request rejected (${quotaService.parsingError}); polling continues without reconnecting`);
        vscode.window.showErrorMessage(
          vscode.l10n.t("Please ensure you are logged into Antigravity IDE (Authentication failed).")
        );
      },
      onError: (e) => errorLog("Server detection failed", e),
      onAttempt: (attempt, total) => {
        // Enhanced diagnostics: Log connection attempt details
        infoLog(`🔍 Attempting to connect to Antigravity language server (attempt ${attempt + 1}/${total})...`);
        const expectedIds = getExpectedWorkspaceIds();
        if (expectedIds.length > 0) {
          debugLog(`📁 Expected workspace IDs: ${JSON.stringify(expectedIds)}`);
        } else {
          debugLog(`⚠️  No workspace folders open - workspace ID matching disabled`);
        }
        debugLog(`🖥️  Platform: ${process.platform}, Arch: ${process.arch}`);
        debugLog(`🔢 Process PID: ${process.pid}, PPID: ${process.ppid}`);
      },
      onConnected: async (processFinder, serverInfo) => {
        // Enhanced diagnostics: Log successful connection
        infoLog(`✅ Connected to language server on port ${serverInfo.port}`);
        debugLog(`🔑 CSRF Token: ${serverInfo.csrfToken.substring(0, 8)}...`);
        debugLog(`📊 Connection stats: ${processFinder.attemptDetails.length} attempts, Protocol: ${processFinder.protocolUsed}`);
        debugLog(`📡 Ports: ${processFinder.portsFromCmdline} from cmdline, ${processFinder.portsFromNetstat} from netstat`);

        // Final check for parsing errors if no higher-level notification was shown.
        // Auth failures (HTTP 401/403) were already reported through onAuthFailed.
        if (!hasShownNotification && quotaService.parsingError && !quotaService.parsingError.startsWith('AUTH_FAILED')) {
          const message = vscode.l10n.t("Server data parsing error detected, some features limited");

          hasShownNotification = true;
          await FeedbackManager.showFeedbackNotification(message, {
            ...commonMetaFor(processFinder),
            reason: "parsing_error",
            parsingInfo: quotaService.parsingError
          });
        }

        infoLog("Server connection established successfully");
      },
      onFailed: async (processFinder, threw) => {
        // Exceptions were already logged and are not reported to the user
        if (threw) return;

        // Enhanced diagnostics: Log detailed failure information
        warnLog(`❌ Connection failed. Reason: ${processFinder.failureReason || 'unknown'}`);
        warnLog(`📊 Candidates found: ${processFinder.candidateCount}, Workspace mismatches: ${processFinder.skippedForWorkspace}`);
        warnLog(`🔁 Internal retry attempts: ${processFinder.retryCount}, External retries: ${MAX_BOOT_RETRY}`);
        if (processFinder.tokenPreview) {
          debugLog(`🔑 Token preview found: ${processFinder.tokenPreview}...`);
        }

        if (hasShownNotification) return;

        const reason = processFinder.failureReason || "unknown_failure";
        const count = processFinder.candidateCount;
        const attempts = processFinder.attemptDetails;

        const messages: Record<string, string> = {
          'no_process': vscode.l10n.t("Local server not found"),
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
          hasShownNotification = true;
          await FeedbackManager.showFeedbackNotification(message, {
            ...commonMetaFor(processFinder),
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
            bootRetryCount: MAX_BOOT_RETRY, // Include external retry info
            diagnosticSummary: processFinder.diagnosticSummary
          });
        }
      },
    }, { retries: MAX_BOOT_RETRY, retryDelayMs: BOOT_RETRY_DELAY_MS });
    connectionService = connection;

    // Attempt connection immediately, fallback to background retry cycle if server is booting
    const INITIAL_CONNECTION_DELAY_MS = 50;
    appViewModel.setConnectionStatus('detecting', null);
    bootTimeoutHandle = setTimeout(() => {
      bootTimeoutHandle = undefined;
      void connection.reconnect();
    }, INITIAL_CONNECTION_DELAY_MS);

    // 4. View Components (The Face)
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

    // Note: Initial quota refresh is handled by the connection service after connection is established
    // Cache refresh can run independently since it doesn't require server connection
    appViewModel.refreshCache().catch(e => errorLog("Initial cache refresh failed", e));

    // 6. Scheduler & Polling
    scheduler = new Scheduler({
      onError: (taskName, error) => errorLog(`Task "${taskName}" failed`, error),
    });

    const config = configManager.getConfig();

    // Polling: Quota Refresh
    scheduler.register({
      name: "refreshQuota",
      interval: config['dashboard.refreshRate'] * 1000,
      // Counts consecutive fetch failures and reconnects; idle while not connected
      execute: () => connection.poll(),
      immediate: false, // Already did initial refresh
    });

    // State for notification cooldown
    let lastAutoCleanNotificationTime = 0;

    // Polling: Cache Check (for warnings and auto-clean)
    scheduler.register({
      name: "checkCache",
      interval: config['cache.scanInterval'] * 1000,
      execute: async () => {
        const state = appViewModel!.getState();
        const currentConfig = configManager!.getConfig();
        const cacheMB = state.cache.totalSize / (1024 * 1024);
        const thresholdMB = currentConfig['cache.warningSize'];

        if (cacheMB > thresholdMB) {
          // Option 1: Auto-Clean (if enabled)
          if (currentConfig['cache.autoClean']) {
            const beforeSize = formatBytes(state.cache.totalSize);
            const result = await appViewModel!.performAutoClean();
            // performAutoClean already refreshes cache internally
            if (result && result.deletedCount > 0) {
              const now = Date.now();
              // Show notification once per hour
              if (now - lastAutoCleanNotificationTime > 3600 * 1000) {
                const afterState = appViewModel!.getState();
                const afterSize = formatBytes(afterState.cache.totalSize);
                const message = vscode.l10n.t("Auto-clean completed. Before: {0}, After: {1}.", beforeSize, afterSize);
                const viewAction = vscode.l10n.t("View");

                vscode.window.showInformationMessage(message, viewAction).then(selection => {
                  if (selection === viewAction) {
                    const brainDirPath = cacheService!.getBrainDirPath();
                    vscode.env.openExternal(vscode.Uri.file(brainDirPath)).then(undefined, err => {
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
          const lastWarned = storageService!.getLastCacheWarningTime();
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
                const brainDirPath = cacheService!.getBrainDirPath();
                vscode.env.openExternal(vscode.Uri.file(brainDirPath)).then(undefined, err => {
                  errorLog("Failed to open brain directory", err);
                });
              } else if (selection === settingsAction) {
                vscode.commands.executeCommand("tfa.openSettings");
              }
            });
            storageService!.setLastCacheWarningTime(now);
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
      appViewModel!.onConfigurationChanged().catch(err => errorLog("Configuration change handling failed", err));
    }, configManager);

    infoLog("Antigravity Panel: Activation Complete");
  } catch (e) {
    // Phase 2 failed — services are not available, but commands are still registered
    // and will show a user-friendly "still initializing" message.
    const errMsg = e instanceof Error ? e.message : String(e);
    errorLog("Extension service initialization failed", e);
    warnLog(`⚠️ Toolkit commands are registered but services are unavailable: ${errMsg}`);
    vscode.window.showErrorMessage(
      vscode.l10n.t("Antigravity Panel failed to initialize: {0}. Try reloading the window.", errMsg)
    );
  }
}

export function deactivate(): void {
  connectionService?.dispose();
  connectionService = undefined;
  if (bootTimeoutHandle) {
    clearTimeout(bootTimeoutHandle);
    bootTimeoutHandle = undefined;
  }
  scheduler?.dispose();
  infoLog("Antigravity Panel: Deactivated");
}
