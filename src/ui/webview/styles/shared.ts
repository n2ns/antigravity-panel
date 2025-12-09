/**
 * 全局样式
 * 
 * Light DOM 模式：所有样式直接注入到主文档
 */

export const globalStyles = `
/* ==================== 通用样式 ==================== */

.codicon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* ==================== 饼图样式 ==================== */

.quota-pie {
  flex: 1;
  text-align: center;
}

.pie-label {
  font-size: 0.9em;
  font-weight: bold;
  margin-bottom: 4px;
  color: var(--vscode-descriptionForeground);
}

.pie {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  margin: 0 auto 4px;
  transition: background 0.3s ease;
}

.pie-value {
  font-size: 1.2em;
  font-weight: bold;
  color: var(--vscode-foreground);
}

.pie-reset {
  font-size: 0.85em;
  color: var(--vscode-descriptionForeground);
}

/* ==================== 仪表盘样式 ==================== */

.pies-container {
  display: flex;
  gap: 16px;
  padding: 14px;
  background: var(--vscode-sideBar-background);
  border-bottom: 1px solid var(--vscode-widget-border);
}

/* ==================== 柱状图样式 ==================== */

.usage-chart {
  padding: 8px 12px;
  background: var(--vscode-sideBar-background);
  border-bottom: 1px solid var(--vscode-widget-border);
}

.usage-chart-title {
  font-size: 0.85em;
  color: var(--vscode-descriptionForeground);
  margin-bottom: 6px;
  display: flex;
  justify-content: space-between;
}

.usage-chart-bars {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  height: 40px;
}

.usage-bar {
  flex: 1;
  min-width: 4px;
  border-radius: 1px 1px 0 0;
  transition: height 0.3s ease;
}

.usage-legend {
  color: var(--vscode-descriptionForeground);
  font-size: 11px;
  margin-top: 4px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

/* ==================== 工具栏样式 ==================== */

.toolbar {
  display: flex;
  gap: 4px;
  padding: 6px 8px;
  background: var(--vscode-sideBarSectionHeader-background);
  border-bottom: 1px solid var(--vscode-widget-border);
}

.toolbar-btn {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  padding: 4px 8px;
  font-size: 0.9em;
  background: var(--vscode-button-secondaryBackground);
  color: var(--vscode-button-secondaryForeground);
  border: 1px solid var(--vscode-button-border, transparent);
  border-radius: 3px;
  cursor: pointer;
  font-family: inherit;
}

.toolbar-btn:hover {
  background: var(--vscode-button-secondaryHoverBackground);
}

/* ==================== 区块标题样式 ==================== */

.section-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  height: 28px;
  box-sizing: border-box;
  cursor: pointer;
  user-select: none;
  font-size: 0.85em;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--vscode-sideBarSectionHeader-foreground);
  background: linear-gradient(180deg, var(--vscode-sideBarSectionHeader-background) 0%, rgba(0,0,0,0.15) 100%);
  border-top: 1px solid rgba(255,255,255,0.06);
  border-bottom: 1px solid rgba(0,0,0,0.3);
  box-shadow: 0 1px 2px rgba(0,0,0,0.15);
}

.section-header:hover {
  background: linear-gradient(180deg, var(--vscode-list-hoverBackground) 0%, rgba(0,0,0,0.1) 100%);
}

.section-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-shadow: 0 1px 1px rgba(0,0,0,0.3);
}

.section-stats {
  color: var(--vscode-descriptionForeground);
  font-size: 0.9em;
  font-weight: 400;
  text-transform: none;
  letter-spacing: normal;
  opacity: 0.85;
}

.tree-container {
  padding: 4px 0;
}

.tree-container.hidden {
  display: none !important;
}

.loading {
  padding: 12px;
  display: flex;
  justify-content: center;
  color: var(--vscode-descriptionForeground);
}

.empty-state {
  padding: 12px;
  color: var(--vscode-descriptionForeground);
  font-style: italic;
  text-align: center;
}

/* ==================== 文件夹节点样式 ==================== */

.folder {
  cursor: pointer;
  padding: 4px 8px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.folder:hover {
  background: var(--vscode-list-hoverBackground);
}

.folder-icon {
  color: var(--vscode-symbolIcon-folderForeground, #dcb67a);
}

.folder-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 16px;
}

.folder-size {
  color: var(--vscode-descriptionForeground);
  font-size: 0.85em;
  margin-right: 4px;
}

.folder-delete {
  opacity: 0.6;
  cursor: pointer;
}

.folder-delete:hover {
  opacity: 1;
}

.files-container {
  padding-left: 8px;
}

/* ==================== 文件项样式 ==================== */

.file {
  padding: 3px 8px 3px 32px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  border: 1px solid transparent;
}

.file:hover {
  background: var(--vscode-list-hoverBackground);
}

.file.selected {
  background: var(--vscode-list-activeSelectionBackground);
  color: var(--vscode-list-activeSelectionForeground);
  outline: 1px solid var(--vscode-list-focusOutline);
}

.file-icon {
  color: var(--vscode-symbolIcon-fileForeground, #c5c5c5);
  flex-shrink: 0;
}

.file-icon-media {
  color: var(--vscode-symbolIcon-colorForeground, #ce9178);
}

.file-icon-code {
  color: var(--vscode-symbolIcon-classForeground, #ee9d28);
}

.file-icon-md {
  color: var(--vscode-symbolIcon-keywordForeground, #569cd6);
}

.file-icon-json {
  color: var(--vscode-symbolIcon-enumeratorForeground, #b5cea8);
}

.file-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-actions {
  display: none;
  margin-left: auto;
  flex-shrink: 0;
}

.file:hover .file-actions,
.file.selected .file-actions {
  display: flex;
}

.action-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: inherit;
  padding: 2px;
  display: flex;
  align-items: center;
  opacity: 0.7;
}

.action-btn:hover {
  opacity: 1;
  background: var(--vscode-toolbar-hoverBackground);
  border-radius: 3px;
}
`;

