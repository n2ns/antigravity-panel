/**
 * Global Tooltip Manager
 * Handles creating and positioning a dedicated tooltip element.
 * Detached from CSS :after pseudo-elements for better control.
 */

export class TooltipManager {
    private _tooltipEl: HTMLElement;
    private _activeTarget: HTMLElement | null = null;
    private _hideTimeout: number | undefined;
    private readonly _mouseOverHandler = this._handleMouseOver.bind(this);
    private readonly _mouseOutHandler = this._handleMouseOut.bind(this);

    constructor() {
        this._tooltipEl = this._createTooltipElement();
        this._attachListeners();
    }

    private _createTooltipElement(): HTMLElement {
        const el = document.createElement('div');
        el.className = 'global-tooltip';
        el.style.position = 'fixed';
        el.style.zIndex = '10000';
        el.style.visibility = 'hidden';
        el.style.opacity = '0';
        el.style.pointerEvents = 'none';
        el.style.transition = 'opacity 0.15s ease';
        document.body.appendChild(el);
        return el;
    }

    private _attachListeners(): void {
        document.body.addEventListener('mouseover', this._mouseOverHandler);
        document.body.addEventListener('mouseout', this._mouseOutHandler);
    }

    dispose(): void {
        document.body.removeEventListener('mouseover', this._mouseOverHandler);
        document.body.removeEventListener('mouseout', this._mouseOutHandler);

        if (this._hideTimeout !== undefined) {
            window.clearTimeout(this._hideTimeout);
            this._hideTimeout = undefined;
        }

        this._activeTarget = null;
        this._tooltipEl.remove();
    }

    private _handleMouseOver(e: MouseEvent): void {
        const target = e.target as HTMLElement;
        const tooltipSource = target.closest('[data-tooltip]') as HTMLElement;

        if (!tooltipSource) {
            return;
        }

        // Determine content
        const content = tooltipSource.getAttribute('data-tooltip');
        if (!content) return;

        if (this._hideTimeout !== undefined) {
            window.clearTimeout(this._hideTimeout);
            this._hideTimeout = undefined;
        }

        this._activeTarget = tooltipSource;
        this._showTooltip(content, tooltipSource);
    }

    private _handleMouseOut(e: MouseEvent): void {
        const target = e.target as HTMLElement;
        const tooltipSource = target.closest('[data-tooltip]') as HTMLElement;

        // Only hide if we are leaving the current target
        if (tooltipSource && tooltipSource === this._activeTarget) {
            this._hideTimeout = window.setTimeout(() => {
                this._hideTooltip();
            }, 50);
        }
    }

    private _showTooltip(content: string, target: HTMLElement): void {
        this._tooltipEl.textContent = content;
        this._tooltipEl.style.visibility = 'visible';
        this._tooltipEl.style.opacity = '1';

        // Position Calculation
        const rect = target.getBoundingClientRect();
        // Use document.documentElement for viewport width (ignoring scrollbars if possible)
        const viewportWidth = document.documentElement.clientWidth || document.body.clientWidth;

        // 1. Vertical Positioning: Above the element + gap
        // Use transform to shift up by own height
        const top = rect.top - 8;
        this._tooltipEl.style.top = `${top}px`;

        // 2. Horizontal Positioning: Always left-aligned with panel, full width allowed
        this._tooltipEl.style.left = '10px';
        this._tooltipEl.style.right = 'auto'; // Reset right
        this._tooltipEl.style.width = 'auto';  // Reset width
        this._tooltipEl.style.boxSizing = 'border-box';
        // Max width = viewport width - 20px (10px margin on each side)
        this._tooltipEl.style.maxWidth = `${viewportWidth - 20}px`;
        this._tooltipEl.style.transform = 'translateY(-100%)';
    }

    private _hideTooltip(): void {
        this._tooltipEl.style.opacity = '0';
        this._tooltipEl.style.visibility = 'hidden';
        this._activeTarget = null;
    }
}
