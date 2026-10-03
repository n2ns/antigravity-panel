import { TemplateResult } from 'lit';
import type { WeeklyLimitData } from '../../types.js';

export interface QuotaData {
    remaining: number;
    resetTime: string;
    /** Absolute reset timestamp (epoch ms) enabling a live client-side countdown */
    resetDate?: number;
    hasData: boolean;
    /** Official weekly limit, shown as a bar under the gauge */
    weekly?: WeeklyLimitData;
}

export interface GaugeRendererProps {
    data: QuotaData;
    color: string;
    label: string;
}

export type GaugeRenderer = (props: GaugeRendererProps) => TemplateResult;
