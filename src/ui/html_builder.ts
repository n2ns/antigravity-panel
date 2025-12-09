/**
 * WebviewHtmlBuilder: Generates Webview HTML skeleton
 *
 * Light DOM architecture: styles injected into main document
 */

import * as vscode from "vscode";
// ==================== Global Styles ====================

const GLOBAL_STYLES = `
/* Common styles */
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

/* Pie chart styles */
/* Donut chart styles */
quota-pie {
  flex: 1 1 100px;
  min-width: 100px;
  max-width: 140px;
  display: block;
  position: relative;
}

.pie-container {
  position: relative;
  width: 80px;
  height: 80px;
  margin: 0 auto 8px;
  border-radius: 50%;
  background: var(--vscode-sideBar-background); /* Mask background */
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
}

/* Donut ring body */
.pie-ring {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  /* Gradient controlled by component inline styles */
  mask: radial-gradient(transparent 58%, black 60%);
  -webkit-mask: radial-gradient(transparent 58%, black 60%);
}

/* 中心内容 */
.pie-content {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 1;
}

.pie-value {
  font-size: 1.4em;
  font-weight: 700;
  line-height: 1;
  color: var(--vscode-foreground);
  text-shadow: 0 1px 2px rgba(0,0,0,0.3);
}

.pie-percent-symbol {
  font-size: 0.5em;
  opacity: 0.7;
  vertical-align: super;
}

.pie-label {
  margin-top: 4px;
  font-size: 0.85em;
  font-weight: 600;
  /* text-transform: uppercase; REMOVED */
  /* letter-spacing: 0.05em; REMOVED */
  color: var(--vscode-descriptionForeground);
  text-align: center;
}

.pie-sub-label {
  margin-top: -2px;
  margin-bottom: 2px;
  font-size: 0.6em;
  color: var(--vscode-descriptionForeground);
  opacity: 0.7;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

.pie-reset {
  margin-top: 2px;
  font-size: 0.75em;
  color: var(--vscode-descriptionForeground);
  opacity: 0.7;
  text-align: center;
}

/* 仪表盘样式 */
.pies-container {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
  justify-items: center;
  gap: 12px 0;
  padding: 14px;
  background: var(--vscode-sideBar-background);
  border-bottom: 1px solid var(--vscode-widget-border);
}

/* 柱状图样式 */
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
  gap: 1px;
  height: 40px;
}

.usage-chart-bars {
  display: flex;
  align-items: flex-end;
  gap: 1px;
  height: 40px;
}

.usage-bar {
  flex: 1;
  min-width: 3px;
  border-radius: 2px;
  transition: all 0.3s ease;
  box-shadow: 0 1px 2px rgba(0,0,0,0.2);
}

.usage-legend {
  color: var(--vscode-descriptionForeground);
  font-size: 11px;
  margin-top: 4px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

/* 工具栏样式 */
.toolbar {
  display: flex;
  flex-wrap: wrap;
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

.toolbar-btn .codicon-globe {
  font-size: 14px; /* Fix large globe icon */
}

.toolbar-btn:hover {
  background: var(--vscode-button-secondaryHoverBackground);
}

/* 区块标题样式 */
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

/* 文件夹节点样式 */
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

.folder-delete.codicon,
.codicon.folder-delete {
  font-size: 12px !important;
}

.folder-delete:hover {
  opacity: 1;
}

.files-container {
  padding-left: 8px;
}

/* 文件项样式 */
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

// ==================== HTML Builder ====================

export class WebviewHtmlBuilder {
  private cspSource: string = "";
  private codiconsUri: string = "";
  private webviewUri: string = "";

  setHead(cspSource: string, codiconsUri: vscode.Uri, webviewUri: vscode.Uri): this {
    this.cspSource = cspSource;
    this.codiconsUri = codiconsUri.toString();
    this.webviewUri = webviewUri.toString();
    return this;
  }

  private generateNonce(): string {
    const array = new Uint8Array(32);
    require('crypto').randomFillSync(array);
    return Buffer.from(array).toString('base64');
  }

  build(): string {
    const nonce = this.generateNonce();
    
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${this.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${this.cspSource}; img-src ${this.cspSource} data:;">
  <link href="${this.codiconsUri}" rel="stylesheet" />
  <style>
    body {
      font-family: var(--vscode-font-family);
      padding: 0;
      margin: 0;
      color: var(--vscode-foreground);
      font-size: var(--vscode-font-size);
      overflow-x: hidden;
    }
    ${GLOBAL_STYLES}
  </style>
</head>
<body>
  <sidebar-app></sidebar-app>
  <script nonce="${nonce}" type="module" src="${this.webviewUri}"></script>
</body>
</html>`;
  }
}
