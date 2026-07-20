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
 * AutomationService: command-first Auto-Accept with a panel fallback
 * 1. Use registered IDE commands when the action is exposed through the API
 * 2. Reach panel-only controls through a scoped CDP path
 *
 * The command API strategy discovers which accept commands exist at runtime
 * (IDs changed between IDE 1.x and 2.x), so only registered commands are called.
 * Each CDP pass performs one bounded scan of the current Agent Panel and exits.
 */
export class AutomationService implements IAutomationService, vscode.Disposable {
    private scheduler: Scheduler;
    private readonly taskName = 'autoAccept';
    private _enabled = false;
    private runGeneration = 0;

    // Command discovery state
    private availableCommands: string[] | null = null;
    private commandsCheckedAt = 0;
    private static readonly COMMAND_REFRESH_MS = 60_000;

    // Agent-scoped command candidates. 2.x IDs first; 1.x IDs remain for older installs.
    // Generic IDE approval commands stay out of scope because they are not limited
    // to Agent actions.
    private static readonly ACCEPT_COMMAND_CANDIDATES = [
        'antigravity.terminalCommand.accept',
        'antigravity.command.accept',
        'antigravity.prioritized.agentAcceptAllInFile',
        'antigravity.agent.acceptAllAgentSteps',
        'antigravity.agent.acceptAgentStep',
        'antigravity.terminal.accept',
    ];

