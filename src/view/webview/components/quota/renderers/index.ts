import { GaugeRenderer } from '../types';
import { renderSemiArc } from './semi-arc';
import { renderClassicDonut } from './classic-donut';

const gaugeRenderers: Record<string, GaugeRenderer> = {
    'semi-arc': renderSemiArc,
    'classic-donut': renderClassicDonut,
};

export const getGaugeRenderer = (style: string): GaugeRenderer => {
    return gaugeRenderers[style] || renderSemiArc;
};
