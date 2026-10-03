#!/usr/bin/env node
// Probes into the Antigravity IDE Extension Development Host (F5) running this repo.
// Needs Node 22+ (global fetch/WebSocket) and the IDE started with --remote-debugging-port=9222.
// Nothing here clicks, types, reloads or changes settings; see SKILL.md for the rules.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const REPO = path.resolve(import.meta.dirname, '../../..');
const DEV_BUNDLE = path.join(REPO, 'dist', 'extension.js');
const CDP = 'http://127.0.0.1:9222';
const LOG_ROOT = path.join(os.homedir(), '.antigravity-ide-server', 'data', 'logs');
const CALL_TIMEOUT_MS = 10_000;

// ---------- discovery ----------

function cmdline(pid) {
    try { return fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0'); } catch { return []; }
}

function ppid(pid) {
    try { return Number(fs.readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1].split(' ')[1]); } catch { return 0; }
}

/** Extension hosts started with an inspector flag; only the F5 dev host has one. */
function findDevExtHost() {
    const hosts = [];
    for (const entry of fs.readdirSync('/proc')) {
        if (!/^\d+$/.test(entry)) continue;
        const args = cmdline(entry);
        if (!args.includes('--type=extensionHost')) continue;
        const flag = args.find(a => /^--inspect(-brk)?=\d+$/.test(a));
        if (flag) hosts.push({ pid: Number(entry), port: Number(flag.split('=')[1]), startMs: fs.statSync(`/proc/${entry}`).ctimeMs });
    }
    if (hosts.length === 0) throw new Error('No extension host with an inspector port. Ask the user to start the Extension Development Host (F5).');
    return hosts.sort((a, b) => b.startMs - a.startMs)[0];
}

function findLanguageServer(hostPid) {
    for (const entry of fs.readdirSync('/proc')) {
        if (!/^\d+$/.test(entry) || ppid(entry) !== hostPid) continue;
        if (cmdline(entry)[0]?.includes('language_server')) return Number(entry);
    }
    return null;
}

/** The "Antigravity Panel" output log created closest to the dev host start. */
function findLog(startMs) {
    let best = null;
    for (const session of fs.existsSync(LOG_ROOT) ? fs.readdirSync(LOG_ROOT) : []) {
        const sessionDir = path.join(LOG_ROOT, session);
        for (const host of fs.readdirSync(sessionDir).filter(d => d.startsWith('exthost'))) {
            const hostDir = path.join(sessionDir, host);
            for (const out of fs.readdirSync(hostDir).filter(d => d.startsWith('output_logging_'))) {
                const dir = path.join(hostDir, out);
                const file = fs.readdirSync(dir).find(f => f.endsWith('Antigravity Panel.log'));
                if (!file) continue;
                const created = fs.statSync(dir).birthtimeMs || fs.statSync(dir).ctimeMs;
                const distance = Math.abs(created - startMs);
                if (!best || distance < best.distance) best = { file: path.join(dir, file), distance };
            }
        }
    }
    return best?.file ?? null;
}

async function cdpTargets() {
    try {
        return await (await fetch(`${CDP}/json/list`, { signal: AbortSignal.timeout(2000) })).json();
    } catch {
        throw new Error('CDP port 9222 does not answer. The IDE must be started with --remote-debugging-port=9222.');
    }
}

// ---------- protocol sessions ----------

