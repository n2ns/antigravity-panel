/**
 * WeeklyUsage - Local 7-day usage estimate card (Light DOM)
 *
 * Shows daily consumption bars for the active quota pool, summed from the
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
    const maxUsage = Math.max(...data.days.map(d => d.usage), 0.01);
    const formatUsage = (usage: number): string => usage > 0 && usage < 0.1
      ? usage.toFixed(2)
      : usage.toFixed(1);

    return html`
      <div class="usage-chart weekly-usage">
        <div class="usage-chart-title"
             data-tooltip="${t?.weeklyUsageTooltip || 'Local 7-day estimate: percentage points of the short-term quota pool consumed. Not the official weekly limit.'}">
          <span>${t?.weeklyUsage || 'Weekly Usage'} · ${data.groupLabel}</span>
          <span class="usage-total">${t?.totalConsumed || 'consumed'}: ${formatUsage(data.total)} pp</span>
        </div>
        <div class="usage-chart-bars">
          ${data.days.map(day => {
            const dayLabel = new Date(day.dayStart).toLocaleDateString([], {
              month: 'numeric',
              day: 'numeric'
            });
            const hasUsage = day.usage > 0;
            const height = hasUsage
              ? Math.min(Math.max(3, (day.usage / maxUsage) * maxHeight), maxHeight)
              : 1;
            const background = hasUsage
              ? data.themeColor
              : 'var(--vscode-widget-border, rgba(255, 255, 255, 0.15))';
            const tooltip = day.hasData
              ? `${dayLabel}\n-${formatUsage(day.usage)} pp`
              : `${dayLabel}\n${t?.noSamplingData || 'No sampling data (IDE was closed)'}`;
            return html`
              <div class="usage-bar ${hasUsage ? '' : 'empty'}"
                   style="height: ${height}px; background: ${background}"
                   data-tooltip="${tooltip}">
              </div>`;
          })}
        </div>
        <div class="usage-legend">
          <div class="timeline-info">${(t?.last7Days || 'Last 7 days')} · 1d/bar</div>
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
