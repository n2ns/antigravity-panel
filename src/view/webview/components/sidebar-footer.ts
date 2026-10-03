/**
 * SidebarFooter - Footer component with recovery actions and links (Light DOM)
 */

import { LitElement, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { live } from 'lit/directives/live.js';
import type { AutoAcceptStatus, VsCodeApi, WindowWithVsCode } from '../types.js';

/** GitHub repository URLs */
const GITHUB_ISSUES_URL = 'https://github.com/n2ns/antigravity-panel/issues';
const GITHUB_HOME_URL = 'https://github.com/n2ns/antigravity-panel';
const GITHUB_DOCS_URL = 'https://github.com/n2ns/antigravity-panel/blob/main/docs/FEATURES.md';
const CDP_SETUP_URL = 'https://github.com/n2ns/antigravity-panel/blob/main/docs/FEATURES.md#enabling-the-cdp-fallback';

@customElement('sidebar-footer')
export class SidebarFooter extends LitElement {
  @property({ type: Boolean })
  autoAcceptEnabled = false;

  @property({ attribute: false })
  autoAcceptStatus: AutoAcceptStatus | null = null;

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

  private _toggleAutoAccept(e: Event): void {
    // The host owns this state: keep the DOM unchanged and let the next
    // host update drive the checkbox.
    e.preventDefault();
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

  /** Observed Auto-Accept state; lines whose state is not yet known are omitted */
  private _renderAutoAcceptStatus() {
    const status = this.autoAcceptStatus;
    if (!this.autoAcceptEnabled || !status?.running) return nothing;
    const t = this._t;

    const cdpLine = {
      unknown: null,
      connected: { icon: 'pass', text: t.cdpConnected || 'CDP: connected' },
      noTarget: { icon: 'warning', text: t.cdpNoTarget || 'CDP: port open, no Agent panel target' },
      noPanel: { icon: 'warning', text: t.cdpNoPanel || 'CDP: connected, but the Agent panel was not found' },
      unavailable: { icon: 'warning', text: t.cdpUnavailable || 'CDP: not available (required for terminal commands)' }
    }[status.cdp];

    const commandText = status.commandCount === null ? null
      : status.commandCount === 0 ? (t.acceptCommandsNone || 'IDE accept commands: none registered')
      : (t.acceptCommandsAvailable || 'IDE accept commands: {0} available').replace('{0}', String(status.commandCount));

    let actionText: string | null = null;
    const action = status.lastAction;
    if (action) {
      const time = new Date(action.at).toLocaleTimeString();
      if (action.outcome === 'accepted') {
        actionText = (t.lastAccepted || 'Last accepted: "{0}" at {1}')
          .replace('{0}', action.label).replace('{1}', time);
      } else {
        const reason = {
          dangerous: t.skipReasonDangerous || 'destructive command',
          noCommandText: t.skipReasonNoCommandText || 'no command text visible',
          terminalDisabled: t.skipReasonTerminalDisabled || 'terminal approval is off'
        }[action.reason ?? 'dangerous'];
        actionText = (t.lastSkipped || 'Left for manual review: "{0}" at {1} ({2})')
          .replace('{0}', action.label).replace('{1}', time).replace('{2}', reason);
      }
    }

    return html`
      <div class="action-row auto-accept-status">
        ${cdpLine ? html`
          <div class="aa-status-line ${status.cdp === 'connected' ? 'ok' : 'warn'}">
            <i class="codicon codicon-${cdpLine.icon}"></i>
            <span>${cdpLine.text}</span>
            ${status.cdp === 'unavailable' ? html`
              <button class="aa-setup-btn" @click=${() => this._openUrl(CDP_SETUP_URL)}
                      data-tooltip="${t.cdpSetupTooltip || 'Open instructions for starting the IDE with --remote-debugging-port=9222'}">
                ${t.cdpSetup || 'Setup'}
              </button>
            ` : nothing}
          </div>
        ` : nothing}
        ${commandText ? html`
          <div class="aa-status-line ${status.commandCount ? 'ok' : 'warn'}">
            <i class="codicon codicon-${status.commandCount ? 'pass' : 'warning'}"></i>
            <span>${commandText}</span>
          </div>
        ` : nothing}
        ${actionText ? html`
          <div class="aa-status-line">
            <i class="codicon codicon-${action?.outcome === 'accepted' ? 'check' : 'circle-slash'}"></i>
            <span>${actionText}</span>
          </div>
        ` : nothing}
      </div>
    `;
  }

  protected render() {
    return html`
      <!-- Main Action Card -->
      <div class="action-card ${this._isCollapsed ? 'collapsed' : ''}">
        <!-- Auto-Accept Toggle Row (Sticky Header for collapse) -->
        <div class="action-row auto-accept-row clickable" 
             @click=${this._toggleCollapse}
             data-tooltip="${this._t.autoAcceptTooltip || 'Hands-free Mode: Automatically accept agent suggested edits (terminal commands only with tfa.system.autoAcceptTerminal)'}">
          <span class="action-label">
            <i class="codicon codicon-rocket"></i>
            ${this._t.autoAcceptLabel || 'Auto-Accept'}
          </span>
          <div class="action-controls">
            <label class="toggle-switch" @click=${(e: Event) => e.stopPropagation()}>
              <input type="checkbox" .checked=${live(this.autoAcceptEnabled)} @click=${(e: Event) => this._toggleAutoAccept(e)}>
              <span class="toggle-slider"></span>
            </label>
            <i class="codicon codicon-chevron-${this._isCollapsed ? 'down' : 'up'} collapse-icon"></i>
          </div>
        </div>

        ${this._renderAutoAcceptStatus()}

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