async function connect(wsUrl) {
    const ws = new WebSocket(wsUrl);
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = () => reject(new Error(`Cannot connect to ${wsUrl}`)); });
    let nextId = 0;
    const pending = new Map();
    const listeners = [];
    ws.onmessage = event => {
        const message = JSON.parse(event.data);
        const waiter = pending.get(message.id);
        if (waiter) {
            pending.delete(message.id);
            message.error ? waiter.reject(new Error(message.error.message)) : waiter.resolve(message.result);
        } else {
            listeners.forEach(listener => listener(message));
        }
    };
    return {
        call(method, params = {}) {
            const id = ++nextId;
            return new Promise((resolve, reject) => {
                const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out`)); }, CALL_TIMEOUT_MS);
                pending.set(id, {
                    resolve: value => { clearTimeout(timer); resolve(value); },
                    reject: error => { clearTimeout(timer); reject(error); }
                });
                ws.send(JSON.stringify({ id, method, params }));
            });
        },
        on: listener => listeners.push(listener),
        close: () => ws.close()
    };
}

async function evaluate(session, expression) {
    const result = await session.call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
}

async function withSession(wsUrl, fn) {
    const session = await connect(wsUrl);
    try { return await fn(session); } finally { session.close(); }
}

// The sidebar renders in the webview's inner frame; expressions get it as `doc`.
const inSidebar = expression => `(() => {
    const docs = [document, ...[...document.querySelectorAll('iframe')].map(f => { try { return f.contentDocument; } catch { return null; } })];
    const doc = docs.find(d => d && d.querySelector('sidebar-app')) || document;
    return (${expression});
})()`;

/** This repo's sidebar webview and the dev host page that contains it. */
async function findDevSidebar() {
    const targets = await cdpTargets();
    const webviews = targets.filter(t => t.type === 'iframe' && t.url.includes('extensionId=n2ns.antigravity-panel'));
    for (const webview of webviews) {
        const scripts = await withSession(webview.webSocketDebuggerUrl, s => evaluate(s,
            inSidebar(`[...doc.querySelectorAll('script[src]')].map(e => decodeURIComponent(e.src))`))).catch(() => []);
        if (scripts.some(src => src.includes(`${REPO}/dist/`))) {
            return { webview, page: targets.find(t => t.id === webview.parentId) };
        }
    }
    throw new Error('Sidebar of this repo not found. Ask the user to open the Antigravity Panel view in the Extension Development Host.');
}

async function hostSession() {
    const host = findDevExtHost();
    const [target] = await (await fetch(`http://127.0.0.1:${host.port}/json/list`)).json();
    return { host, session: await connect(target.webSocketDebuggerUrl) };
}

// ---------- commands ----------

const commands = {
    async status() {
        const host = findDevExtHost();
        console.log(`extension host  pid ${host.pid}, inspector 127.0.0.1:${host.port}`);
        console.log(`language server pid ${findLanguageServer(host.pid) ?? 'not found'}`);
        console.log(`log             ${findLog(host.startMs) ?? 'not found'}`);
        const { webview, page } = await findDevSidebar();
        console.log(`dev host page   ${page?.id} ${page?.title}`);
        console.log(`sidebar webview ${webview.id}`);
        const state = await withSession(webview.webSocketDebuggerUrl, s => evaluate(s, inSidebar(`({
            version: doc.querySelector('.sidebar-version')?.innerText ?? null,
            autoAccept: doc.querySelector('.auto-accept-row input[type=checkbox]')?.checked ?? null,
            autoAcceptStatus: doc.querySelector('.auto-accept-status')?.innerText ?? null
        })`)));
        console.log(JSON.stringify(state, null, 2));
    },

    async log(args) {
        const lines = Number(option(args, '--lines') ?? 40);
        const pattern = option(args, '--grep');
        const file = findLog(findDevExtHost().startMs);
        if (!file) throw new Error('Log not found');
        let content = fs.readFileSync(file, 'utf8').split('\n');
        if (pattern) content = content.filter(line => new RegExp(pattern, 'i').test(line));
        console.log(`# ${file}`);
        console.log(content.slice(-lines).join('\n'));
    },

    async shot(args) {
        const out = args[0] ?? path.join(os.tmpdir(), `devhost-${Date.now()}.png`);
        const { page } = await findDevSidebar();
        const { data } = await withSession(page.webSocketDebuggerUrl, s => s.call('Page.captureScreenshot', { format: 'png' }));
        fs.writeFileSync(out, Buffer.from(data, 'base64'));
        console.log(out);
    },

    async webview(args) {
        const { webview } = await findDevSidebar();
        print(await withSession(webview.webSocketDebuggerUrl, s => evaluate(s, inSidebar(required(args[0], 'expression')))));
    },

    async page(args) {
        const { page } = await findDevSidebar();
        print(await withSession(page.webSocketDebuggerUrl, s => evaluate(s, required(args[0], 'expression'))));
    },

    async host(args) {
        const { session } = await hostSession();
        try { print(await evaluate(session, required(args[0], 'expression'))); } finally { session.close(); }
    },

    /**
     * Non-pausing logpoint in dist/extension.js: the condition records the
     * expression and returns false. Readable names need the unminified
     * `npm run watch` build.
     */
    async logpoint(args) {
        const at = new RegExp(required(args[0], 'source regex'));
        const expression = required(args[1], 'expression');
        const seconds = Number(option(args, '--seconds') ?? 30);
        const max = Number(option(args, '--max') ?? 5);
        const { session } = await hostSession();
        const store = '__devhostLogpoint';
        let breakpointId = null;
        try {
            const scripts = [];
            session.on(m => { if (m.method === 'Debugger.scriptParsed') scripts.push(m.params); });
            await session.call('Debugger.enable');
            const script = scripts.find(s => s.url === pathToFileURL(DEV_BUNDLE).href || s.url === DEV_BUNDLE);
            if (!script) throw new Error(`${DEV_BUNDLE} is not loaded in the dev host`);
            const { scriptSource } = await session.call('Debugger.getScriptSource', { scriptId: script.scriptId });
            const match = at.exec(scriptSource);
            if (!match) throw new Error(`No match for ${at} in dist/extension.js`);
            const before = scriptSource.slice(0, match.index).split('\n');
            const location = { scriptId: script.scriptId, lineNumber: before.length - 1, columnNumber: before.at(-1).length };
            const condition = `((globalThis.${store} ??= []).length < ${max} && globalThis.${store}.push((() => {
                try { return JSON.stringify(${expression}); } catch (e) { return 'error: ' + e.message; }
            })()), false)`;
            ({ breakpointId } = await session.call('Debugger.setBreakpoint', { location, condition }));
            console.log(`logpoint at ${location.lineNumber + 1}:${location.columnNumber + 1}, waiting up to ${seconds}s for ${max} hits`);
            const deadline = Date.now() + seconds * 1000;
            let hits = [];
            while (Date.now() < deadline && hits.length < max) {
                await new Promise(resolve => setTimeout(resolve, 500));
                hits = await evaluate(session, `globalThis.${store} ?? []`);
            }
            hits.forEach((hit, i) => console.log(`#${i + 1} ${hit}`));
            if (hits.length === 0) console.log('no hits');
        } finally {
            if (breakpointId) await session.call('Debugger.removeBreakpoint', { breakpointId }).catch(() => { });
            await evaluate(session, `delete globalThis.${store}`).catch(() => { });
            await session.call('Debugger.disable').catch(() => { });
            session.close();
        }
    },

    /**
     * Auto-Accept scan of the dev host page built from src, with the click and
     * the DOM marker removed: reports what a pass would do.
     */
    async dryrun(args) {
        const requireFromRepo = createRequire(path.join(REPO, 'package.json'));
        const esbuild = requireFromRepo('esbuild');
        // Under the repo root so the bundle resolves `ws`; .out-* is ignored by git and the VSIX
        const bundle = path.join(REPO, `.out-devhost-${process.pid}.cjs`);
        await esbuild.build({
            entryPoints: [path.join(REPO, 'src/model/services/automation.service.ts')],
            bundle: true, platform: 'node', format: 'cjs', outfile: bundle, logLevel: 'silent',
            alias: { vscode: path.join(REPO, 'src/test/mocks/vscode.ts') },
            external: ['ws']
        });
        let script;
        try {
            const { AutomationService } = createRequire(path.join(REPO, 'package.json'))(bundle);
            const service = new AutomationService();
            service.setAcceptTerminalCommands(args.includes('--terminal'));
            script = service.getClickerScript()
                .replace('clickElement(el);', '/* dry run */')
                .replace('el.dataset.aaTs = String(now);', '/* dry run */');
            service.dispose();
        } finally {
            fs.rmSync(bundle, { force: true });
        }
        if (script.includes('clickElement(el);') || script.includes('el.dataset.aaTs = String(now);')) {
            throw new Error('Could not strip the click from the scan; refusing to run it');
        }
        const { page } = await findDevSidebar();
        print(await withSession(page.webSocketDebuggerUrl, s => evaluate(s, script)));
    }
};

// ---------- cli ----------

function option(args, name) {
    const index = args.indexOf(name);
    return index === -1 ? undefined : args[index + 1];
}

function required(value, name) {
    if (value === undefined) throw new Error(`Missing ${name}`);
    return value;
}

function print(value) {
    console.log(typeof value === 'string' ? value : JSON.stringify(value, null, 2));
}

const [name, ...rest] = process.argv.slice(2);
if (!commands[name]) {
    console.log('usage: devhost.mjs <status|log|shot|webview|page|host|logpoint|dryrun> [args]');
    process.exit(name ? 1 : 0);
}
commands[name](rest).catch(error => {
    console.error(`devhost: ${error.message}`);
    process.exit(1);
});
