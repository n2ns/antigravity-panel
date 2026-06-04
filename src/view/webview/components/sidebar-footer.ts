/**
 * SidebarFooter - Footer component with recovery actions and links (Light DOM)
 */

import { LitElement, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { VsCodeApi, WindowWithVsCode } from '../types.js';

/** GitHub repository URLs */
const GITHUB_ISSUES_URL = 'https://github.com/n2ns/antigravity-panel/issues';
const GITHUB_HOME_URL = 'https://github.com/n2ns/antigravity-panel';
const GITHUB_DOCS_URL = 'https://github.com/n2ns/antigravity-panel#readme';

@customElement('sidebar-footer')
export class SidebarFooter extends LitElement {
  @property({ type: Boolean })
  autoAcceptEnabled = false;

  @state()
  private _isCollapsed = false;

  // Restore state from cache on connection
  connectedCallback() {
    super.connectedCallback();
    const cachedState = this._vscode?.getState();
    if (cachedState && cachedState.footerCollapsed !== undefined) {
      this._isCollapsed = !!cachedState.footerCollapsed;
    }
  }

  // Light DOM mode
  createRenderRoot() { return this; }

  private get _vscode(): VsCodeApi | undefined {
    return (window as unknown as WindowWithVsCode).vscodeApi;
  }

  private get _t() {
    return (window as unknown as WindowWithVsCode).__TRANSLATIONS__ || {};
  }

  private _postMessage(type: string): void {
    this._vscode?.postMessage({ type });
  }

  private _toggleAutoAccept(): void {
    this._vscode?.postMessage({ type: 'toggleAutoAccept' });
  }

  private _toggleCollapse(): void {
    this._isCollapsed = !this._isCollapsed;
    // Persist state in VS Code webview state
    const currentState = this._vscode?.getState() || {};
    this._vscode?.setState({
      ...currentState,
      footerCollapsed: this._isCollapsed
    });
  }

  private _openUrl(url: string): void {
    this._vscode?.postMessage({ type: 'openUrl', path: url });
  }

  protected render() {
    return html`
      <!-- Main Action Card -->
      <div class="action-card ${this._isCollapsed ? 'collapsed' : ''}">
        <!-- Auto-Accept Toggle Row (Sticky Header for collapse) -->
        <div class="action-row auto-accept-row clickable" 
             @click=${this._toggleCollapse}
             data-tooltip="${this._t.autoAcceptTooltip || 'Hands-free Mode: Automatically accept agent suggested edits and terminal commands'}">
          <span class="action-label">
            <i class="codicon codicon-rocket"></i>
            ${this._t.autoAcceptLabel || 'Auto-Accept'}
          </span>
          <div class="action-controls">
            <label class="toggle-switch" @click=${(e: Event) => e.stopPropagation()}>
              <input type="checkbox" ?checked=${this.autoAcceptEnabled} @click=${() => this._toggleAutoAccept()}>
              <span class="toggle-slider"></span>
            </label>
            <i class="codicon codicon-chevron-${this._isCollapsed ? 'down' : 'up'} collapse-icon"></i>
          </div>
        </div>

        <div class="collapsible-wrapper ${this._isCollapsed ? 'collapsed' : ''}">
          <div class="collapsible-content">
            <!-- Quick Tools -->
            <div class="action-row action-buttons">
              <button class="action-btn primary" @click=${() => this._postMessage('openRules')}>
                <i class="codicon codicon-symbol-ruler"></i>
                <span>${this._t.rules || 'Rules'}</span>
              </button>
              <button class="action-btn primary" @click=${() => this._postMessage('openMcp')}>
                <i class="codicon codicon-plug"></i>
                <span>${this._t.mcp || 'MCP'}</span>
              </button>
              <button class="action-btn primary" @click=${() => this._postMessage('openBrowserAllowlist')}>
                <i class="codicon codicon-globe"></i>
                <span>${this._t.allowlist || 'Allowlist'}</span>
              </button>
            </div>

            <!-- Recovery Actions -->
            <div class="action-row action-buttons">
              <button class="action-btn primary" 
                      @click=${() => this._postMessage('restartLanguageServer')} 
                      data-tooltip="${this._t.restartServiceTooltip || 'Restart the background Agent language server'}">
                <i class="codicon codicon-sync"></i>
                <span>Restart</span>
              </button>
              <button class="action-btn primary" 
                      @click=${() => this._postMessage('restartUserStatusUpdater')} 
                      data-tooltip="${this._t.resetStatusTooltip || 'Reset user subscription and quota refresh status'}">
                <i class="codicon codicon-refresh"></i>
                <span>Reset</span>
              </button>
              <button class="action-btn primary" 
                      @click=${() => this._postMessage('reloadWindow')} 
                      data-tooltip="${this._t.reloadWindowTooltip || 'Reload the entire window'}">
                <i class="codicon codicon-window"></i>
                <span>Reload</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="collapsible-wrapper ${this._isCollapsed ? 'collapsed' : ''}">
        <div class="collapsible-content">
          <!-- External Links (outside card) -->
          <div class="footer-links">
            <button class="link-btn" @click=${() => this._openUrl(GITHUB_DOCS_URL)}>
              <i class="codicon codicon-book"></i>
              <span>${this._t.docs || 'Docs'}</span>
            </button>
            <button class="link-btn" @click=${() => this._openUrl(GITHUB_ISSUES_URL)}>
              <i class="codicon codicon-bug"></i>
              <span>${this._t.reportIssue || 'Feedback'}</span>
            </button>
            <button class="link-btn" @click=${() => this._openUrl(GITHUB_HOME_URL)}>
              <i class="codicon codicon-star-full" style="color: #e3b341;"></i>
              <span>${this._t.giveStar || 'Star'}</span>
            </button>
          </div>

          <div class="sidebar-meta-container">
            <div class="sidebar-tagline">For Antigravity. By Antigravity.</div>
            ${(window as unknown as WindowWithVsCode).__VERSION__ ? html`
              <div class="sidebar-version">v${(window as unknown as WindowWithVsCode).__VERSION__}</div>
            ` : nothing}
          </div>
        </div>
      </div>
    `;
  }
}

