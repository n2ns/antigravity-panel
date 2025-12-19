import { html } from 'lit';
import { GaugeRendererProps } from '../types';

export const renderClassicDonut = ({ data, color, label }: GaugeRendererProps) => {
  const remaining = data.hasData ? data.remaining : 0;
  const valueStr = data.hasData ? remaining.toFixed(0) : 'N/A';
  const resetTime = data.resetTime || '';

  // Background ring color: low opacity adapted for themes
  const emptyColor = 'rgba(128, 128, 128, 0.15)';
  const gradient = `conic-gradient(${color} 0% ${remaining}%, ${emptyColor} ${remaining}% 100%)`;

  return html`
    <div class="gauge-container style-classic-donut">
      <div class="gauge-visual">
        <div class="pie-ring" style="background: ${gradient}"></div>
        <div class="gauge-center-text">
          <div class="gauge-value">
            ${valueStr}${data.hasData ? html`<span class="gauge-unit">%</span>` : ''}
          </div>
        </div>
      </div>
      <div class="gauge-info">
        <div class="gauge-label">${label}</div>
        <div class="gauge-reset-inner">${resetTime}</div>
        ${data.subLabel ? html`<div class="gauge-sub-label" title="${data.subLabel}">${data.subLabel}</div>` : ''}
      </div>
    </div>
  `;
};
