import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { build } from 'esbuild';

interface LitTemplate {
    _$litType$: unknown;
    strings: readonly string[];
    values: readonly unknown[];
}

interface DirectiveResult {
    _$litDirective$: new (partInfo: unknown) => { update(part: unknown, values: unknown[]): unknown };
    values: unknown[];
}

function collectTemplates(value: unknown, output: LitTemplate[] = []): LitTemplate[] {
    if (Array.isArray(value)) {
        value.forEach(item => collectTemplates(item, output));
        return output;
    }
    if (!value || typeof value !== 'object') return output;
    const candidate = value as Partial<LitTemplate>;
    if (candidate._$litType$ !== undefined && candidate.strings && candidate.values) {
        output.push(candidate as LitTemplate);
        candidate.values.forEach(item => collectTemplates(item, output));
    }
    return output;
}

suite('Webview Footer Test Suite', () => {
    test('Auto-Accept checkbox should always follow host state and status should show observed state', async () => {
        const footerPath = path.resolve(process.cwd(), 'src/view/webview/components/sidebar-footer.ts');
        const result = await build({
            stdin: {
                contents: [
                    `export { SidebarFooter } from ${JSON.stringify(footerPath)};`,
                    `export { noChange } from 'lit';`,
                    `export { PartType } from 'lit/directive.js';`
                ].join('\n'),
                loader: 'ts',
                resolveDir: process.cwd()
            },
            bundle: true,
            platform: 'node',
            format: 'esm',
            target: 'node20',
            write: false,
            logLevel: 'silent'
        });
        const outputPath = path.join(os.tmpdir(), `antigravity-webview-footer-${process.pid}-${Date.now()}.mjs`);
        fs.writeFileSync(outputPath, result.outputFiles[0].contents);

        const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
        Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });
        // Give this bundle its own custom element registry so other Webview
        // suites can still define <sidebar-footer>.
        const originalRegistry = Object.getOwnPropertyDescriptor(globalThis, 'customElements');
        delete (globalThis as { customElements?: unknown }).customElements;

        try {
            const importModule = new Function('specifier', 'return import(specifier)') as
                (specifier: string) => Promise<{
                    SidebarFooter: { prototype: Record<string, any> };
                    noChange: unknown;
                    PartType: { PROPERTY: number };
                }>;
            const { SidebarFooter, noChange, PartType } = await importModule(`${pathToFileURL(outputPath).href}?t=${Date.now()}`);

            const posted: unknown[] = [];
            const vscodeApi = { postMessage: (message: unknown) => posted.push(message), getState: () => ({}), setState: () => undefined };
            const render = (enabled: boolean) => {
                const host = {
                    autoAcceptEnabled: enabled,
                    autoAcceptStatus: null,
                    _renderAutoAcceptStatus: SidebarFooter.prototype._renderAutoAcceptStatus,
                    _isCollapsed: false,
                    _t: {},
                    _vscode: vscodeApi,
                    _toggleAutoAccept: SidebarFooter.prototype._toggleAutoAccept,
                    _toggleCollapse: () => undefined,
                    _postMessage: () => undefined,
                    _openUrl: () => undefined
                };
                const template = collectTemplates(SidebarFooter.prototype.render.call(host))
                    .find(item => item.strings.some(part => part.includes('type="checkbox"')));
                assert.ok(template, 'Footer should render the Auto-Accept checkbox');
                assert.ok(!template.strings.some(part => part.includes('?checked=')), 'checked must not be a boolean attribute binding');
                const index = template.strings.findIndex(part => /\s\.checked=$/.test(part));
                assert.notStrictEqual(index, -1, 'checked must be bound as a property');
                const binding = template.values[index] as DirectiveResult;
                assert.ok(binding && binding._$litDirective$, 'checked must use the live() directive');
                assert.match(template.strings[index + 1], /@click=$/);
                return { binding, onClick: template.values[index + 1] as (event: unknown) => void };
            };

            // Minimal property-part commit, as Lit performs it for `.checked=${live(...)}`.
            const input = { checked: false };
            const part = { type: PartType.PROPERTY, element: input, name: 'checked', strings: undefined };
            const commit = (binding: DirectiveResult) => {
                const directive = new binding._$litDirective$({ type: PartType.PROPERTY, name: 'checked', strings: undefined, tagName: 'INPUT' });
                const value = directive.update(part, binding.values);
                if (value !== noChange) input.checked = value as boolean;
            };

            const off = render(false);
            commit(off.binding);
            assert.strictEqual(input.checked, false);

            let prevented = 0;
            off.onClick({ preventDefault: () => { prevented++; } });
            assert.strictEqual(prevented, 1, 'A click must not toggle the DOM locally');
            assert.deepStrictEqual(posted, [{ type: 'toggleAutoAccept' }]);

            // Even if the DOM drifted, an unchanged host state is written back.
            input.checked = true;
            commit(render(false).binding);
            assert.strictEqual(input.checked, false, 'The checkbox must match the host state, not the local DOM');

            // An external host change (command palette, settings) is reflected.
            commit(render(true).binding);
            assert.strictEqual(input.checked, true);
            commit(render(false).binding);
            assert.strictEqual(input.checked, false);

            // Runtime status: only observed state is shown, and only while running.
            const opened: string[] = [];
            const renderStatus = (enabled: boolean, status: Record<string, unknown>) => collectTemplates(
                SidebarFooter.prototype._renderAutoAcceptStatus.call({
                    autoAcceptEnabled: enabled,
                    autoAcceptStatus: status,
                    _t: {},
                    _openUrl: (url: string) => opened.push(url)
                })
            );
            const textOf = (templates: LitTemplate[]) => templates
                .flatMap(item => item.values.filter((value): value is string => typeof value === 'string'))
                .join('\n');
            const status = {
                running: true,
                commandCount: 1,
                cdp: 'unavailable',
                lastAction: { outcome: 'skipped', label: 'run', reason: 'terminalDisabled', at: 0 }
            };
            assert.strictEqual(renderStatus(false, status).length, 0, 'No status while Auto-Accept is off');

            const templates = renderStatus(true, status);
            const text = textOf(templates);
            assert.match(text, /CDP: not available/);
            assert.match(text, /IDE accept commands: 1 available/);
            assert.match(text, /Left for manual review: "run" at .+ \(terminal approval is off\)/);
            const setup = templates.find(item => item.strings.some(part => part.includes('aa-setup-btn')));
            assert.ok(setup, 'Unavailable CDP should offer the setup instructions');
            (setup.values[setup.strings.findIndex(part => /@click=$/.test(part))] as () => void)();
            assert.deepStrictEqual(opened, ['https://github.com/n2ns/antigravity-panel/blob/main/docs/FEATURES.md#enabling-the-cdp-fallback']);

            const unknown = textOf(renderStatus(true, { running: true, commandCount: null, cdp: 'unknown', lastAction: null }));
            assert.doesNotMatch(unknown, /CDP|IDE accept commands/, 'Unobserved state must not be shown');
            const connected = renderStatus(true, { ...status, cdp: 'connected' });
            assert.match(textOf(connected), /CDP: connected/);
            assert.ok(!connected.some(item => item.strings.some(part => part.includes('aa-setup-btn'))));
            assert.match(textOf(renderStatus(true, { ...status, cdp: 'noPanel' })), /CDP: connected, but the Agent panel was not found/);

            // Restart and Reset run antigravity.* commands, which exist only inside Antigravity.
            const footerMarkup = (backend: 'ide' | 'cli', collapsed = false) => collectTemplates(SidebarFooter.prototype.render.call({
                autoAcceptEnabled: false,
                autoAcceptStatus: null,
                backend,
                _renderAutoAcceptStatus: SidebarFooter.prototype._renderAutoAcceptStatus,
                _isCollapsed: collapsed,
                _t: {},
                _vscode: vscodeApi,
                _toggleAutoAccept: SidebarFooter.prototype._toggleAutoAccept,
                _toggleCollapse: () => undefined,
                _postMessage: () => undefined,
                _openUrl: () => undefined
            })).flatMap(item => [...item.strings, ...item.values.filter((value): value is string => typeof value === 'string')]).join('');
            const ideFooter = footerMarkup('ide');
            assert.ok(ideFooter.includes('codicon-sync') && ideFooter.includes('codicon-refresh'), 'Antigravity shows Restart and Reset');
            const cliFooter = footerMarkup('cli');
            assert.ok(!cliFooter.includes('codicon-sync') && !cliFooter.includes('codicon-refresh'), 'Other editors hide Restart and Reset');
            assert.ok(cliFooter.includes('codicon-window'), 'Reload stays available');
            // browserAllowlist.txt is read by the Antigravity IDE browser, not by the agy CLI
            assert.ok(ideFooter.includes('codicon-globe'), 'Antigravity shows Allowlist');
            assert.ok(!cliFooter.includes('codicon-globe'), 'Other editors hide Allowlist');
            assert.ok(cliFooter.includes('codicon-symbol-ruler') && cliFooter.includes('codicon-plug'), 'Rules and MCP stay available');
            const buttonRows = (markup: string) => markup.split('action-row action-buttons').length - 1;
            assert.strictEqual(buttonRows(ideFooter), 2, 'Antigravity keeps the tool row and the recovery row');
            assert.strictEqual(buttonRows(cliFooter), 1, 'Other editors put Rules, MCP and Reload in one row');

            // Auto-Accept works only through Antigravity commands and its Agent panel. Its row is also the
            // collapse header, so without it the footer must stay expanded even if it was saved collapsed.
            assert.ok(ideFooter.includes('type="checkbox"'), 'Antigravity shows the Auto-Accept toggle');
            assert.ok(!cliFooter.includes('type="checkbox"') && !cliFooter.includes('auto-accept-row'), 'Other editors hide the Auto-Accept row');
            assert.ok(!footerMarkup('cli', true).includes('collapsed'), 'Other editors never render the footer collapsed');
            assert.ok(footerMarkup('ide', true).includes('collapsed'), 'Antigravity keeps the saved collapsed state');
        } finally {
            if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
            else delete (globalThis as { window?: unknown }).window;
            if (originalRegistry) Object.defineProperty(globalThis, 'customElements', originalRegistry);
            else delete (globalThis as { customElements?: unknown }).customElements;
            fs.rmSync(outputPath, { force: true });
        }
    });
});
