/**
 * UsageChart - Usage bar chart component (Light DOM)
 */

import { LitElement, html, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { UsageChartData, WindowWithVsCode } from '../types.js';

@customElement('usage-chart')
export class UsageChart extends LitElement {
  @property({ type: Object })
  data: UsageChartData | null = null;

  // Light DOM mode
  createRenderRoot() { return this; }

  protected render() {
    if (!this.data || !this.data.buckets || this.data.buckets.length === 0) {
      return nothing;
    }

    const { buckets, maxUsage, interval, prediction, groupColors, groupLabels } = this.data;
    const bucketTotals = buckets.map(bucket => bucket.items.reduce(
      (sum, item) => sum + (Number.isFinite(item.usage) && item.usage > 0 ? item.usage : 0),
      0
    ));
    const totalConsumption = bucketTotals.reduce((sum, usage) => sum + usage, 0);
    if (totalConsumption <= 0) {
      return nothing;
    }

    const t = (window as unknown as WindowWithVsCode).__TRANSLATIONS__;
    const runwayText = prediction?.runway === 'Stable'
      ? (t?.usageStable || 'Usage stable')
      : prediction?.runway;
    // Trust the actual bucket data as a fallback for restored or older cached state.
    const effectiveMaxUsage = Math.max(Number.isFinite(maxUsage) ? maxUsage : 0, ...bucketTotals, 0.01);

    const formatUsage = (usage: number): string => usage > 0 && usage < 0.1
      ? usage.toFixed(2)
      : usage.toFixed(1);
    const formatInterval = (seconds: number): string => seconds >= 60 && seconds % 60 === 0
      ? `${seconds / 60}m/bar`
      : `${seconds}s/bar`;

    const intervalSeconds = Number.isFinite(interval) && interval > 0
      ? interval
      : Math.max(1, Math.round((this.data.displayMinutes * 60) / buckets.length));
    const timelineText = `Last ${this.data.displayMinutes} min · ${formatInterval(intervalSeconds)}`;

    // Build unique group entries for the legend (only groups with actual data)
    const legendGroups = new Map<string, { label: string; color: string }>();
    for (const bucket of buckets) {
      for (const item of bucket.items) {
        if (!legendGroups.has(item.groupId)) {
          legendGroups.set(item.groupId, {
            label: groupLabels?.[item.groupId] || item.groupId,
            color: (groupColors && groupColors[item.groupId]) || item.color || '#888'
          });
        }
      }
    }

    return html`
      <div class="usage-chart">
        <div class="usage-chart-title">
          <span>${t?.usageHistory || 'Usage History'}</span>
          <span class="usage-total">${t?.totalConsumed || 'consumed'}: ${formatUsage(totalConsumption)} pp</span>
        </div>
        <div class="usage-chart-bars">
          ${buckets.map(bucket => {
      const maxHeight = 34;
      let currentHeight = 0;
      const gradientStops: string[] = [];
      const tooltipParts: string[] = [];
      const validItems = bucket.items.filter(item => Number.isFinite(item.usage) && item.usage > 0);

      if (validItems.length > 0) {
        for (const item of validItems) {
          const height = (item.usage / effectiveMaxUsage) * maxHeight;
          const start = currentHeight;
          const end = currentHeight + height;
          const color = item.color || groupColors?.[item.groupId] || '#888';
          gradientStops.push(`${color} ${start}px ${end}px`);

          currentHeight = end;
          const label = groupLabels?.[item.groupId] || item.groupId;
          tooltipParts.push(`${label}: -${formatUsage(item.usage)} pp`);
        }
      }

      const hasUsage = currentHeight > 0;
      const totalHeight = hasUsage ? Math.min(Math.max(3, currentHeight), maxHeight) : 1;
      const background = gradientStops.length > 0
        ? `linear-gradient(to top, ${gradientStops.join(', ')})`
        : 'var(--vscode-widget-border, rgba(255, 255, 255, 0.15))';

      const bucketTime = new Date(bucket.endTime).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit'
      });
      const tooltip = tooltipParts.length > 0
        ? `${bucketTime}\n${tooltipParts.join('\n')}`
        : `${bucketTime}\n${t?.noReportedQuotaChange || 'No reported quota change'}`;

      return html`
              <div class="usage-bar ${hasUsage ? '' : 'empty'}"
                   style="height: ${totalHeight}px; background: ${background}" 
                   data-tooltip="${tooltip}">
              </div>`;
    })}
        </div>
        <div class="usage-legend">
          <div class="timeline-info">${timelineText}</div>
          <div class="prediction-info" style="display: flex; gap: 6px;">
            ${prediction && prediction.usageRate > 0 ? html`
              <span data-tooltip="${t?.usageRateTooltip || 'Usage Rate: Average percentage of quota consumed per hour'}">
                🔥${prediction.usageRate.toFixed(1)} pp/h
              </span>
              <span class="legend-sep">·</span>
              <span data-tooltip="${t?.runwayTooltip || 'Runway: Estimated remaining time before quota is exhausted'}">
                ⏱️${runwayText}
              </span>
            ` : (prediction ? html`
              <span data-tooltip="${t?.stableStatusTooltip || 'Quota usage status: Stable'}">
                ⏱️${runwayText}
              </span>
            ` : nothing)}
          </div>
        </div>
        ${legendGroups.size > 0 ? html`
          <div class="usage-chart-group-legend"
               data-tooltip="${t?.chartLegendTooltip || 'Each bar shows quota percentage points consumed per interval. Height = consumption intensity.'}">
            ${Array.from(legendGroups.entries()).map(([, g]) => html`
              <span class="legend-item">
                <span class="legend-dot" style="background: ${g.color}"></span>
                ${g.label}
              </span>
            `)}
            <span class="legend-unit">pp = ${t?.ppExplanation || 'percentage points'}</span>
          </div>
        ` : nothing}
      </div>
    `;
  }
}
