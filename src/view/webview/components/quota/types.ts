import { TemplateResult } from 'lit';

export interface QuotaData {
    remaining: number;
    resetTime: string;
    hasData: boolean;
    subLabel?: string;
}

export interface GaugeRendererProps {
    data: QuotaData;
    color: string;
    label: string;
}

export type GaugeRenderer = (props: GaugeRendererProps) => TemplateResult;