    // Extension-host CDP connection state. The injected page script keeps no
    // observer, timer, or global registry of its own.
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
                const generation = this.runGeneration;
                await this.performCommandAccept(generation);
                if (!this.isRunActive(generation)) return;
                await this.performCdpAutoAccept(generation);
            },
            immediate: false
        });
    }

    private isRunActive(generation: number): boolean {
        return this._enabled && generation === this.runGeneration;
    }

    /**
     * Resolve which accept commands are actually registered in this IDE build.
     * Re-checked periodically because commands may register after activation.
     */
    private async resolveAcceptCommands(generation: number): Promise<string[]> {
        const now = Date.now();
        if (this.availableCommands !== null && now - this.commandsCheckedAt < AutomationService.COMMAND_REFRESH_MS) {
            return this.availableCommands;
        }
        try {
            const all = new Set(await vscode.commands.getCommands(true));
            const found = AutomationService.ACCEPT_COMMAND_CANDIDATES.filter(id => all.has(id));
            if (!this.isRunActive(generation)) return [];
            if (found.join(',') !== (this.availableCommands ?? []).join(',')) {
                infoLog(`Automation: accept commands available: [${found.join(', ') || 'none'}]`);
            }
            this.availableCommands = found;
        } catch {
            if (!this.isRunActive(generation)) return [];
            this.availableCommands = this.availableCommands ?? [];
        }
        this.commandsCheckedAt = now; // also on failure, so a broken getCommands isn't re-polled every tick
        return this.availableCommands;
    }

    /**
     * Primary strategy: call the IDE's registered accept commands
     */
    private async performCommandAccept(generation: number) {
        const commandIds = await this.resolveAcceptCommands(generation);
        for (const id of commandIds) {
            if (!this.isRunActive(generation)) return;
            try {
                await vscode.commands.executeCommand(id);
            } catch { /* no pending item for this command */ }
        }
    }

    /**
     * Fallback strategy: CDP injection for sandboxed agent panel
     */
    private async performCdpAutoAccept(generation: number) {
        const pages = await this.getPages(AutomationService.CDP_PORT);
        if (!this.isRunActive(generation)) return;
        for (const page of pages) {
            if (!this.isRunActive(generation)) return;
            if (page.type !== 'page' && page.type !== 'webview') continue;
            if ((page.title || '').includes('Extension Host')) continue;

            const id = `${AutomationService.CDP_PORT}:${page.id}`;
            if (!this.connections.has(id) && page.webSocketDebuggerUrl) {
                const connected = await this.connectToPage(id, page.webSocketDebuggerUrl);
                if (!connected) continue;
                if (!this.isRunActive(generation) || connected.readyState !== WebSocket.OPEN as number) {
                    try { connected.close(); } catch { /* ignore */ }
                    return;
                }

                // A connection created by another active run always keeps ownership.
                // A late connection must never overwrite it.
                const existing = this.connections.get(id);
                if (existing) {
                    try { connected.close(); } catch { /* ignore */ }
                } else {
                    this.connections.set(id, connected);
                }
            }

            const ws = this.connections.get(id);
            if (this.isRunActive(generation) && ws && ws.readyState === WebSocket.OPEN as number) {
                await this.evaluate(ws, this.getClickerScript());
            }
        }
    }

    /**
     * Build one panel-scoped scan with no page-side observer, timer, or global
     * action registry. A short DOM-node timestamp suppresses immediate repeats.
     */
    private getClickerScript(): string {
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

                // Re-locate the Agent Panel on every scheduled pass.
                const PANEL_SELECTOR = [
                    '.react-app-container', '.agent-panel', '#react-app-container',
                    '.antigravity-agent-panel', '[data-testid="agent-panel"]'
                ].join(',');
                const getAgentRoots = () => {
                    const containers = new Set();
                    for (const root of getAllRoots()) {
                        try {
                            if (root.matches && root.matches(PANEL_SELECTOR)) containers.add(root);
                            for (const el of root.querySelectorAll(PANEL_SELECTOR)) containers.add(el);
                        } catch (e) { }
                    }

                    const roots = new Map();
                    for (const container of containers) {
                        for (const root of getAllRoots(container)) {
                            if (!roots.has(root)) roots.set(root, container);
                        }
                    }
                    return Array.from(roots, ([root, panel]) => ({ root, panel }));
                };

                const agentRoots = getAgentRoots();
                if (agentRoots.length === 0) return;

                const CLICK_TTL_MS = 5000;
                const EXPANDER_TTL_MS = 2000;

                const getContainerTexts = (el, panel) => {
                    const texts = [];
                    let node = el;
                    for (let i = 0; i < 4 && node.parentElement; i++) {
                        node = node.parentElement;
                        if (node === panel) break;
                        const text = ((node.innerText || '')).replace(/\\s+/g, ' ').trim().toLowerCase().slice(0, 3000);
                        if (text && texts[texts.length - 1] !== text) texts.push(text);
                    }
                    return texts;
                };

                const getActionContext = (el, rawText, panel) => {
                    const texts = getContainerTexts(el, panel);
                    return texts.find(text => text !== rawText && text.length > rawText.length + 1)
                        || texts[texts.length - 1]
                        || rawText;
                };

                // Leave destructive-looking action cards for manual review.
                const DANGER_PATTERNS = [
                    /\\brm\\s+-[a-z]*[rf][a-z]*\\s+(\\/|~|\\$HOME)/i,
                    /--no-preserve-root/,
                    /\\bmkfs(\\.|\\s)/i,
                    /\\bdd\\s+if=/i,
                    /\\bgit\\s+push\\b[^\\n]*(--force(?!-with-lease)|\\s-f\\b)/i,
                    /\\bdrop\\s+(table|database)\\b/i,
                    /\\bformat\\s+[a-z]:/i,
                    /:\\(\\)\\s*\\{\\s*:\\|:\\s*&\\s*\\};\\s*:/
                ];

                const containerIsDangerous = (el, rawText, panel) =>
                    DANGER_PATTERNS.some(re => re.test(getActionContext(el, rawText, panel)));

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

                const TARGET_TOKENS = [
                    'accept all', 'accept', 'confirm', 'run',
                    'always allow', 'allow once', 'allow',
                    'allow this conversation', 'always allow this conversation'
                ];
                const EXPANDER_TOKENS = ['requires input', 'expand'];

                agentRoots.forEach(({ root, panel }) => {
                    try {
                        const doc = root.ownerDocument || root;
                        const walker = doc.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, null, false);
                        let el;
                        while (el = walker.nextNode()) {
                            if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') continue;

                            const rawText = (el.innerText || el.textContent || '').trim().toLowerCase();
                            if (!rawText) continue;

                            let isMatch = TARGET_TOKENS.includes(rawText)
                                || (rawText.includes('always run') && rawText.length < 25)
                                || rawText.startsWith('run alt');
                            let isExpander = false;

                            for (const token of EXPANDER_TOKENS) {
                                if (rawText === token || (token !== 'expand' && rawText.includes(token))) {
                                    isMatch = true;
                                    isExpander = true;
                                }
                            }

                            if (rawText.includes('.js') || rawText.includes('.ts') || rawText.includes('.py')) {
                                isMatch = false;
                            }
                            if (!isMatch) continue;

                            const now = Date.now();
                            const last = Number(el.dataset.aaTs || 0);
                            if (now - last < (isExpander ? EXPANDER_TTL_MS : CLICK_TTL_MS)) continue;

                            if (!isExpander) {
                                let interactive = el.tagName === 'BUTTON' || el.getAttribute('role') === 'button';
                                try {
                                    const win = el.ownerDocument?.defaultView || window;
                                    if (win.getComputedStyle(el).cursor === 'pointer') interactive = true;
                                } catch (e) { }
                                if (!interactive || el.closest('pre') || el.closest('code')) continue;
                                if (containerIsDangerous(el, rawText, panel)) continue;
                            }

                            el.dataset.aaTs = String(now);
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

    private async connectToPage(id: string, wsUrl: string): Promise<WebSocket | null> {
        return new Promise((resolve) => {
            const ws = new WebSocket(wsUrl);
            let settled = false;
            const timer = setTimeout(() => {
                try { ws.terminate(); } catch { /* ignore */ }
                finish(null);
            }, AutomationService.CDP_CONNECT_TIMEOUT_MS);
            const finish = (result: WebSocket | null) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                if (!result) {
                    try { ws.close(); } catch { /* ignore */ }
                }
                resolve(result);
            };

            ws.on('open', () => {
                ws.send(JSON.stringify({ id: this.msgId++, method: 'Runtime.enable' }));
                finish(ws);
            });
            ws.on('error', () => finish(null));
            ws.on('close', () => {
                if (this.connections.get(id) === ws) this.connections.delete(id);
                finish(null);
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
        this.runGeneration++;
        this.availableCommands = null; // rediscover commands on each start
        this.scheduler.start(this.taskName);
        infoLog("Automation: Auto-accept enabled (command API + CDP fallback)");
    }

    stop(): void {
        if (!this._enabled) return;
        this._enabled = false;
        this.runGeneration++;
        this.scheduler.stop(this.taskName);
        this.closeConnections();
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
        this._enabled = false;
        this.runGeneration++;
        this.scheduler.dispose();
        this.closeConnections();
    }

    private closeConnections(): void {
        this.connections.forEach(ws => {
            try { ws.close(); } catch { /* ignore */ }
        });
        this.connections.clear();
    }
}
