/**
 * UsageChart - 使用量柱状图组件 (Light DOM)
 */

import { LitElement, html, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { UsageChartData } from '../types.js';

@customElement('usage-chart')
export class UsageChart extends LitElement {
  @property({ type: Object })
  data: UsageChartData | null = null;

  // Light DOM 模式
  createRenderRoot() { return this; }

  protected render() {
    if (!this.data || !this.data.buckets || this.data.buckets.length === 0) {
      return nothing;
    }

    const { buckets, maxUsage, interval, prediction } = this.data;

    // 左侧：Timeline 信息
    const timelineText = `Timeline: ${this.data.displayMinutes} min · Step: ${interval} sec`;
    
    // 右侧：预测信息
    let predictionText = '';
    if (prediction && prediction.usageRate > 0) {
      predictionText = `🔥${prediction.usageRate.toFixed(1)}%/h · ⏱️${prediction.runway}`;
    } else if (prediction) {
      predictionText = 'Stable';
    }

    return html`
      <div class="usage-chart">
        <div class="usage-chart-title">
          <span>Usage History</span>
          <span>max: ${maxUsage.toFixed(1)}%</span>
        </div>
        <div class="usage-chart-bars">
          ${buckets.map(bucket => {
            const maxHeight = 36;
            let currentHeight = 0;
            const gradientStops: string[] = [];
            const tooltipParts: string[] = [];

            if (bucket.items && bucket.items.length > 0) {
              // 计算每段高度并生成渐变
              for (const item of bucket.items) {
                 const height = (item.usage / maxUsage) * maxHeight;
                 // 忽略太细微的变化以保持 UI 干净，累积高度
                 const start = currentHeight;
                 const end = currentHeight + height;
                 gradientStops.push(`${item.color} ${start}px ${end}px`);
                 
                 currentHeight = end;
                 tooltipParts.push(`${item.groupId}: ${item.usage.toFixed(1)}%`);
              }
            }
            
            // 至少显示 3px 高度以占位
            const totalHeight = Math.max(3, currentHeight);
            
            // 构造 CSS 背景
            const background = gradientStops.length > 0
              ? `linear-gradient(to top, ${gradientStops.join(', ')})`
              : 'rgba(255, 255, 255, 0.15)'; // 空数据颜色

            const title = tooltipParts.length > 0 ? tooltipParts.join('\n') : 'No usage data';
            
            return html`<div class="usage-bar" style="height: ${totalHeight}px; background: ${background}" title="${title}"></div>`;
          })}
        </div>
        <div class="usage-legend">
          <span>${timelineText}</span>
          ${predictionText ? html`<span>${predictionText}</span>` : nothing}
        </div>
      </div>
    `;
  }
}
