import * as vscode from 'vscode';
import { IAutomationService } from './interfaces';
import { Scheduler } from '../../shared/utils/scheduler';
import { infoLog, errorLog } from '../../shared/utils/logger';
import * as http from 'http';
import WebSocket from 'ws';

/**
 * AutomationService: Implements the CDP (Chrome DevTools Protocol) auto-accept feature
 * Bypasses UI sandboxing by connecting directly to the Chromium debugger.
 */
export class AutomationService implements IAutomationService, vscode.Disposable {
    private scheduler: Scheduler;
    private readonly taskName = 'autoAccept';
    private _enabled = false;

    // CDP State
    private msgId = 1;
    private connections = new Map<string, WebSocket>();
    private readonly BASE_PORT = 9000;
    private readonly PORT_RANGE = 5;

    constructor() {
        this.scheduler = new Scheduler({
            onError: (_name, err) => {
                errorLog(`Automation error: ${err}`);
            }
        });

        this.scheduler.register({
            name: this.taskName,
            interval: 800, // Safe default interval
            execute: async () => {
                if (!this._enabled) return;
                await this.performCdpAutoAccept();
            },
            immediate: false
        });
    }

    /**
     * Finds active webviews and evaluates the clicker script to bypass UI blocks
     */
    private async performCdpAutoAccept() {
        for (let port = this.BASE_PORT - this.PORT_RANGE; port <= this.BASE_PORT + this.PORT_RANGE; port++) {
            const pages = await this.getPages(port);
            for (const page of pages) {
                if (page.type !== 'page' && page.type !== 'webview') continue;
                if ((page.title || "").includes("Extension Host")) continue;

                const id = `${port}:${page.id}`;
                if (!this.connections.has(id)) {
                    if (page.webSocketDebuggerUrl) {
                        await this.connectToPage(id, page.webSocketDebuggerUrl);
                    }
                }

                const ws = this.connections.get(id);
                if (ws && ws.readyState === WebSocket.OPEN as number) {
                    await this.evaluate(ws, this.getClickerScript());
                }
            }
        }
    }

    /**
     * Native JS payload dropped straight into the webview execution context
     */
    private getClickerScript(): string {
        return `
            (() => {
                const getAllRoots = (root = document) => {
                    let roots = [root];
                    try {
                        const iframes = root.querySelectorAll('iframe, frame');
                        for (const iframe of iframes) {
                            try {
                                const doc = iframe.contentDocument || iframe.contentWindow?.document;
                                if (doc) roots.push(...getAllRoots(doc));
                            } catch (e) { }
                        }
                        const shadowHosts = root.querySelectorAll('*');
                        for (const el of shadowHosts) {
                            if (el.shadowRoot) roots.push(...getAllRoots(el.shadowRoot));
                        }
                    } catch (e) { }
                    return roots;
                };

                const roots = getAllRoots();
                const pageTitle = document.title || "";
                const isReviewPage = pageTitle.includes("Review Changes");

                roots.forEach(root => {
                    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, null, false);
                    let el;
                    while (el = walker.nextNode()) {
                        if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') continue;

                        const rawText = (el.innerText || el.textContent || "").trim().toLowerCase();
                        if (!rawText) continue;

                        let isMatch = false;
                        let isExpander = false;

                        // Identify target tokens (Auto Accept logic, Permissions, etc.)
                        if (['accept all', 'accept', 'confirm', 'run', 'always allow', 'allow once', 'allow'].includes(rawText)) isMatch = true;
                        if (rawText.includes('always run') && rawText.length < 25) isMatch = true;
                        if (rawText.startsWith('run alt')) isMatch = true;
                        
                        // Dropdowns/Expanders requiring revelation before clicking
                        if (rawText.includes('requires input') || rawText === 'expand') { isMatch = true; isExpander = true; }
                        if (rawText.includes('.js') || rawText.includes('.ts')) isMatch = false; // Noise filtering

                        if (isMatch) {
                            if (el.dataset.cdpSniperClicked === 'true') continue;

                            // Security constraints for chat panel clicking
                            if (!isReviewPage && !isExpander) {
                                let safe = false;
                                if (el.tagName === 'BUTTON') safe = true;
                                try {
                                    const style = window.getComputedStyle(el);
                                    if (style.cursor === 'pointer') safe = true;
                                } catch(e) {}
                                if (!safe) continue;
                                if (el.closest('pre') || el.closest('code')) continue;
                            }

                            // Mark as clicked
                            el.dataset.cdpSniperClicked = 'true';
                            if (isExpander) { setTimeout(() => { el.dataset.cdpSniperClicked = 'false'; }, 2000); }

                            try {
                                el.click(); 
                                const rect = el.getBoundingClientRect();
                                const opts = { view: window, bubbles: true, cancelable: true, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2, buttons: 1 };
                                el.dispatchEvent(new MouseEvent('mousedown', opts));
                                el.dispatchEvent(new MouseEvent('mouseup', opts));
                                el.dispatchEvent(new MouseEvent('click', opts));
                            } catch(e) {}

                            // Robust parent triggering for React synthetic events
                            let p = el.parentElement;
                            if (p) { p.click(); if (p.parentElement) p.parentElement.click(); }
                        }
                    }
                });
            })()
        `;
    }

    private async getPages(port: number): Promise<any[]> {
        return new Promise((resolve) => {
            const req = http.get({ hostname: '127.0.0.1', port, path: '/json/list', timeout: 500 }, (res) => {
                let body = '';
                res.on('data', chunk => body += chunk);
                res.on('end', () => {
                    try { resolve(JSON.parse(body)); } catch { resolve([]); }
                });
            });
            req.on('error', () => resolve([]));
            req.on('timeout', () => { req.destroy(); resolve([]); });
        });
    }

    private async connectToPage(id: string, wsUrl: string): Promise<boolean> {
        return new Promise((resolve) => {
            const ws = new WebSocket(wsUrl);
            ws.on('open', () => {
                this.connections.set(id, ws);
                ws.send(JSON.stringify({ id: this.msgId++, method: 'Runtime.enable' }));
                resolve(true);
            });
            ws.on('error', () => resolve(false));
            ws.on('close', () => this.connections.delete(id));
        });
    }

    private async evaluate(ws: WebSocket, expression: string): Promise<void> {
        return new Promise((resolve) => {
            ws.send(JSON.stringify({
                id: this.msgId++,
                method: 'Runtime.evaluate',
                params: { expression, userGesture: true, awaitPromise: true }
            }));
            resolve();
        });
    }

    start(): void {
        if (this._enabled) return;
        this._enabled = true;
        this.scheduler.start(this.taskName);
        infoLog("Automation: Auto-accept connected via Chrome DevTools Protocol");
    }

    stop(): void {
        if (!this._enabled) return;
        this._enabled = false;
        this.scheduler.stop(this.taskName);
        infoLog("Automation: Auto-accept disconnected");
    }

    isRunning(): boolean {
        return this._enabled && this.scheduler.isRunning(this.taskName);
    }

    toggle(): boolean {
        if (this._enabled) {
            this.stop();
        } else {
            this.start();
        }
        return this._enabled;
    }

    updateInterval(ms: number): void {
        this.scheduler.updateInterval(this.taskName, ms);
    }

    dispose(): void {
        this.scheduler.dispose();
        this.connections.forEach(ws => {
            try { ws.close(); } catch { /* ignore */ }
        });
        this.connections.clear();
    }
}
