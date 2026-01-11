/**
 * SidebarApp - Main sidebar application component (Light DOM)
 */

import { LitElement, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import type {
  QuotaDisplayItem,
  UsageChartData,
  TreeSectionState,
  WebviewStateUpdate,
  VsCodeApi,
  WindowWithVsCode,
  UserInfoData,
  TokenUsageData,
  ConnectionStatus
} from '../types.js';

import './quota-dashboard.js';
import './usage-chart.js';

// Extend Window interface to include __TRANSLATIONS__
declare global {
  interface Window {
    __TRANSLATIONS__?: {
      restartService?: string;
      reloadWindow?: string;
      [key: string]: string | undefined;
    };
  }
}
import './folder-tree.js';
import './credits-bar.js';
import './user-info-card.js';
import './sidebar-footer.js';
import { TooltipManager } from '../utils/tooltip-manager.js';

declare const acquireVsCodeApi: () => VsCodeApi;

@customElement('sidebar-app')
export class SidebarApp extends LitElement {
  @state()
  private _quotas: QuotaDisplayItem[] | null = null;

  @state()
  private _chartData: UsageChartData | null = null;

  @state()
  private _tasks: TreeSectionState = {
    title: 'Brain',
    stats: 'Loading...',
    collapsed: true,
    folders: [],
    loading: true
  };

  @state()
  private _contexts: TreeSectionState = {
    title: 'Code Tracker',
    stats: 'Loading...',
    collapsed: true,
    folders: [],
    loading: true
  };

  @state()
  private _gaugeStyle: string = 'semi-arc';

  @state()
  private _user: UserInfoData | null = null;

  @state()
  private _tokenUsage: TokenUsageData | null = null;

  @state()
  private _showUserInfoCard: boolean = true;

  @state()
  private _showCreditsCard: boolean = true;

  @state()
  private _cache: WebviewStateUpdate['cache'] | null = null;

  @state()
  private _autoAcceptEnabled: boolean = false;

  @state()
  private _connectionStatus: ConnectionStatus = 'detecting';

  @state()
  private _failureReason: 'no_process' | 'ambiguous' | 'no_port' | 'auth_failed' | 'workspace_mismatch' | null = null;

  private _vscode = acquireVsCodeApi();

  // Light DOM mode
  createRenderRoot() { return this; }

  private _tooltipManager: TooltipManager | null = null;

  connectedCallback(): void {
    super.connectedCallback();

    // Expose vscode API for child components
    (window as unknown as WindowWithVsCode).vscodeApi = this._vscode;

    // Restore state from cache (instant startup)
    const cachedState = this._vscode.getState();
    if (cachedState?.payload) {
      this._applyState(cachedState.payload);
    }

    // Listen to Extension messages
    window.addEventListener('message', this._handleMessage);

    // Listen to child component events (bubbles in Light DOM mode)
    this.addEventListener('folder-toggle', this._handleFolderToggle as EventListener);
    this.addEventListener('folder-delete', this._handleFolderDelete as EventListener);
    this.addEventListener('file-click', this._handleFileClick as EventListener);
    this.addEventListener('file-delete', this._handleFileDelete as EventListener);

    // Notify Extension that frontend is ready
    this._vscode.postMessage({ type: 'webviewReady' });

    // Make host flex layout to support footer alignment at bottom
    this.style.display = 'flex';
    this.style.flexDirection = 'column';
    this.style.height = '100vh';

    // Setup ResizeObserver to track panel width for tooltip sizing
    this._setupResizeObserver();
  }

  private _resizeObserver: ResizeObserver | null = null;

  private _setupResizeObserver(): void {
    // 1. Monitor Panel Width for Layout
    const updatePanelWidth = () => {
      const width = document.body.clientWidth;

      // Update button layout (single column check)
      const actionButtons = this.querySelectorAll('.action-buttons');
      actionButtons.forEach(btn => {
        if (width < 220) {
          btn.classList.add('single-column');
        } else {
          btn.classList.remove('single-column');
        }
      });
    };

    updatePanelWidth();
    this._resizeObserver = new ResizeObserver(() => updatePanelWidth());
    this._resizeObserver.observe(document.body);

    // 2. Initialize Global Tooltip Manager
    this._tooltipManager = new TooltipManager();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener('message', this._handleMessage);

    // Clean up ResizeObserver
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
  }

  private _handleMessage = (event: MessageEvent): void => {
    const msg = event.data;
    if (msg.type === 'update' && msg.payload) {
      this._applyState(msg.payload);
      this._vscode.setState({ payload: msg.payload });
    }
  };

  private _applyState(state: WebviewStateUpdate): void {
    if (state.quotas) {
      this._quotas = state.quotas;
    }
    if (state.chart) {
      this._chartData = state.chart;
    }
    if (state.cache) {
      this._cache = state.cache;
    }
    if (state.tasks) {
      // Adapter: Backend (expanded) -> Frontend (collapsed)
      const backendTasks = state.tasks as TreeSectionState & { expanded?: boolean };
      this._tasks = {
        title: 'Brain',
        stats: this._cache?.formattedBrain || `${backendTasks.folders?.length || 0} Tasks`,
        collapsed: !backendTasks.expanded, // Invert logic
        folders: backendTasks.folders || [],
        loading: false
      };
    }
    if (state.contexts) {
      // Adapter: Backend (expanded) -> Frontend (collapsed)
      const backendContexts = state.contexts as TreeSectionState & { expanded?: boolean };
      this._contexts = {
        title: 'Code Tracker',
        stats: this._cache?.formattedConversations || `${backendContexts.folders?.length || 0} Projects`,
        collapsed: !backendContexts.expanded, // Invert logic
        folders: backendContexts.folders || [],
        loading: false
      };
    }
    if (state.gaugeStyle) {
      this._gaugeStyle = state.gaugeStyle;
    }
    if (state.user) {
      this._user = state.user;
    }
    if (state.tokenUsage) {
      this._tokenUsage = state.tokenUsage;
    }
    if (state.showUserInfoCard !== undefined) {
      this._showUserInfoCard = state.showUserInfoCard;
    }
    if (state.showCreditsCard !== undefined) {
      this._showCreditsCard = state.showCreditsCard;
    }
    if (state.autoAcceptEnabled !== undefined) {
      this._autoAcceptEnabled = state.autoAcceptEnabled;
    }
    if (state.connectionStatus) {
      this._connectionStatus = state.connectionStatus;
    }
    if (state.failureReason !== undefined) {
      this._failureReason = state.failureReason;
    }
  }

  // ==================== Event Handlers (Light DOM simplified) ====================

  private _findTreeTitle(e: Event): string {
    // In Light DOM mode, directly find parent element
    const target = e.target as HTMLElement;
    const tree = target.closest('folder-tree');
    return tree?.getAttribute('title') || '';
  }

  private _handleFolderToggle = (e: CustomEvent<{ folderId: string }>): void => {
    const title = this._findTreeTitle(e);

    if (title === 'Brain') {
      this._vscode.postMessage({ type: 'toggleTask', taskId: e.detail.folderId });
    } else {
      this._vscode.postMessage({ type: 'toggleContext', contextId: e.detail.folderId });
    }
  };

  private _handleFolderDelete = (e: CustomEvent<{ folderId: string }>): void => {
    const title = this._findTreeTitle(e);

    if (title === 'Brain') {
      this._vscode.postMessage({ type: 'deleteTask', taskId: e.detail.folderId });
    } else {
      this._vscode.postMessage({ type: 'deleteContext', contextId: e.detail.folderId });
    }
  };

  private _handleFileClick = (e: CustomEvent<{ path: string }>): void => {
    this._vscode.postMessage({ type: 'openFile', path: e.detail.path });

    // Update selection state
    this.querySelectorAll('.file').forEach(el => el.classList.remove('selected'));
    const target = e.target as HTMLElement;
    const fileEl = target.closest('.file');
    fileEl?.classList.add('selected');
  };

  private _handleFileDelete = (e: CustomEvent<{ path: string }>): void => {
    this._vscode.postMessage({ type: 'deleteFile', path: e.detail.path });
  };

  private _onToggleTasks(): void {
    this._vscode.postMessage({ type: 'toggleTasks' });
  }

  private _onToggleContexts(): void {
    this._vscode.postMessage({ type: 'toggleProjects' });
  }



  // ==================== Render ====================

  protected render() {
    return html`
      <div class="scrollable-content" style="flex: 1; overflow-y: auto; overflow-x: hidden; min-height: 0;">
        ${this._connectionStatus === 'detecting' ? html`
          <div class="connection-hint info">
            <span class="codicon codicon-loading codicon-modifier-spin"></span>
            <span>Connecting to Antigravity service...</span>
          </div>
        ` : nothing}
        ${this._connectionStatus === 'failed' ? html`
          <div class="connection-hint">
            <span class="codicon codicon-warning"></span>
            <span>
              ${this._failureReason === 'no_process' ? html`
                Antigravity IDE language server not running. Ensure Antigravity IDE is active.
              ` : this._failureReason === 'workspace_mismatch' ? html`
                Wrong workspace detected. Reopen folder matching the Antigravity instance.
              ` : this._failureReason === 'auth_failed' ? html`
                Authentication failed. Ensure you're logged into Antigravity IDE.
              ` : this._failureReason === 'no_port' ? html`
                Language server found but port inaccessible.
              ` : html`
                Local service not detected.
              `}
              Try 
              <a @click=${() => this._vscode.postMessage({ type: 'runDiagnostics' })}>Run Diagnostics</a>, 
              <a @click=${() => this._vscode.postMessage({ type: 'restartLanguageServer' })}>${window.__TRANSLATIONS__?.restartService || 'Restart Service'}</a>, or 
              <a @click=${() => this._vscode.postMessage({ type: 'reloadWindow' })}>${window.__TRANSLATIONS__?.reloadWindow || 'Reload Window'}</a>.
            </span>
          </div>
        ` : nothing}
        <quota-dashboard 
          .quotas=${this._quotas} 
          .gaugeStyle=${this._gaugeStyle}
        ></quota-dashboard>
        
        <usage-chart .data=${this._chartData}></usage-chart>
        
        ${this._showCreditsCard ? html`
          <credits-bar
            .tokenUsage=${this._tokenUsage}
          ></credits-bar>
        ` : nothing}
        
        ${this._showUserInfoCard ? html`
          <user-info-card
            .user=${this._user}
          ></user-info-card>
        ` : nothing}
        
        <folder-tree
          title="${(window as unknown as WindowWithVsCode).__TRANSLATIONS__?.brain || 'Brain'}"
          .stats=${this._tasks.stats}
          ?collapsed=${this._tasks.collapsed}
          ?loading=${this._tasks.loading}
          .folders=${this._tasks.folders}
          emptyText="${(window as unknown as WindowWithVsCode).__TRANSLATIONS__?.noTasksFound || 'No tasks found'}"
          @toggle=${this._onToggleTasks}
        ></folder-tree>
        
        <folder-tree
          title="${(window as unknown as WindowWithVsCode).__TRANSLATIONS__?.codeTracker || 'Code Tracker'}"
          .stats=${this._contexts.stats}
          ?collapsed=${this._contexts.collapsed}
          ?loading=${this._contexts.loading}
          .folders=${this._contexts.folders}
          emptyText="${(window as unknown as WindowWithVsCode).__TRANSLATIONS__?.noCacheFound || 'No code context cache'}"
          @toggle=${this._onToggleContexts}
        ></folder-tree>
      </div>

      <sidebar-footer 
        .autoAcceptEnabled=${this._autoAcceptEnabled}
        style="flex-shrink: 0; position: relative; z-index: 10;"
      ></sidebar-footer>

    `;
  }
}
