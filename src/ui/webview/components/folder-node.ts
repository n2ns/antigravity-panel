/**
 * FolderNode - 文件夹节点组件 (Light DOM)
 */

import { LitElement, html, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { FileItem } from '../types.js';

import './file-item.js';

@customElement('folder-node')
export class FolderNode extends LitElement {
  @property({ type: String })
  folderId = '';

  @property({ type: String })
  label = '';

  @property({ type: String })
  size = '';

  @property({ type: Array })
  files: FileItem[] = [];

  @property({ type: Boolean })
  expanded = false;

  // Light DOM 模式
  createRenderRoot() { return this; }

  private _onFolderClick(): void {
    this.dispatchEvent(new CustomEvent('folder-toggle', {
      bubbles: true,
      composed: true,
      detail: { folderId: this.folderId }
    }));
  }

  private _onDelete(e: Event): void {
    e.stopPropagation();
    this.dispatchEvent(new CustomEvent('folder-delete', {
      bubbles: true,
      composed: true,
      detail: { folderId: this.folderId }
    }));
  }

  protected render() {
    const chevronIcon = this.expanded ? 'codicon-chevron-down' : 'codicon-chevron-right';
    const folderIcon = this.expanded ? 'codicon-folder-opened' : 'codicon-folder';

    return html`
      <div class="folder" @click=${this._onFolderClick}>
        <i class="codicon ${chevronIcon}"></i>
        <i class="codicon ${folderIcon} folder-icon"></i>
        <span class="folder-label" title="${this.folderId}">${this.label}</span>
        <span class="folder-size">${this.size}</span>
        <i class="codicon codicon-trash folder-delete" @click=${this._onDelete}></i>
      </div>
      ${this.expanded ? html`
        <div class="files-container">
          ${this.files.length > 0 
            ? this.files.map(file => html`
                <file-item 
                  .name=${file.name}
                  .path=${file.path}
                ></file-item>
              `)
            : nothing
          }
        </div>
      ` : nothing}
    `;
  }
}
