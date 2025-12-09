/**
 * SidebarProvider: Webview Provider (Lit + MVVM architecture)
 *
 * Responsibilities:
 * - Manage Webview lifecycle
 * - Receive Webview messages and route to business logic
 * - Push data updates to Webview (using structured data, not HTML)
 */

import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { QuotaSnapshot, ModelQuotaInfo } from "../core/quota_manager";
import { CacheInfo, BrainTask } from "../core/cache_manager";
import { ConfigManager } from "../core/config_manager";
import { QuotaStrategyManager } from "../core/quota_strategy_manager";
import { getBrainDir, getMcpConfigPath, getBrowserAllowlistPath, getCodeTrackerActiveDir, getGlobalRulesPath } from "../utils/paths";
import { formatBytes } from "../utils/format";
import { debugLog } from "../utils/logger";
import { WebviewHtmlBuilder } from "./html_builder";
import { 
  UsageChartData, 
  WebviewStateUpdate, 
  QuotaDisplayItem, 
  FolderItem, 
  FileItem, 
  TreeSectionState 
} from "./webview/types";

interface WebviewMessage {
  type: string;
  taskId?: string;
  contextId?: string;
  folderId?: string;
  path?: string;
}

export class SidebarProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  public static readonly viewType = "gagp.sidebar";
  private _view?: vscode.WebviewView;
  private _quota: QuotaSnapshot | null = null;
  private _cache: CacheInfo | null = null;
  private _usageChartData: UsageChartData | null = null;
  private _contexts: Array<{ id: string; name: string; size: number }> = [];
  
  private _expandedTasks: Set<string> = new Set();
  private _tasksCollapsed = true;
  private _projectsCollapsed = true;
  private _tasksLoading = true;
  private _contextsLoading = true;

  // 文件缓存
  private _taskFilesCache: Map<string, FileItem[]> = new Map();
  private _taskSizeCache: Map<string, string> = new Map();
  private _taskMtimeCache: Map<string, number> = new Map();
  private _expandedContexts: Set<string> = new Set();
  private _contextFilesCache: Map<string, FileItem[]> = new Map();

  // 业务事件
  private readonly _onDeleteTask = new vscode.EventEmitter<string>();
  readonly onDeleteTask = this._onDeleteTask.event;
  private readonly _onDeleteContext = new vscode.EventEmitter<string>();
  readonly onDeleteContext = this._onDeleteContext.event;

  // UI 状态处理器
  private readonly uiHandlers: Record<string, (msg: WebviewMessage) => void> = {
    toggleTasks: () => {
      this._tasksCollapsed = !this._tasksCollapsed;
      this._postStateUpdate();
    },
    toggleProjects: () => {
      this._projectsCollapsed = !this._projectsCollapsed;
      this._postStateUpdate();
    },
    toggleTask: (msg) => {
      if (msg.taskId) {
        this._expandedTasks.has(msg.taskId)
          ? this._expandedTasks.delete(msg.taskId)
          : this._expandedTasks.add(msg.taskId);
      }
      this._postStateUpdate();
    },
    toggleContext: (msg) => {
      if (msg.contextId) {
        this._expandedContexts.has(msg.contextId)
          ? this._expandedContexts.delete(msg.contextId)
          : this._expandedContexts.add(msg.contextId);
      }
      this._postStateUpdate();
    },
  };

  // 文件操作处理器
  private readonly fileHandlers: Record<string, (msg: WebviewMessage) => void> = {
    openFile: (msg) => {
      if (msg.path) {
        vscode.commands.executeCommand("vscode.open", vscode.Uri.file(msg.path), { 
          preview: true,
          preserveFocus: true 
        }).then(undefined, (err) => {
           vscode.window.showErrorMessage(`Failed to open file: ${err}`);
        });
      }
    },
    openMcp: () => vscode.commands.executeCommand("vscode.open", vscode.Uri.file(getMcpConfigPath())),
    openBrowserAllowlist: () => vscode.commands.executeCommand("vscode.open", vscode.Uri.file(getBrowserAllowlistPath())),
    openRules: () => vscode.commands.executeCommand("vscode.open", vscode.Uri.file(getGlobalRulesPath())),
  };

  constructor(private readonly _extensionUri: vscode.Uri) {}

  private handleMessage(msg: WebviewMessage): void {
    if (this.uiHandlers[msg.type]) {
      this.uiHandlers[msg.type](msg);
      return;
    }
    if (this.fileHandlers[msg.type]) {
      this.fileHandlers[msg.type](msg);
      return;
    }

    switch (msg.type) {
      case "deleteTask":
        if (msg.taskId) this._onDeleteTask.fire(msg.taskId);
        break;
      case "deleteContext":
        if (msg.contextId) this._onDeleteContext.fire(msg.contextId);
        break;
      case "deleteFile":
        if (msg.path) this._handleDeleteFile(msg.path);
        break;
      case "webviewReady":
        this._postStateUpdate();
        break;
    }
  }

  private async _handleDeleteFile(filePath: string): Promise<void> {
    const fileName = path.basename(filePath);
    const confirm = await vscode.window.showWarningMessage(
      `Delete file '${fileName}'?`,
      { modal: true },
      "Delete"
    );
    
    if (confirm === "Delete") {
      try {
        const fileUri = vscode.Uri.file(filePath);
        const tabs = vscode.window.tabGroups.all
          .flatMap(group => group.tabs)
          .filter(tab => {
            const tabInput = tab.input;
            if (
              tabInput instanceof vscode.TabInputText || 
              tabInput instanceof vscode.TabInputCustom || 
              tabInput instanceof vscode.TabInputNotebook
            ) {
              return path.relative(tabInput.uri.fsPath, fileUri.fsPath) === "";
            }
            return false;
          });
        
        for (const tab of tabs) {
          await vscode.window.tabGroups.close(tab);
        }

        await fs.promises.unlink(filePath);
        vscode.commands.executeCommand("gagp.refreshQuota");
      } catch (e) {
        vscode.window.showErrorMessage(`Failed to delete file: ${e}`);
      }
    }
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
  }

  dispose(): void {
    this._onDeleteTask.dispose();
    this._onDeleteContext.dispose();
  }

  async update(quota: QuotaSnapshot | null, cache: CacheInfo, usageChartData?: UsageChartData): Promise<void> {
    this._quota = quota;
    this._cache = cache;
    if (usageChartData) {
      this._usageChartData = usageChartData;
    }
    
    if (cache.brainTasks) {
      await this._preloadTasksData(cache.brainTasks);
    }
    
    this._tasksLoading = false;
    this._postStateUpdate();

    if (this._contextsLoading) {
      await this._loadContexts();
    }
  }

  private async _preloadTasksData(tasks: BrainTask[]): Promise<void> {
    const brainDir = getBrainDir();
    
    await Promise.all(tasks.map(async (task) => {
      const taskPath = path.join(brainDir, task.id);
      
      try {
        const dirStat = await fs.promises.stat(taskPath);
        this._taskMtimeCache.set(task.id, dirStat.mtimeMs);
        
        const entries = await fs.promises.readdir(taskPath, { withFileTypes: true });
        const files: FileItem[] = [];
        let totalSize = 0;
        
        for (const entry of entries) {
          if (entry.isFile()) {
            const fileStat = await fs.promises.stat(path.join(taskPath, entry.name));
            totalSize += fileStat.size;
            files.push({
              name: entry.name,
              path: path.join(taskPath, entry.name)
            });
          }
        }
        
        // 排序：.md 文件优先
        files.sort((a, b) => {
          const aMd = a.name.endsWith(".md") ? -1 : 1;
          const bMd = b.name.endsWith(".md") ? -1 : 1;
          return aMd - bMd || a.name.localeCompare(b.name);
        });
        
        this._taskFilesCache.set(task.id, files);
        this._taskSizeCache.set(task.id, formatBytes(totalSize));
      } catch {
        this._taskSizeCache.set(task.id, "0 B");
        this._taskFilesCache.set(task.id, []);
        this._taskMtimeCache.set(task.id, 0);
      }
    }));
  }

  setLoading(loading: boolean): void {
    this._tasksLoading = loading;
    this._contextsLoading = loading;
    this._postStateUpdate();
  }

  refresh(): void {
    this._postStateUpdate();
  }

  private _updateHtml(): void {
    if (!this._view) return;
    
    const codiconsUri = this._view.webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "node_modules", "@vscode/codicons", "dist", "codicon.css")
    );
    const webviewUri = this._view.webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "dist", "webview.js")
    );
    const cspSource = this._view.webview.cspSource;

    this._view.webview.html = new WebviewHtmlBuilder()
      .setHead(cspSource, codiconsUri, webviewUri)
      .build();
  }

  /* 引入依赖 */
  // 注意：需要确保这些 import 在文件顶部添加，我会分两次操作，或者手动处理
  
  private _postStateUpdate(): void {
    if (!this._view) return;

    // 使用 StrategyManager 进行聚合
    const quotas = this._aggregateQuotas();
    const cache = this._cache;
    
    // 构建任务数据 (不变)
    const taskFolders = this._buildTaskFolders();
    const taskCount = taskFolders.length;
    const totalSize = formatBytes(cache?.totalSize || 0);
    
    const tasksState: TreeSectionState = {
      title: 'Brain',
      stats: `${taskCount} tasks · ${totalSize}`,
      collapsed: this._tasksCollapsed,
      folders: this._tasksCollapsed ? [] : taskFolders,
      loading: this._tasksLoading
    };

    // 构建上下文数据 (不变)
    const contextFolders = this._buildContextFolders();
    const contextsTotalSize = formatBytes(this._contexts.reduce((sum, c) => sum + c.size, 0));
    
    const contextsState: TreeSectionState = {
      title: 'Code Tracker',
      stats: `${this._contexts.length} · ${contextsTotalSize}`,
      collapsed: this._projectsCollapsed,
      folders: this._projectsCollapsed ? [] : contextFolders,
      loading: this._contextsLoading
    };

    const updateData: WebviewStateUpdate = {
      quotas: quotas,
      chart: this._usageChartData ?? undefined,
      tasks: tasksState,
      contexts: contextsState
    };

    this._view.webview.postMessage({ type: 'update', payload: updateData });
  }

  // Aggregate quotas based on Visualization Mode
  private _aggregateQuotas(): QuotaDisplayItem[] {
    const models = this._quota?.models || [];
    if (models.length === 0) return [];

    const configManager = new ConfigManager(); // Or inject
    const strategyManager = new QuotaStrategyManager(); // Or inject
    const mode = configManager.get('visualizationMode', 'groups');

    debugLog('Aggregating quotas', { mode, modelCount: models.length });

    if (mode === 'groups') {
      const groups = strategyManager.getGroups();
      return groups.map(group => {
        // Find models belonging to this group
        const groupModels = models.filter(m => strategyManager.getGroupForModel(m.modelId, m.label).id === group.id);
        
        let remaining = 0;
        let resetTime = 'N/A';
        let hasData = false;

        if (groupModels.length > 0) {
          hasData = true;
          // Strategy: Take the minimum remaining percentage to be safe
          const minModel = groupModels.reduce((min, m) => m.remainingPercentage < min.remainingPercentage ? m : min);
          remaining = minModel.remainingPercentage;
          resetTime = minModel.timeUntilReset;
        }

        return {
          id: group.id,
          label: group.label,
          type: 'group',
          remaining,
          resetTime,
          hasData,
          themeColor: group.themeColor
        };
      });
    } else {
      // Models Mode
      const displayModels = [...models];

      // Sort by Config Order
      const allConfigModels: any[] = []; // Use any or import ModelDefinition to avoid import updates
      strategyManager.getGroups().forEach(g => allConfigModels.push(...g.models));

      displayModels.sort((a, b) => {
        const defA = strategyManager.getModelDefinition(a.modelId, a.label);
        const defB = strategyManager.getModelDefinition(b.modelId, b.label);
        
        const indexA = defA ? allConfigModels.indexOf(defA) : 9999;
        const indexB = defB ? allConfigModels.indexOf(defB) : 9999;
        
        return indexA - indexB;
      });
      
      debugLog('Sorted models', { first: displayModels[0]?.modelId, configuredCount: allConfigModels.length });

      return displayModels.map(m => {
        const group = strategyManager.getGroupForModel(m.modelId, m.label);
        const configuredName = strategyManager.getModelDisplayName(m.modelId, m.label);
        // Use configured name -> server label -> model ID
        const displayName = configuredName || m.label || m.modelId;
        
        return {
          id: m.modelId,
          label: displayName,
          type: 'model',
          remaining: m.remainingPercentage,
          resetTime: m.timeUntilReset,
          hasData: true,
          themeColor: group.themeColor, // Inherit group color
          subLabel: configManager.get('debugMode', false) ? m.modelId : undefined
        };
      });
    }
  }

  private async _loadContexts(): Promise<void> {
    this._contexts = await this._getCodeContextsAsync();
    this._contextsLoading = false;
    this._postStateUpdate();
  }

  private _buildTaskFolders(): FolderItem[] {
    const tasks = this._cache?.brainTasks || [];
    return tasks.map(task => {
      const files = this._taskFilesCache.get(task.id) || [];
      const size = this._taskSizeCache.get(task.id) || 'Loading...';
      const mtime = this._taskMtimeCache.get(task.id) || task.lastModified;
      
      const parts = task.id.split('-');
      const shortId = parts.length > 0 ? parts[0] : task.id;
      const title = task.title 
        ? (task.title.length > 30 ? task.title.substring(0, 30) + "..." : task.title)
        : `Task ${shortId}`;
      
      return {
        id: task.id,
        label: title,
        size: size,
        mtime: mtime,
        files: this._expandedTasks.has(task.id) ? files : [],
        expanded: this._expandedTasks.has(task.id),
        type: 'task'
      };
    });
  }

  private _buildContextFolders(): FolderItem[] {
    return this._contexts.map(ctx => {
      const files = this._contextFilesCache.get(ctx.id) || [];
      
      return {
        id: ctx.id,
        label: ctx.name,
        size: formatBytes(ctx.size),
        mtime: 0,
        files: this._expandedContexts.has(ctx.id) ? files : [],
        expanded: this._expandedContexts.has(ctx.id),
        type: 'context'
      };
    });
  }

  private async _getCodeContextsAsync(): Promise<Array<{ id: string; name: string; size: number }>> {
    try {
      const dir = getCodeTrackerActiveDir();
      try {
        await fs.promises.access(dir);
      } catch {
        return [];
      }

      const entries = await fs.promises.readdir(dir, { withFileTypes: true });
      const contexts: Array<{ id: string; name: string; size: number }> = [];

      for (const entry of entries) {
        if (entry.isDirectory() && entry.name !== "no_repo") {
          const fullPath = path.join(dir, entry.name);
          const parts = entry.name.split("_");
          const hash = parts.pop() || "";
          const projectName = parts.join("_") || entry.name;
          const displayName = `${projectName} (${hash.substring(0, 8)}...)`;
          
          const size = await this._getDirSizeAsync(fullPath);
          
          // 获取文件列表
          const subEntries = await fs.promises.readdir(fullPath, { withFileTypes: true });
          const files: FileItem[] = subEntries
            .filter(e => e.isFile())
            .map(e => ({
              name: e.name,
              path: path.join(fullPath, e.name)
            }))
            .sort((a, b) => a.name.localeCompare(b.name));
            
          this._contextFilesCache.set(entry.name, files);
          
          contexts.push({ id: entry.name, name: displayName, size });
        }
      }
      return contexts.sort((a, b) => b.size - a.size);
    } catch { return []; }
  }

  private async _getDirSizeAsync(dirPath: string): Promise<number> {
    try {
      let total = 0;
      const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        const filePath = path.join(dirPath, entry.name);
        if (entry.isFile()) {
          const stat = await fs.promises.stat(filePath);
          total += stat.size;
        } else if (entry.isDirectory()) {
          total += await this._getDirSizeAsync(filePath);
        }
      }
      return total;
    } catch { return 0; }
  }
}
