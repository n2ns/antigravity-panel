/**
 * QuotaPie - 配额饼图组件 (Light DOM)
 */

import { LitElement, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { QuotaDisplayItem } from '../types.js';

@customElement('quota-pie')

export class QuotaPie extends LitElement {
  @property({ type: Object })
  data: QuotaDisplayItem | null = null;

  @property({ type: String })
  label = '';

  @property({ type: String })
  color = '#424242';

  // Light DOM 模式
  createRenderRoot() { return this; }
  
  // Method _updateColor removed as color is now passed in props

  protected render() {
    const remaining = this.data?.hasData ? this.data.remaining : 0;
    const valueStr = this.data?.hasData ? remaining.toFixed(0) : 'N/A';
    const resetTime = this.data?.resetTime || '';
    
    // 背景环颜色：使用低不透明度的白色或黑色，适应深浅主题
    const emptyColor = 'rgba(128, 128, 128, 0.15)';
    const gradient = `conic-gradient(${this.color} 0% ${remaining}%, ${emptyColor} ${remaining}% 100%)`;

    return html`
      <div class="pie-container">
        <div class="pie-ring" style="background: ${gradient}"></div>
        <div class="pie-content">
          <div class="pie-value">
            ${valueStr}${this.data?.hasData ? html`<span class="pie-percent-symbol">%</span>` : ''}
          </div>
        </div>
      </div>
      <div class="pie-label">${this.label}</div>
      ${this.data?.subLabel ? html`<div class="pie-sub-label" title="${this.data.subLabel}">${this.data.subLabel}</div>` : ''}
      <div class="pie-reset">${resetTime}</div>
    `;
  }
}