/**
 * 根据文件名获取对应的 codicon 图标类
 */
export function getFileIcon(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  
  const iconMap: Record<string, string> = {
    // 图片 - 使用 symbol-color (调色板图标)
    'png': 'codicon-symbol-color',
    'jpg': 'codicon-symbol-color',
    'jpeg': 'codicon-symbol-color',
    'gif': 'codicon-symbol-color',
    'svg': 'codicon-symbol-color',
    'webp': 'codicon-symbol-color',
    'ico': 'codicon-symbol-color',
    
    // 代码
    'ts': 'codicon-file-code',
    'tsx': 'codicon-file-code',
    'js': 'codicon-file-code',
    'jsx': 'codicon-file-code',
    'py': 'codicon-file-code',
    'java': 'codicon-file-code',
    'c': 'codicon-file-code',
    'cpp': 'codicon-file-code',
    'h': 'codicon-file-code',
    'cs': 'codicon-file-code',
    'go': 'codicon-file-code',
    'rs': 'codicon-file-code',
    'rb': 'codicon-file-code',
    'php': 'codicon-file-code',
    'swift': 'codicon-file-code',
    'kt': 'codicon-file-code',
    'css': 'codicon-file-code',
    'scss': 'codicon-file-code',
    'less': 'codicon-file-code',
    'html': 'codicon-file-code',
    'vue': 'codicon-file-code',
    
    // 文档
    'md': 'codicon-markdown',
    'txt': 'codicon-file-text',
    'pdf': 'codicon-file-pdf',
    'doc': 'codicon-file-text',
    'docx': 'codicon-file-text',
    
    // 配置
    'json': 'codicon-json',
    'yaml': 'codicon-file-code',
    'yml': 'codicon-file-code',
    'xml': 'codicon-file-code',
    'toml': 'codicon-file-code',
    'ini': 'codicon-file-code',
    'env': 'codicon-file-code',
    
    // 压缩包
    'zip': 'codicon-file-zip',
    'tar': 'codicon-file-zip',
    'gz': 'codicon-file-zip',
    'rar': 'codicon-file-zip',
    '7z': 'codicon-file-zip',
    
    // 其他
    'log': 'codicon-output',
    'sh': 'codicon-terminal',
    'bat': 'codicon-terminal',
    'ps1': 'codicon-terminal',
  };
  
  return iconMap[ext] || 'codicon-file';
}

/**
 * 获取图标颜色类
 */
export function getFileIconColorClass(iconClass: string): string {
  if (iconClass === 'codicon-symbol-color') return 'file-icon-media';
  if (iconClass.includes('code')) return 'file-icon-code';
  if (iconClass === 'codicon-markdown') return 'file-icon-md';
  if (iconClass === 'codicon-json') return 'file-icon-json';
  return '';
}
