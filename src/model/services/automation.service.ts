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
    url?: string;
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
 *
 * Terminal commands are never approved through the command path: a command
 * cannot see the command text, so it would bypass the danger check. They are
 * approved only by clicking Run inside a detected terminal-command prompt.
 */
export class AutomationService implements IAutomationService, vscode.Disposable {
    private scheduler: Scheduler;
    private readonly taskName = 'autoAccept';
    private _enabled = false;
    private _acceptTerminalCommands = false;
    private runGeneration = 0;

    // Command discovery state
    private availableCommands: string[] | null = null;
    private commandsCheckedAt = 0;
    private static readonly COMMAND_REFRESH_MS = 60_000;

    // Agent-scoped command candidates that cannot approve a terminal command.
    // Generic IDE approval commands stay out of scope because they are not limited
    // to Agent actions. Every command that can approve a terminal command is
    // excluded whatever tfa.system.autoAcceptTerminal says: terminalCommand.accept,
    // terminalCommand.run, terminal.accept, command.accept (may also approve a
    // pending terminal command) and the 1.x agent.acceptAgentStep /
    // acceptAllAgentSteps (a generic step accept can approve a pending terminal step).
    private static readonly ACCEPT_COMMAND_CANDIDATES = [
        'antigravity.prioritized.agentAcceptAllInFile',
    ];

    // Only workbench pages and webviews may receive the injected scan.
    private static readonly CDP_TARGET_URL_PREFIXES = ['vscode-file://', 'vscode-webview://'];
    private static readonly CDP_DEBUGGER_HOSTS = new Set(['127.0.0.1', 'localhost']);

