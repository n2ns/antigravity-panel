/**
 * QuotaPie - 配额饼图组件 (Light DOM)
 */

import { LitElement } from 'lit';
import { customElement, property } from 'lit/decorators.js';

import { getGaugeRenderer } from './quota/renderers/index';

@customElement('quota-pie')
export class QuotaPie extends LitElement {
  @property({ type: Object }) data?: Record<string, any>;

  @property({ type: String }) color: string = '#007acc';

  @property({ type: String }) label: string = '';

  @property({ type: String }) gaugeStyle: string = 'semi-arc';

  // Light DOM 模式
  createRenderRoot() { return this; }

  protected render() {
    const renderFunc = getGaugeRenderer(this.gaugeStyle);
    return renderFunc({
      data: {
        hasData: this.data?.hasData ?? false,
        remaining: this.data?.remaining ?? 0,
        resetTime: this.data?.resetTime ?? '',
        subLabel: this.data?.subLabel
      },
      color: this.color,
      label: this.label
    });
  }
}
