/**
 * FolderTree - Generic folder tree component (Light DOM)
 * 
 * Supports client-side sorting by date (newest first) or size (largest first).
 */

import { LitElement, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { FolderItem } from '../types.js';

import './folder-node.js';

type SortMode = 'date' | 'size';

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

  @property({ type: String })
  defaultSort: SortMode = 'date';

  @state()
  private _sortMode: SortMode | null = null;

  // Light DOM mode
  createRenderRoot() { return this; }

  /** Returns the effective sort mode, falling back to defaultSort */
  private get sortMode(): SortMode {
    return this._sortMode ?? this.defaultSort;
  }

  private _onHeaderClick(): void {
    this.dispatchEvent(new CustomEvent('toggle', {
      bubbles: true,
      composed: true
    }));
  }

  private _onSortClick(mode: SortMode, e: Event): void {
    e.stopPropagation();
    this._sortMode = mode;
  }

  private _getSortedFolders(): FolderItem[] {
    if (this.folders.length === 0) return [];
    const sorted = [...this.folders];
    if (this.sortMode === 'size') {
      sorted.sort((a, b) => (b.sizeBytes ?? 0) - (a.sizeBytes ?? 0));
    } else {
      sorted.sort((a, b) => (b.lastModified ?? 0) - (a.lastModified ?? 0));
    }
    return sorted;
  }

  protected render() {
    const chevronIcon = this.collapsed ? 'codicon-chevron-right' : 'codicon-chevron-down';

    return html`
      <div class="folder-tree-card">
        <div class="section-header" @click=${this._onHeaderClick}>
          <i class="codicon ${chevronIcon}"></i>
          <span class="section-title">${this.title}</span>
          ${!this.collapsed && this.folders.length > 1 ? html`
            <span class="sort-controls" @click=${(e: Event) => e.stopPropagation()}>
              <button
                class="sort-btn ${this.sortMode === 'date' ? 'active' : ''}"
                title="Newest first"
                aria-label="Sort by date, newest first"
                aria-pressed="${this.sortMode === 'date'}"
                @click=${(e: Event) => this._onSortClick('date', e)}>
                <i class="codicon codicon-history"></i>
              </button>
              <button
                class="sort-btn ${this.sortMode === 'size' ? 'active' : ''}"
                title="Largest first"
                aria-label="Sort by size, largest first"
                aria-pressed="${this.sortMode === 'size'}"
                @click=${(e: Event) => this._onSortClick('size', e)}>
                <i class="codicon codicon-sort-precedence"></i>
              </button>
            </span>
          ` : nothing}
          <span class="section-stats">${this.loading ? 'Loading...' : this.stats}</span>
        </div>
        <div class="tree-container ${this.collapsed ? 'hidden' : ''}">
          ${this._renderContent()}
        </div>
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

    const sorted = this._getSortedFolders();
    return sorted.map(folder => html`
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
