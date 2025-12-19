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
            case "restartLanguageServer":
                vscode.commands.executeCommand("tfa.restartLanguageServer");
                break;
            case "restartUserStatusUpdater":
                vscode.commands.executeCommand("tfa.restartUserStatusUpdater");
                break;
            case "webviewReady":
                this._postStateUpdate();
                break;
        }
    }

    private _postStateUpdate(): void {
        if (!this._view) return;

        // Get READ-ONLY view model data -> purely for display
        const data = this._viewModel.getSidebarData();
        const config = vscode.workspace.getConfiguration('tfa');
        data.gaugeStyle = config.get('1_dashboard.10_gaugeStyle', 'semi-arc');

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
                reportIssue: vscode.l10n.t('footer.reportIssue'),
                projectHome: vscode.l10n.t('footer.projectHome')
            })
            .build();
    }

    dispose(): void {
        this._disposables.forEach(d => d.dispose());
    }
}
