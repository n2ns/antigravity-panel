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

    const { buckets, maxUsage, interval, prediction, groupColors } = this.data;
    const t = (window as unknown as WindowWithVsCode).__TRANSLATIONS__;

    // Use actual max for scaling so bars never exceed container
    const effectiveMaxUsage = Math.max(maxUsage, 1);

    // Calculate total consumption across all buckets for the header
    let totalConsumption = 0;
    for (const bucket of buckets) {
      for (const item of bucket.items) {
        totalConsumption += item.usage;
      }
    }

    const timelineText = `Last ${this.data.displayMinutes} min · ${interval}s/bar`;

    // Build unique group entries for the legend (only groups with actual data)
    const legendGroups = new Map<string, { label: string; color: string }>();
    for (const bucket of buckets) {
      for (const item of bucket.items) {
        if (!legendGroups.has(item.groupId)) {
          legendGroups.set(item.groupId, {
            label: item.groupId,
            color: (groupColors && groupColors[item.groupId]) || item.color || '#888'
          });
        }
      }
    }

    return html`
      <div class="usage-chart">
        <div class="usage-chart-title">
          <span>${t?.usageHistory || 'Usage History'}</span>
          <span>${t?.totalConsumed || 'consumed'}: ${totalConsumption.toFixed(1)} pp</span>
        </div>
        <div class="usage-chart-bars">
          ${buckets.map(bucket => {
      const maxHeight = 30;  // Reserve 6px headroom (36 - 6 = 30)
      let currentHeight = 0;
      const gradientStops: string[] = [];
      const tooltipParts: string[] = [];

      if (bucket.items && bucket.items.length > 0) {
        for (const item of bucket.items) {
          const height = (item.usage / effectiveMaxUsage) * maxHeight;
          const start = currentHeight;
          const end = currentHeight + height;
          gradientStops.push(`${item.color} ${start}px ${end}px`);

          currentHeight = end;
          // Use group label from groupColors map for display; fall back to groupId
          const label = item.groupId;
          tooltipParts.push(`${label}: -${item.usage.toFixed(1)} pp`);
        }
      }

      const totalHeight = Math.min(Math.max(3, currentHeight), maxHeight);
      const background = gradientStops.length > 0
        ? `linear-gradient(to top, ${gradientStops.join(', ')})`
        : 'rgba(255, 255, 255, 0.15)';

      const tooltip = tooltipParts.length > 0 ? tooltipParts.join('\n') : 'No usage data';

      return html`
              <div class="usage-bar" 
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
                ⏱️${prediction.runway}
              </span>
            ` : (prediction ? html`
              <span data-tooltip="${t?.stableStatusTooltip || 'Quota usage status: Stable'}">
                ⏱️Stable
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

