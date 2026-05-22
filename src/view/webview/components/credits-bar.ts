/**
 * CreditsBar - Credits display bar component
 * Shows Prompt Credits and Flow Credits
 */

import { LitElement, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { TokenUsageData, WindowWithVsCode } from '../types.js';

@customElement('credits-bar')
export class CreditsBar extends LitElement {
  @property({ type: Object })
  tokenUsage: TokenUsageData | null = null;

  // Light DOM mode for consistent styling
  createRenderRoot() { return this; }

  render() {
    if (!this.tokenUsage) {
      return html``;
    }

    const { promptCredits, flowCredits, formatted, userCredits } = this.tokenUsage;
    const t = (window as unknown as WindowWithVsCode).__TRANSLATIONS__ || {};

    // If no data, don't render
    if (!promptCredits && !flowCredits && (!userCredits || userCredits.length === 0)) {
      return html``;
    }

    return html`
      <div class="credits-bar">
        <div class="credits-title">AI Credits</div>
        ${promptCredits ? html`
          <div class="credit-item" data-tooltip="${t.promptTooltip || 'Reasoning Credits: Consumed by conversation input and result generation (thinking).'}\nAvailable: ${promptCredits.available}\nLimit: ${promptCredits.monthly}">
            <span class="credit-label">${t.promptCredits || 'Prompt'}</span>
            <span class="credit-value">${formatted.promptAvailable}/${formatted.promptMonthly}</span>
            <div class="credit-progress">
              <div class="credit-fill" style="width: ${promptCredits.remainingPercentage}%; background: ${this._getColor(promptCredits.remainingPercentage)};"></div>
            </div>
          </div>
        ` : ''}
        ${flowCredits ? html`
          <div class="credit-item" data-tooltip="${t.flowTooltip || 'Execution Credits: Consumed by steps during search, modification, and command execution (operation).'}\nAvailable: ${flowCredits.available}\nLimit: ${flowCredits.monthly}">
            <span class="credit-label">${t.flowCredits || 'Flow'}</span>
            <span class="credit-value">${formatted.flowAvailable}/${formatted.flowMonthly}</span>
            <div class="credit-progress">
              <div class="credit-fill" style="width: ${flowCredits.remainingPercentage}%; background: ${this._getColor(flowCredits.remainingPercentage)};"></div>
            </div>
          </div>
        ` : ''}
        ${userCredits ? userCredits.map(c => {
          const label = c.creditType.split('_').map(w => w.toLowerCase() === 'ai' ? 'AI' : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
          return html`
            <div class="credit-item" data-tooltip="${label} Credits\nAvailable: ${c.creditAmount}">
              <span class="credit-label">${label}</span>
              <span class="credit-value">${c.creditAmount}</span>
              <div class="credit-progress">
                <div class="credit-fill" style="width: 100%; background: var(--vscode-charts-blue, #3794ff);"></div>
              </div>
            </div>
          `;
        }) : ''}
      </div>
    `;
  }

  private _getColor(remainingPct: number): string {
    if (remainingPct <= 10) return 'var(--vscode-charts-red, #f14c4c)';
    if (remainingPct <= 30) return 'var(--vscode-charts-yellow, #cca700)';
    return 'var(--vscode-charts-green, #89d185)';
  }
}
