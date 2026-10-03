/**
 * ContextCard - Context window usage of the current conversation
 */

import { LitElement, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { ContextViewData, WindowWithVsCode } from '../types.js';

/** 37200 -> "37.2K", 256000 -> "256K" */
export function formatTokens(tokens: number): string {
  if (tokens < 1000) return String(Math.round(tokens));
  const thousands = tokens / 1000;
  return `${thousands >= 100 ? Math.round(thousands) : Number(thousands.toFixed(1))}K`;
}

@customElement('context-card')
export class ContextCard extends LitElement {
  @property({ attribute: false })
  data: ContextViewData | null = null;

  // Light DOM mode for consistent styling
  createRenderRoot() { return this; }

  render() {
    if (!this.data) return html``;
    const t = (window as unknown as WindowWithVsCode).__TRANSLATIONS__ || {};
    const { title, model, usedTokens, maxTokens, percent, warningThreshold, compressedAt } = this.data;
    const level = percent >= 95 ? 'critical' : percent >= warningThreshold ? 'warning' : 'normal';
    const details = [title, model].filter(Boolean).join(' · ');
    const tooltip = t.contextTooltip
      || 'Context window of the current conversation: tokens of the latest model call, as estimated by the Language Server. When it is full, the IDE compresses the conversation and earlier details may be lost.';

    return html`
      <div class="credits-bar context-card">
        <div class="credit-item" data-tooltip="${tooltip}">
          <div class="credit-header">
            <span class="credit-label">${t.context || 'Context'}</span>
            <span class="credit-value">${formatTokens(usedTokens)} / ${formatTokens(maxTokens)} (${Math.round(percent)}%)</span>
          </div>
          <div class="credit-progress">
            <div class="credit-fill context-fill ${level}" style="width: ${percent}%;"></div>
          </div>
          ${details ? html`<div class="context-details">${details}</div>` : ''}
          ${compressedAt ? html`
            <div class="context-compressed">
              ${(t.contextCompressedAt || 'Compressed at {0}').replace('{0}', new Date(compressedAt).toLocaleTimeString())}
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }
}
