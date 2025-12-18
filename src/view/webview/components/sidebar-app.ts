/**
 * SidebarApp - Main sidebar application component (Light DOM)
 */

import { LitElement, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import type {
  QuotaDisplayItem,
  UsageChartData,
  TreeSectionState,
  WebviewStateUpdate,
  VsCodeApi,
  WindowWithVsCode
} from '../types.js';

import './quota-dashboard.js';
import './toolbar.js';
import './folder-tree.js';

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

  private _vscode = acquireVsCodeApi();

  // Light DOM mode
  createRenderRoot() { return this; }

  connectedCallback(): void {
    super.connectedCallback();

    // 暴露 vscode API 供子组件使用
    (window as unknown as WindowWithVsCode).vscodeApi = this._vscode;

    // 从缓存恢复状态（秒开）
    const cachedState = this._vscode.getState();
    if (cachedState?.payload) {
      this._applyState(cachedState.payload);
    }

    // 监听 Extension 消息
    window.addEventListener('message', this._handleMessage);

    // 监听子组件事件 (Light DOM 模式下直接冒泡)
    this.addEventListener('folder-toggle', this._handleFolderToggle as EventListener);
    this.addEventListener('folder-delete', this._handleFolderDelete as EventListener);
    this.addEventListener('file-click', this._handleFileClick as EventListener);
    this.addEventListener('file-delete', this._handleFileDelete as EventListener);

    // 通知 Extension 前端已就绪
    this._vscode.postMessage({ type: 'webviewReady' });

    // 让 host 变为 flex 布局以支持 footer 底部对齐
    this.style.display = 'flex';
    this.style.flexDirection = 'column';
    this.style.height = '100vh';
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener('message', this._handleMessage);
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
    if (state.tasks) {
      // Adapter: Backend (expanded) -> Frontend (collapsed)
      const backendTasks = state.tasks as TreeSectionState & { expanded?: boolean };
      this._tasks = {
        title: 'Brain',
        stats: `${backendTasks.folders?.length || 0} Tasks`,
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
        stats: `${backendContexts.folders?.length || 0} Projects`,
        collapsed: !backendContexts.expanded, // Invert logic
        folders: backendContexts.folders || [],
        loading: false
      };
    }
  }

  // ==================== 事件处理 (Light DOM 简化版) ====================

  private _findTreeTitle(e: Event): string {
    // Light DOM 模式下直接查找父元素
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

    // 更新选中状态
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

  private _onReportIssue(): void {
    this._vscode.postMessage({
      type: 'openUrl',
      path: 'https://github.com/n2ns/antigravity-panel/issues'
    });
  }

  private _onProjectHome(): void {
    this._vscode.postMessage({
      type: 'openUrl',
      path: 'https://github.com/n2ns/antigravity-panel'
    });
  }

  // ==================== 渲染 ====================

  protected render() {
    return html`
      <quota-dashboard 
        .quotas=${this._quotas} 
        .chartData=${this._chartData}
      ></quota-dashboard>
      
      <app-toolbar></app-toolbar>
      
      <folder-tree
        title="Brain"
        .stats=${this._tasks.stats}
        ?collapsed=${this._tasks.collapsed}
        ?loading=${this._tasks.loading}
        .folders=${this._tasks.folders}
        emptyText="No tasks found"
        @toggle=${this._onToggleTasks}
      ></folder-tree>
      
      <folder-tree
        title="Code Tracker"
        .stats=${this._contexts.stats}
        ?collapsed=${this._contexts.collapsed}
        ?loading=${this._contexts.loading}
        .folders=${this._contexts.folders}
        emptyText="No code context cache"
        @toggle=${this._onToggleContexts}
      ></folder-tree>

      <div class="sidebar-footer">
        <button class="discussions-btn" @click=${this._onReportIssue} title=${(window as unknown as WindowWithVsCode).__TRANSLATIONS__?.reportIssue || "Report Issue"}>
          <i class="codicon codicon-bug"></i>
          <span>${(window as unknown as WindowWithVsCode).__TRANSLATIONS__?.reportIssue || "Report Issue"}</span>
        </button>
        <button class="discussions-btn" @click=${this._onProjectHome} title=${(window as unknown as WindowWithVsCode).__TRANSLATIONS__?.projectHome || "Project Home"}>
          <i class="codicon codicon-github"></i>
          <span>${(window as unknown as WindowWithVsCode).__TRANSLATIONS__?.projectHome || "Project Home"}</span>
        </button>
      </div>
    `;
  }
}
