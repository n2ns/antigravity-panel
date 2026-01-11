/**
 * SidebarProvider: Webview Provider (Lit + MVVM architecture)
 *
 * Responsibilities:
 * - Manage Webview lifecycle
 * - Receive Webview messages and route to ViewModel
 * - Receive ViewModel updates and push to Webview
 * - "Dumb" View - no business logic
 */

import * as vscode from "vscode";
import { AppViewModel } from "../view-model/app.vm";
import { WebviewMessage } from "../view-model/types";
import { getMcpConfigPath, getBrowserAllowlistPath, getGlobalRulesPath } from "../shared/utils/paths";
import { WebviewHtmlBuilder } from "./html-builder";

export class SidebarProvider implements vscode.WebviewViewProvider, vscode.Disposable {
    public static readonly viewType = "tfa.sidebar";
    private _view?: vscode.WebviewView;
    private _disposables: vscode.Disposable[] = [];

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _viewModel: AppViewModel
    ) {
        // Subscribe to state changes from ViewModel
        this._disposables.push(
            this._viewModel.onStateChange(() => this._postStateUpdate()),
            this._viewModel.onQuotaChange(() => this._postStateUpdate()),
            this._viewModel.onCacheChange(() => this._postStateUpdate()),
            this._viewModel.onTreeChange(() => this._postStateUpdate())
        );

        // Subscribe to configuration changes (for showUserInfoCard, gaugeStyle, etc.)
        this._disposables.push(
            vscode.workspace.onDidChangeConfiguration((e) => {
                if (e.affectsConfiguration('tfa.dashboard')) {
                    this._postStateUpdate();
                }
            })
        );
    }

    resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void {
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.onDidReceiveMessage((msg: WebviewMessage) => {
            this.handleMessage(msg);
        });

        this._updateHtml();

        // Initial data push
        this._postStateUpdate();
    }

    private handleMessage(msg: WebviewMessage): void {
        // Route messages to ViewModel or VS Code commands
        switch (msg.type) {
            // ViewModel operations
            case "deleteTask":
                if (msg.taskId) this._viewModel.deleteTask(msg.taskId);
                break;
            case "deleteContext":
                if (msg.contextId) this._viewModel.deleteContext(msg.contextId);
                break;
            case "deleteFile":
                if (msg.path) this._viewModel.deleteFile(msg.path);
                break;
            case "toggleTask":
                if (msg.taskId) {
                    this._viewModel.toggleTaskExpansion(msg.taskId);
                }
                break;
            case "toggleContext":
                if (msg.contextId) {
                    this._viewModel.toggleContextExpansion(msg.contextId);
                }
                break;
            case "toggleTasks":
                this._viewModel.toggleTasksSection();
                break;
            case "toggleProjects":
                this._viewModel.toggleContextsSection();
                break;

            // VS Code Commands / External
            case "openFile":
                if (msg.path) {
                    vscode.commands.executeCommand("vscode.open", vscode.Uri.file(msg.path), {
                        preview: true,
                        preserveFocus: true
                    }).then(undefined, (err) => {
                        vscode.window.showErrorMessage(`Failed to open file: ${err}`);
                    });
                }
                break;
            case "openMcp":
                vscode.commands.executeCommand("vscode.open", vscode.Uri.file(getMcpConfigPath()));
                break;
            case "openBrowserAllowlist":
                vscode.commands.executeCommand("vscode.open", vscode.Uri.file(getBrowserAllowlistPath()));
                break;
            case "openRules":
                vscode.commands.executeCommand("vscode.open", vscode.Uri.file(getGlobalRulesPath()));
                break;
            case "openUrl":
                if (msg.path) {
                    vscode.env.openExternal(vscode.Uri.parse(msg.path));
                }
                break;
            case "runDiagnostics":
                vscode.commands.executeCommand("tfa.runDiagnostics");
                break;
            case "showLogs":
                vscode.commands.executeCommand("tfa.showLogs");
                break;
            case "restartLanguageServer":
                vscode.commands.executeCommand("tfa.restartLanguageServer");
                break;
            case "restartUserStatusUpdater":
                vscode.commands.executeCommand("tfa.restartUserStatusUpdater");
                break;
            case "webhookReady": // (Likely a typo in original code or something, usually its webviewReady)
            case "webviewReady":
                this._postStateUpdate();
                break;
            case "toggleAutoAccept":
                this._viewModel.toggleAutoAccept();
                break;
            case "reloadWindow":
                vscode.commands.executeCommand("workbench.action.reloadWindow");
                break;
        }
    }

    private _postStateUpdate(): void {
        if (!this._view) return;

        // Get READ-ONLY view model data -> purely for display
        const data = this._viewModel.getSidebarData();
        const config = vscode.workspace.getConfiguration('tfa');
        data.gaugeStyle = config.get('dashboard.gaugeStyle', 'semi-arc');
        data.showUserInfoCard = config.get('dashboard.showUserInfoCard', true);
        data.showCreditsCard = config.get('dashboard.showCreditsCard', true);

        this._view.webview.postMessage({ type: 'update', payload: data });
    }

    private _updateHtml(): void {
        if (!this._view) return;

        const codiconsUri = this._view.webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, "node_modules", "@vscode/codicons", "dist", "codicon.css")
        );
        const stylesUri = this._view.webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, "dist", "webview.css")
        );
        const webviewUri = this._view.webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, "dist", "webview.js")
        );
        const cspSource = this._view.webview.cspSource;

        this._view.webview.html = new WebviewHtmlBuilder()
            .setHead(cspSource, codiconsUri.toString(), stylesUri.toString(), webviewUri.toString())
            .setTranslations({
                reportIssue: vscode.l10n.t('Feedback'),
                giveStar: vscode.l10n.t('Star'),
                restartService: vscode.l10n.t('Restart Service'),
                resetStatus: vscode.l10n.t('Reset Status'),
                userProfile: vscode.l10n.t('User Profile'),
                tier: vscode.l10n.t('Tier'),
                plan: vscode.l10n.t('Plan'),
                promptCredits: vscode.l10n.t('Prompt'),
                flowCredits: vscode.l10n.t('Flow'),
                used: vscode.l10n.t('Used'),
                // Tooltips
                restartServiceTooltip: vscode.l10n.t('Restart the background Agent language server (use when code analysis is stuck)'),
                resetStatusTooltip: vscode.l10n.t('Reset user subscription and quota refresh status (use when quota display is not updating)'),
                feedbackTooltip: vscode.l10n.t('Report an issue or suggestion: Jump to the GitHub Issues page'),
                starTooltip: vscode.l10n.t('If you like this extension, please star it on GitHub to support us. It is our greatest motivation for continuous improvement!'),
                usageRateTooltip: vscode.l10n.t('Usage Rate: Average percentage of quota consumed per hour'),
                runwayTooltip: vscode.l10n.t('Runway: Estimated remaining time before quota is exhausted'),
                stableStatusTooltip: vscode.l10n.t('Quota usage status: Stable'),
                promptTooltip: vscode.l10n.t('Reasoning Credits: Consumed by conversation input and result generation (thinking).'),
                flowTooltip: vscode.l10n.t('Execution Credits: Consumed by steps during search, modification, and command execution (operation).'),
                autoAcceptOn: vscode.l10n.t('Auto-Accept: ON'),
                autoAcceptOff: vscode.l10n.t('Auto-Accept: OFF'),
                autoAcceptTooltip: vscode.l10n.t('Hands-free Mode: Automatically accept agent suggested edits and terminal commands'),
                autoAcceptLabel: vscode.l10n.t('Auto-Accept'),
                reloadWindow: vscode.l10n.t('Reload Window'),
                reloadWindowTooltip: vscode.l10n.t('Reload the entire window (use when Agent panel is blank or unresponsive)'),
                // Added for completeness
                rules: vscode.l10n.t('Rules'),
                mcp: vscode.l10n.t('MCP'),
                allowlist: vscode.l10n.t('Allowlist'),
                usageHistory: vscode.l10n.t('Usage History'),
                max: vscode.l10n.t('max'),
                brain: vscode.l10n.t('Brain'),
                codeTracker: vscode.l10n.t('Code Tracker'),
                noTasksFound: vscode.l10n.t('No tasks found'),
                noCacheFound: vscode.l10n.t('No code context cache')
            })
            .build();
    }

    dispose(): void {
        this._disposables.forEach(d => d.dispose());
    }
}
