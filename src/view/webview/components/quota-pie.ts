/**
 * QuotaPie - Quota pie chart component (Light DOM)
 */

import { LitElement } from 'lit';
import { customElement, property } from 'lit/decorators.js';

import { formatTimeUntilReset } from '../../../shared/utils/format';
import { getGaugeRenderer } from './quota/renderers/index';
import { QuotaData } from './quota/types';

/** Re-render cadence for the live countdown (display granularity is 1 minute) */
const COUNTDOWN_TICK_MS = 30_000;

@customElement('quota-pie')
export class QuotaPie extends LitElement {
  @property({ type: Object }) data?: QuotaData;

  @property({ type: String }) color: string = '#007acc';

  @property({ type: String }) label: string = '';

  @property({ type: String }) gaugeStyle: string = 'semi-arc';

  private _tickTimer: ReturnType<typeof setInterval> | null = null;

  // Light DOM mode
  createRenderRoot() { return this; }

  connectedCallback() {
    super.connectedCallback();
    this._tickTimer = setInterval(() => {
      if (this.data?.resetDate !== undefined) this.requestUpdate();
    }, COUNTDOWN_TICK_MS);
  }

  disconnectedCallback() {
    if (this._tickTimer) {
      clearInterval(this._tickTimer);
      this._tickTimer = null;
    }
    super.disconnectedCallback();
  }

  /** Live countdown from the absolute reset timestamp; server-formatted string as fallback */
  private get resetTimeText(): string {
    if (this.data?.resetDate !== undefined) {
      return formatTimeUntilReset(this.data.resetDate - Date.now());
    }
    return this.data?.resetTime ?? '';
  }

  protected render() {
    const renderFunc = getGaugeRenderer(this.gaugeStyle);
    return renderFunc({
      data: {
        hasData: this.data?.hasData ?? false,
        remaining: this.data?.remaining ?? 0,
        resetTime: this.resetTimeText,
        subLabel: this.data?.subLabel
      },
      color: this.color,
      label: this.label
    });
  }
}
