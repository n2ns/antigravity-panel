/**
 * FileItem - File item component (Light DOM)
 */

import { LitElement, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { getFileIcon, getFileIconColorClass } from '../styles/shared.js';

@customElement('file-item')
export class FileItemComponent extends LitElement {
  @property({ type: String })
  name = '';

  @property({ type: String })
  path = '';

  @property({ type: Boolean, reflect: true })
  selected = false;

  // Light DOM mode
  createRenderRoot() { return this; }

  private _onClick(e: Event): void {
    e.stopPropagation();
    this.dispatchEvent(new CustomEvent('file-click', {
      bubbles: true,
      composed: true,
      detail: { path: this.path }
    }));
  }

  private _onDelete(e: Event): void {
    e.stopPropagation();
    this.dispatchEvent(new CustomEvent('file-delete', {
      bubbles: true,
      composed: true,
      detail: { path: this.path }
    }));
  }

  private _getIconClass(): string {
    const iconClass = getFileIcon(this.name);
    const colorClass = getFileIconColorClass(iconClass);
    return `codicon ${iconClass} file-icon ${colorClass}`;
  }

  protected render() {
    const selectedClass = this.selected ? 'selected' : '';

    return html`
      <div class="file ${selectedClass}" @click=${this._onClick}>
        <i class="${this._getIconClass()}"></i>
        <span class="file-name">${this.name}</span>
        <div class="file-actions">
          <button class="file-action-btn" title="Delete File" @click=${this._onDelete}>
            <i class="codicon codicon-trash"></i>
          </button>
        </div>
      </div>
    `;
  }
}
