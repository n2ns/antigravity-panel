import { GaugeRenderer } from '../types';
import { renderSemiArc } from './semi-arc';

export const gaugeRenderers: Record<string, GaugeRenderer> = {
    'semi-arc': renderSemiArc,
};

export const getGaugeRenderer = (style: string): GaugeRenderer => {
    return gaugeRenderers[style] || renderSemiArc;
};
