import * as vscode from 'vscode';
import { IAutomationService } from './interfaces';
import { Scheduler } from '../../shared/utils/scheduler';
import { infoLog, errorLog } from '../../shared/utils/logger';
import * as http from 'http';
import WebSocket from 'ws';

/**
 * Chrome DevTools Protocol page/webview object from /json/list endpoint
 */
interface CdpPage {
    type: string;
    id: string;
    title?: string;
    webSocketDebuggerUrl?: string;
}

/**
 * AutomationService: Dual-strategy auto-accept
 * 1. Primary: VS Code command API (fast, lightweight)
 * 2. Fallback: CDP injection for sandboxed webviews
 */
export class AutomationService implements IAutomationService, vscode.Disposable {
    private scheduler: Scheduler;
    private readonly taskName = 'autoAccept';
    private _enabled = false;

    // CDP State
    private msgId = 1;
    private connections = new Map<string, WebSocket>();
    private static readonly CDP_PORT = 9222;
    private static readonly CDP_CONNECT_TIMEOUT_MS = 1000;

    constructor() {
        this.scheduler = new Scheduler({
            onError: (_name, err) => {
                errorLog(`Automation error: ${err}`);
            }
        });

        this.scheduler.register({
            name: this.taskName,
            interval: 800,
            execute: async () => {
                if (!this._enabled) return;
                await this.performCommandAccept();
                await this.performCdpAutoAccept();
            },
            immediate: false
        });
    }

    /**
     * Primary strategy: call Antigravity's native accept commands
     */
    private async performCommandAccept() {
        try {
            await vscode.commands.executeCommand('antigravity.agent.acceptAgentStep');
        } catch { /* no pending step */ }

        try {
            await vscode.commands.executeCommand('antigravity.terminal.accept');
        } catch { /* no pending command */ }
    }

    /**
     * Fallback strategy: CDP injection for sandboxed agent panel
     */
    private async performCdpAutoAccept() {
        const pages = await this.getPages(AutomationService.CDP_PORT);
        for (const page of pages) {
            if (page.type !== 'page' && page.type !== 'webview') continue;
            if ((page.title || '').includes('Extension Host')) continue;

            const id = `${AutomationService.CDP_PORT}:${page.id}`;
            if (!this.connections.has(id) && page.webSocketDebuggerUrl) {
                await this.connectToPage(id, page.webSocketDebuggerUrl);
            }

            const ws = this.connections.get(id);
            if (ws && ws.readyState === WebSocket.OPEN as number) {
                await this.evaluate(ws, this.getClickerScript());
            }
        }
    }

