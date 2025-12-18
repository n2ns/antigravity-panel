/**
 * WebviewHtmlBuilder: Generates Webview HTML skeleton
 *
 * Architecture: No VS Code dependency - accepts plain strings
 * External CSS for CSP compliance (no 'unsafe-inline')
 */

import * as crypto from "crypto";

// ==================== HTML Builder ====================

/**
 * Configuration for WebviewHtmlBuilder
 */
export interface WebviewHtmlConfig {
    /** CSP source for allowed resources */
    cspSource: string;
    /** URI string for codicons stylesheet */
    codiconsUri: string;
    /** URI string for webview styles */
    stylesUri: string;
    /** URI string for webview script */
    webviewUri: string;
}

/**
 * Generates a cryptographically secure nonce for CSP
 */
export function generateNonce(): string {
    return crypto.randomBytes(32).toString('base64');
}

/**
 * WebviewHtmlBuilder: Generates Webview HTML
 *
 * No VS Code dependency - accepts plain string URIs
 * Uses external CSS for CSP compliance (no 'unsafe-inline')
 */
export class WebviewHtmlBuilder {
    private config: WebviewHtmlConfig | null = null;

    /**
     * Set the head configuration
     * @param cspSource CSP source string
     * @param codiconsUri Codicons CSS URI as string
     * @param stylesUri Webview styles CSS URI as string
     * @param webviewUri Webview script URI as string
     */
    setHead(cspSource: string, codiconsUri: string, stylesUri: string, webviewUri: string): this {
        this.config = { cspSource, codiconsUri, stylesUri, webviewUri };
        this.config = { cspSource, codiconsUri, stylesUri, webviewUri };
        return this;
    }

    private translations: Record<string, string> = {};

    setTranslations(translations: Record<string, string>): this {
        this.translations = translations;
        return this;
    }

    build(): string {
        if (!this.config) {
            throw new Error("WebviewHtmlBuilder: setHead() must be called before build()");
        }

        const { cspSource, codiconsUri, stylesUri, webviewUri } = this.config;
        const nonce = generateNonce();

        // NOTE: 'unsafe-inline' is required for style-src because:
        // - quota-pie.ts uses dynamic inline style: style="background: conic-gradient(...)"
        // - usage-chart.ts uses dynamic inline style: style="height: Npx; background: linear-gradient(...)"
        // These cannot be pre-defined in CSS as they depend on runtime quota data.
        return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${cspSource}; img-src ${cspSource} data:;">
  <link href="${codiconsUri}" rel="stylesheet" />
  <link href="${stylesUri}" rel="stylesheet" />
</head>
<body>
  <script nonce="${nonce}">
    window.__TRANSLATIONS__ = ${JSON.stringify(this.translations)};
  </script>
  <sidebar-app></sidebar-app>
  <script nonce="${nonce}" type="module" src="${webviewUri}"></script>
</body>
</html>`;
    }
}
