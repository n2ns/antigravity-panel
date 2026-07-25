/**
 * WeeklyUsage - Local 7-day usage estimate card (Light DOM)
 *
 * Shows daily consumption bars stacked per quota pool, summed from the
 * extension's own sampling history. This is a local estimate in short-term-pool
 * percentage points — NOT Google's official weekly limit, which the local API
 * does not expose.
 */

import { LitElement, html, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { WeeklyUsageData, WindowWithVsCode } from '../types.js';

@customElement('weekly-usage')
export class WeeklyUsage extends LitElement {
  @property({ type: Object })
  data: WeeklyUsageData | null = null;

  // Light DOM mode
  createRenderRoot() { return this; }

  protected render() {
    const data = this.data;
    if (!data || data.days.length === 0 || !data.days.some(d => d.hasData)) {
      return nothing;
    }

    const t = (window as unknown as WindowWithVsCode).__TRANSLATIONS__;
    const maxHeight = 34;
    const dayTotals = data.days.map(d => d.items.reduce((sum, item) => sum + item.usage, 0));
    const maxUsage = Math.max(...dayTotals, 0.01);
    const formatUsage = (usage: number): string => usage > 0 && usage < 0.1
      ? usage.toFixed(2)
      : usage.toFixed(1);

    return html`
      <div class="usage-chart">
        <div class="usage-chart-title"
             data-tooltip="${t?.weeklyUsageTooltip || 'Local 7-day estimate: percentage points consumed across all short-term quota pools. Not an official weekly limit.'}">
          <span>${t?.last7Days || 'Last 7 days'}</span>
          <span class="usage-total">${t?.totalConsumed || 'consumed'}: ${formatUsage(data.total)} pp</span>
        </div>
        <div class="usage-chart-bars">
          ${data.days.map((day, index) => {
            const dayLabel = new Date(day.dayStart).toLocaleDateString([], {
              month: 'numeric',
              day: 'numeric'
            });
            const dayTotal = dayTotals[index];
            let currentUsage = 0;
            const gradientStops: string[] = [];
            const tooltipParts: string[] = [];
            for (const item of day.items) {
              const start = dayTotal > 0 ? (currentUsage / dayTotal) * 100 : 0;
              currentUsage += item.usage;
              const end = dayTotal > 0 ? (currentUsage / dayTotal) * 100 : 0;
              gradientStops.push(`${item.color} ${start}% ${end}%`);
              tooltipParts.push(`${item.label}: -${formatUsage(item.usage)} pp`);
            }
            const hasUsage = dayTotal > 0;
            const barHeight = hasUsage
              ? Math.min(Math.max(3, (dayTotal / maxUsage) * maxHeight), maxHeight)
              : 1;
            const background = gradientStops.length > 0
              ? `linear-gradient(to top, ${gradientStops.join(', ')})`
              : 'var(--vscode-widget-border, rgba(255, 255, 255, 0.15))';
            const tooltip = day.hasData
              ? `${dayLabel}\n${tooltipParts.length > 0 ? tooltipParts.join('\n') : `-${formatUsage(0)} pp`}`
              : `${dayLabel}\n${t?.noSamplingData || 'No sampling data (IDE was closed)'}`;
            return html`
              <div class="usage-bar ${hasUsage ? '' : 'empty'}"
                   style="height: ${barHeight}px; background: ${background}"
                   data-tooltip="${tooltip}">
              </div>`;
          })}
        </div>
        <div class="usage-legend">
          <div class="timeline-info">1d/bar</div>
          <div class="prediction-info">
            ${data.previousTotal === null
              ? (t?.noPreviousWeekData || 'No previous-week data')
              : `${t?.previous7Days || 'Previous 7 days'}: ${formatUsage(data.previousTotal)} pp`}
          </div>
        </div>
      </div>
    `;
  }
}
