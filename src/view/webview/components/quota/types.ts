import { TemplateResult } from 'lit';

export interface QuotaData {
    remaining: number;
    resetTime: string;
    /** Absolute reset timestamp (epoch ms) enabling a live client-side countdown */
    resetDate?: number;
    hasData: boolean;
    subLabel?: string;
}

export interface GaugeRendererProps {
    data: QuotaData;
    color: string;
    label: string;
}

export type GaugeRenderer = (props: GaugeRendererProps) => TemplateResult;
