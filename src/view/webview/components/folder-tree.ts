/**
 * FolderTree - 通用目录树组件 (Light DOM)
 */

import { LitElement, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { FolderItem } from '../types.js';

import './folder-node.js';

@customElement('folder-tree')
export class FolderTree extends LitElement {
  @property({ type: String, reflect: true })
  title = '';

  @property({ type: String })
  stats = '';

  @property({ type: Boolean })
  collapsed = true;

  @property({ type: Boolean })
  loading = false;

  @property({ type: Array })
  folders: FolderItem[] = [];

  @property({ type: String })
  emptyText = 'No items found';

  // Light DOM 模式
  createRenderRoot() { return this; }

  private _onHeaderClick(): void {
    this.dispatchEvent(new CustomEvent('toggle', {
      bubbles: true,
      composed: true
    }));
  }

  protected render() {
    const chevronIcon = this.collapsed ? 'codicon-chevron-right' : 'codicon-chevron-down';

    return html`
      <div class="section-header" @click=${this._onHeaderClick}>
        <i class="codicon ${chevronIcon}"></i>
        <span class="section-title">${this.title}</span>
        <span class="section-stats">${this.loading ? 'Loading...' : this.stats}</span>
      </div>
      <div class="tree-container ${this.collapsed ? 'hidden' : ''}">
        ${this._renderContent()}
      </div>
    `;
  }

  private _renderContent() {
    if (this.loading) {
      return html`<div class="loading"><i class="codicon codicon-loading spin"></i></div>`;
    }

    if (this.folders.length === 0) {
      return html`<div class="empty-state">${this.emptyText}</div>`;
    }

    return this.folders.map(folder => html`
      <folder-node
        .folderId=${folder.id}
        .label=${folder.label}
        .size=${folder.size}
        .files=${folder.files}
        ?expanded=${folder.expanded}
      ></folder-node>
    `);
  }
}
