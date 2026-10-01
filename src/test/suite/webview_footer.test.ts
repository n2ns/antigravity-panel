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
    test('Auto-Accept checkbox should always follow host state', async () => {
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
        } finally {
            if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
            else delete (globalThis as { window?: unknown }).window;
            if (originalRegistry) Object.defineProperty(globalThis, 'customElements', originalRegistry);
            else delete (globalThis as { customElements?: unknown }).customElements;
            fs.rmSync(outputPath, { force: true });
        }
    });
});