    // Destructive-looking commands that leave an action card for manual review.
    // Patterns run on lower-cased, whitespace-collapsed card text.
    private static readonly DANGER_PATTERNS: readonly RegExp[] = [
        // rm with an -r/-f flag (any order, separated or long form) on a path under /, ~, $HOME or a drive root
        /\brm(?=(?:\s+[^\s;&|]+){0,8}?\s+(?:-[a-z]*[rf][a-z]*|--recursive|--force)(?=[\s;&|]|$))(?:\s+[^\s;&|]+){0,8}?\s+["']?(?:\/|~|\$home|\$\{home\}|[a-z]:[\\/])/,
        /--no-preserve-root/,
        /\bmkfs(\.|\s)/,
        /\bdd\s+if=/,
        // find under /, ~ or $HOME with -delete
        /\bfind\s+["']?(?:\/|~|\$home|\$\{home\})[^\s;&|"']*["']?(?=[\s;&|]|$)[^;&|]*?\s-delete(?=[\s;&|]|$)/,
        // cd to /, ~ or $HOME, then a chained recursive/forced rm of * or .
        /\bcd\s+["']?(?:\/|~\/?|\$home\/?|\$\{home\}\/?)["']?\s*(?:&&|;)\s*(?:sudo\s+)?rm(?=(?:\s+[^\s;&|]+){0,8}?\s+(?:-[a-z]*[rf][a-z]*|--recursive|--force)(?=[\s;&|]|$))(?:\s+[^\s;&|]+){0,8}?\s+["']?(?:\*|\.\/?\*?)["']?(?=[\s;&|]|$)/,
        // git push --force, a combined short flag holding f (-f, -fu) or a +refspec
        /\bgit\s+push\b[^\n]*(--force(?!-with-lease)|\s-[a-z]*f[a-z]*(?=[\s;&|]|$)|\s\+[^\s;&|]+)/,
        // git reset --hard / git clean -f, also after global options such as -C <dir>
        /\bgit(?:\s+-c\s+[^\s;&|]+|\s+--?[a-z-]+(?:=[^\s;&|]+)?){0,4}\s+reset(?:\s+[^\s;&|]+){0,8}?\s+--hard(?=[\s;&|]|$)/,
        /\bgit(?:\s+-c\s+[^\s;&|]+|\s+--?[a-z-]+(?:=[^\s;&|]+)?){0,4}\s+clean(?:\s+[^\s;&|]+){0,8}?\s+(?:-[a-z]*f[a-z]*|--force)(?=[\s;&|]|$)/,
        // PowerShell Remove-Item -Recurse (or an unambiguous prefix)
        /\bremove-item(?:\s+[^\s;&|]+){0,8}?\s+-r(?:e|ec|ecu|ecur|ecurs|ecurse)?(?=[\s;&|:]|$)/,
        // PowerShell Remove-Item aliases (rm, ri, rd, ...) with -Recurse on a drive path
        /\b(?:rm|ri|rd|rmdir|del|erase)(?=(?:\s+[^\s;&|]+){0,8}?\s+-r(?:e|ec|ecu|ecur|ecurs|ecurse)?(?=[\s;&|:]|$))(?:\s+[^\s;&|]+){0,8}?\s+["']?[a-z]:[\\/]/,
        // cmd.exe recursive delete: del /s, erase /s, rmdir /s, rd /s
        /\b(?:del|erase|rmdir|rd)(?:\s+[^\s;&|]+){0,8}?\s+(?:\/[a-z]+)*\/s(?=[\s/;&|]|$)/,
        /\bdrop\s+(table|database)\b/,
        /\bformat\s+[a-z]:/,
        /:\(\)\s*\{\s*:\|:\s*&\s*\};\s*:/
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
            if (!AutomationService.isWorkbenchTarget(page)) continue;

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
     * Accept only workbench pages/webviews whose debugger socket stays on loopback.
     */
    private static isWorkbenchTarget(page: CdpPage): boolean {
        const url = page.url || '';
        if (!AutomationService.CDP_TARGET_URL_PREFIXES.some(prefix => url.startsWith(prefix))) return false;
        if (!page.webSocketDebuggerUrl) return true; // nothing to connect to
        try {
            const target = new URL(page.webSocketDebuggerUrl);
            return (target.protocol === 'ws:' || target.protocol === 'wss:')
                && AutomationService.CDP_DEBUGGER_HOSTS.has(target.hostname);
        } catch {
            return false;
        }
    }

    /**
     * Build one panel-scoped scan with no page-side observer, timer, or global
     * action registry. A short DOM-node timestamp suppresses immediate repeats.
     */
    private getClickerScript(): string {
        const dangerPatterns = AutomationService.DANGER_PATTERNS.map(re => re.toString()).join(', ');
        const acceptTerminal = this._acceptTerminalCommands ? 'true' : 'false';
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
                    '.antigravity-agent-panel', '.antigravity-agent-side-panel', '[data-testid="agent-panel"]'
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
                        const text = ((node.innerText || '')).replace(/\\s+/g, ' ').trim().toLowerCase();
                        if (text && texts[texts.length - 1] !== text) texts.push(text);
                    }
                    return texts;
                };

                // Leave destructive-looking action cards for manual review. This
                // checks the action text and up to four ancestor texts only; a Run
                // is also checked against its whole prompt card (findPromptCard).
                const DANGER_PATTERNS = [${dangerPatterns}];

                const containerIsDangerous = (el, rawText, panel) => {
                    const texts = [rawText, ...getContainerTexts(el, panel)];
                    return texts.some(text => DANGER_PATTERNS.some(re => re.test(text)));
                };

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

                // Persistent grants ('always allow', 'always run', 'allow this
                // conversation', ...) are never clicked. Run buttons approve
                // terminal commands and need opt-in.
                const ACCEPT_TERMINAL = ${acceptTerminal};
                const TARGET_TOKENS = [
                    'accept all', 'accept', 'confirm',
                    'allow once', 'allow'
                ];
                const isRunAction = (text) => text === 'run' || text.startsWith('run alt');
                const EXPANDER_TOKENS = ['requires input', 'expand'];

                // Run is clicked only inside a terminal-command prompt: the nearest
                // ancestor below the panel (within PROMPT_MAX_DEPTH) that also offers
                // a Reject action, usually just the action row. An ancestor holding
                // more than one Run spans several prompts and is skipped.
                // Run and Reject must sit in one action group: below their common
                // ancestor each is a branch holding only that action (plus its
                // keybinding hint), so a Reject from a sibling card never counts.
                const PROMPT_ACTION_SELECTOR = 'button, [role="button"]';
                const PROMPT_MAX_DEPTH = 6;
                const normalize = (text) => (text || '').replace(/\\s+/g, ' ').trim().toLowerCase();
                const labelOf = (node) => normalize(node.innerText || node.textContent);
                const isRejectBranchText = (text) => /^reject\\b/.test(text);
                const isInside = (node, ancestor) => {
                    for (; node; node = node.parentElement) if (node === ancestor) return true;
                    return false;
                };
                const branchOf = (action, ancestor) => {
                    let node = action;
                    while (node.parentElement && node.parentElement !== ancestor) node = node.parentElement;
                    return node;
                };
                const isLoneAction = (action, ancestor, matchesText) => {
                    const branch = branchOf(action, ancestor);
                    if (branch === action) return true;
                    const others = Array.from(branch.querySelectorAll(PROMPT_ACTION_SELECTOR))
                        .filter(other => !isInside(other, action));
                    return others.length === 0 && matchesText(labelOf(branch));
                };
                const findTerminalPrompt = (el, panel) => {
                    let node = el;
                    for (let i = 0; i < PROMPT_MAX_DEPTH && node.parentElement; i++) {
                        node = node.parentElement;
                        if (node === panel) return null;
                        try {
                            const actions = Array.from(node.querySelectorAll(PROMPT_ACTION_SELECTOR));
                            const rejects = actions.filter(action => /\\breject\\b/.test(labelOf(action)));
                            if (rejects.length === 0) continue;
                            if (actions.filter(action => isRunAction(labelOf(action))).length > 1) return null;
                            const sameGroup = isLoneAction(el, node, isRunAction)
                                && rejects.some(reject => isLoneAction(reject, node, isRejectBranchText));
                            return sameGroup ? node : null;
                        } catch (e) { return null; }
                    }
                    return null;
                };
                // Climb from the action group to the whole prompt card: stop below
                // the panel, after PROMPT_MAX_DEPTH levels, or before an ancestor
                // holding a second Run or Reject (that would merge another prompt).
                // Other actions in the card (copy, Always run, ...) do not stop it.
                const findPromptCard = (group, panel) => {
                    let card = group;
                    for (let i = 0; i < PROMPT_MAX_DEPTH; i++) {
                        const parent = card.parentElement;
                        if (!parent || parent === panel) break;
                        const labels = Array.from(parent.querySelectorAll(PROMPT_ACTION_SELECTOR)).map(labelOf);
                        if (labels.filter(isRunAction).length > 1) break;
                        if (labels.filter(label => /\\breject\\b/.test(label)).length > 1) break;
                        card = parent;
                    }
                    return card;
                };
                // Card text without action labels and without the Run/Reject branch
                // text (keybinding hints). Empty means the command is not visible.
                const commandTextOf = (card, group, run) => {
                    const actions = Array.from(card.querySelectorAll(PROMPT_ACTION_SELECTOR));
                    const labels = actions.map(labelOf);
                    labels.push(labelOf(branchOf(run, group)));
                    for (const action of actions) {
                        if (action === group || !isInside(action, group)) continue;
                        const branchText = labelOf(branchOf(action, group));
                        if (isRejectBranchText(branchText)) labels.push(branchText);
                    }
                    let text = labelOf(card);
                    labels.filter(Boolean).sort((a, b) => b.length - a.length)
                        .forEach(label => { text = text.split(label).join(' '); });
                    return normalize(text);
                };

                agentRoots.forEach(({ root, panel }) => {
                    try {
                        const doc = root.ownerDocument || root;
                        const walker = doc.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, null, false);
                        let el;
                        while (el = walker.nextNode()) {
                            if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') continue;
                            // Children of an interactive element are reached through it.
                            const host = el.closest('button, [role="button"]');
                            if (host && host !== el) continue;

                            const rawText = (el.innerText || el.textContent || '').trim().toLowerCase();
                            if (!rawText) continue;

                            let isMatch = TARGET_TOKENS.includes(rawText);
                            let terminalPrompt = null;
                            if (!isMatch && ACCEPT_TERMINAL && isRunAction(rawText)) {
                                terminalPrompt = findTerminalPrompt(el, panel);
                                isMatch = terminalPrompt !== null;
                            }
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
                                if (terminalPrompt) {
                                    const promptText = normalize(terminalPrompt.innerText || terminalPrompt.textContent);
                                    if (DANGER_PATTERNS.some(re => re.test(promptText))) continue;
                                    // Check the whole prompt card, and fail closed when
                                    // no command text is visible in it.
                                    try {
                                        const card = findPromptCard(terminalPrompt, panel);
                                        if (DANGER_PATTERNS.some(re => re.test(labelOf(card)))) continue;
                                        if (!commandTextOf(card, terminalPrompt, el)) continue;
                                    } catch (e) { continue; }
                                }
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

    updateInterval(ms: number): void {
        this.scheduler.updateInterval(this.taskName, ms);
    }

    setAcceptTerminalCommands(enabled: boolean): void {
        if (this._acceptTerminalCommands === enabled) return;
        this._acceptTerminalCommands = enabled;
        infoLog(`Automation: terminal command accepts ${enabled ? 'enabled' : 'disabled'}`);
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
