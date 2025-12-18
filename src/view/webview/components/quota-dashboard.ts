/**
 * QuotaDashboard - 配额仪表盘容器组件 (Light DOM)
 */

import { LitElement, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { QuotaDisplayItem, UsageChartData } from '../types.js';

import './quota-pie.js';
import './usage-chart.js';

@customElement('quota-dashboard')
export class QuotaDashboard extends LitElement {
  @property({ type: Array })
  quotas: QuotaDisplayItem[] | null = null;

  @property({ type: Object })
  chartData: UsageChartData | null = null;

  // Light DOM 模式
  createRenderRoot() { return this; }

  protected render() {
    const items = this.quotas || [];
    return html`
      <div class="pies-container">
        ${items.map(item => html`
          <quota-pie 
            label=${item.label}
            .data=${item}
            .color=${item.themeColor}
          ></quota-pie>
        `)}
      </div>
      <usage-chart .data=${this.chartData}></usage-chart>
    `;
  }
}
