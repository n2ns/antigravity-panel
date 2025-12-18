import { html } from 'lit';
import { GaugeRendererProps } from '../types';

export const renderSemiArc = ({ data, color, label }: GaugeRendererProps) => {
    const remaining = data.hasData ? data.remaining : 0;
    const valueStr = data.hasData ? remaining.toFixed(0) : 'N/A';
    const resetTime = data.resetTime || '';

    // Precision Polar Arc Math (Center 50,40)
    // Angles: 195deg Start -> -15deg End (Clockwise) = 210 deg sweep
    // Radii: 43 (Outer), 39.5 (Sep), 36 (Fill), 32.5 (Sep), 29 (Inner)
    const fillArcLength = 131.95; // (210/360) * 2 * PI * 36
    const dashOffset = fillArcLength - (remaining / 100) * fillArcLength;

    const getPath = (r: number) => {
        const rx = 50 + r * Math.cos((195 * Math.PI) / 180);
        const ry = 40 - r * Math.sin((195 * Math.PI) / 180);
        const ex = 50 + r * Math.cos((-15 * Math.PI) / 180);
        const ey = 40 - r * Math.sin((-15 * Math.PI) / 180);
        return `M ${rx.toFixed(2)} ${ry.toFixed(2)} A ${r} ${r} 0 1 1 ${ex.toFixed(2)} ${ey.toFixed(2)}`;
    };

    return html`
    <div class="gauge-container style-semi-arc">
      <div class="gauge-visual">
        <svg viewBox="0 0 100 70" class="gauge-svg">
          <path class="gauge-track-bg" d="${getPath(43)}" />
          <path class="gauge-track-fg" d="${getPath(43)}" />
          <path class="gauge-separator" d="${getPath(39.5)}" />
          <path class="gauge-separator" d="${getPath(32.5)}" />
          <path class="gauge-track-bg" d="${getPath(29)}" />
          <path class="gauge-track-fg" d="${getPath(29)}" />
          <path class="gauge-fill" d="${getPath(36)}" 
            style="stroke: ${color}; color: ${color}; stroke-dasharray: ${fillArcLength}; stroke-dashoffset: ${dashOffset};"
          />
        </svg>
        <div class="gauge-center-text">
          <div class="gauge-value">${valueStr}<span class="gauge-unit">%</span></div>
          <div class="gauge-reset-inner">${resetTime}</div>
        </div>
      </div>

      <div class="gauge-info">
        <div class="gauge-label">${label}</div>
        ${data.subLabel ? html`<div class="gauge-sub-label" title="${data.subLabel}">${data.subLabel}</div>` : ''}
      </div>
    </div>
  `;
};