    /**
     * Injection script with Webview Guard — only runs inside the agent panel
     */    private getClickerScript(): string {
        return `
            (() => {
                const getAllRoots = (root = document) => {
                    let roots = [root];
                    try {
                        for (const iframe of root.querySelectorAll('iframe, frame')) {
                            try {
                                const doc = iframe.contentDocument || iframe.contentWindow?.document;
                                if (doc) roots.push(...getAllRoots(doc));
                            } catch (e) { }
                        }
                        for (const el of root.querySelectorAll('*')) {
                            if (el.shadowRoot) roots.push(...getAllRoots(el.shadowRoot));
                        }
                    } catch (e) { }
                    return roots;
                };

                const roots = getAllRoots();

                // Webview Guard: check if any of the roots contains the Antigravity Agent Panel container
                let isAgentPanel = false;
                for (const root of roots) {
                    if (
                        root.querySelector('.react-app-container') || 
                        root.querySelector('.agent-panel') || 
                        root.querySelector('#react-app-container') ||
                        root.querySelector('.antigravity-agent-panel') ||
                        root.querySelector('[data-testid="agent-panel"]')
                    ) {
                        isAgentPanel = true;
                        break;
                    }
                }
                if (!isAgentPanel) return;

                const clickElement = (el) => {
                    try {
                        el.click();
                        const rect = el.getBoundingClientRect();
                        const win = el.ownerDocument?.defaultView || window;
                        const opts = { 
                            view: win, 
                            bubbles: true, 
                            cancelable: true, 
                            clientX: rect.left + rect.width / 2, 
                            clientY: rect.top + rect.height / 2, 
                            buttons: 1 
                        };
                        el.dispatchEvent(new MouseEvent('mousedown', opts));
                        el.dispatchEvent(new MouseEvent('mouseup', opts));
                        el.dispatchEvent(new MouseEvent('click', opts));
                    } catch (e) { }
                    // Bubble for React synthetic events
                    let p = el.parentElement;
                    if (p) { try { p.click(); } catch(e) {} }
                };

                const TARGET_TOKENS = ['accept all', 'accept', 'confirm', 'run', 'always allow', 'allow once', 'allow'];
                const EXPANDER_TOKENS = ['requires input', 'expand'];

                roots.forEach(root => {
                    try {
                        const doc = root.ownerDocument || root;
                        const walker = doc.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, null, false);
                        let el;
                        while (el = walker.nextNode()) {
                            if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') continue;

                            const rawText = (el.innerText || el.textContent || '').trim().toLowerCase();
                            if (!rawText) continue;

                            let isMatch = false;
                            let isExpander = false;

                            if (TARGET_TOKENS.includes(rawText)) isMatch = true;
                            if (rawText.includes('always run') && rawText.length < 25) isMatch = true;
                            if (rawText.startsWith('run alt')) isMatch = true;

                            for (const token of EXPANDER_TOKENS) {
                                if (rawText === token || (token !== 'expand' && rawText.includes(token))) {
                                    isMatch = true;
                                    isExpander = true;
                                }
                            }

                            // Noise filter: skip file names and code blocks
                            if (rawText.includes('.js') || rawText.includes('.ts') || rawText.includes('.py')) isMatch = false;

                            if (!isMatch) continue;
                            if (el.dataset.autoAcceptClicked === 'true') continue;

                            // Only click interactive elements (buttons or pointer-cursor elements)
                            if (!isExpander) {
                                let safe = false;
                                if (el.tagName === 'BUTTON' || el.getAttribute('role') === 'button') safe = true;
                                try {
                                    const win = el.ownerDocument?.defaultView || window;
                                    if (win.getComputedStyle(el).cursor === 'pointer') safe = true;
                                } catch (e) {}
                                if (!safe) continue;
                                if (el.closest('pre') || el.closest('code')) continue;
                            }

                            el.dataset.autoAcceptClicked = 'true';
                            if (isExpander) {
                                setTimeout(() => { el.dataset.autoAcceptClicked = 'false'; }, 2000);
                            }

                            clickElement(el);
                        }
                    } catch (e) { }
                });
            })()
        `;
    }

    private async getPages(port: number): Promise<CdpPage[]> {
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
            let settled = false;
            const timer = setTimeout(() => {
                try { ws.terminate(); } catch { /* ignore */ }
                finish(false);
            }, AutomationService.CDP_CONNECT_TIMEOUT_MS);
            const finish = (result: boolean) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                if (!result) {
                    this.connections.delete(id);
                    try { ws.close(); } catch { /* ignore */ }
                }
                resolve(result);
            };

            ws.on('open', () => {
                this.connections.set(id, ws);
                ws.send(JSON.stringify({ id: this.msgId++, method: 'Runtime.enable' }));
                finish(true);
            });
            ws.on('error', () => finish(false));
            ws.on('close', () => {
                this.connections.delete(id);
                finish(false);
            });
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
        infoLog("Automation: Auto-accept enabled (command API + CDP fallback)");
    }

    stop(): void {
        if (!this._enabled) return;
        this._enabled = false;
        this.scheduler.stop(this.taskName);
        infoLog("Automation: Auto-accept disabled");
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
