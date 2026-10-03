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

/** Template text with values interleaved, enough to assert on what renders */
function textOf(templates: LitTemplate[]): string {
    return templates.map(t => t.strings.map((s, i) => s + (typeof t.values[i] === 'string' || typeof t.values[i] === 'number' ? t.values[i] : '')).join('')).join('\n');
}

suite('Webview Context Card Test Suite', () => {
    test('should format tokens and render usage, level and compression', async () => {
        const cardPath = path.resolve(process.cwd(), 'src/view/webview/components/context-card.ts');
        const result = await build({
            stdin: { contents: `export { ContextCard, formatTokens } from ${JSON.stringify(cardPath)};`, loader: 'ts', resolveDir: process.cwd() },
            bundle: true, platform: 'node', format: 'esm', target: 'node20', write: false, logLevel: 'silent'
        });
        const outputPath = path.join(os.tmpdir(), `antigravity-context-card-${process.pid}-${Date.now()}.mjs`);
        fs.writeFileSync(outputPath, result.outputFiles[0].contents);

        const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
        Object.defineProperty(globalThis, 'window', { configurable: true, value: { __TRANSLATIONS__: {} } });
        const originalRegistry = Object.getOwnPropertyDescriptor(globalThis, 'customElements');
        delete (globalThis as { customElements?: unknown }).customElements;

        try {
            const importModule = new Function('specifier', 'return import(specifier)') as
                (specifier: string) => Promise<{ ContextCard: { prototype: Record<string, any> }; formatTokens: (n: number) => string }>;
            const { ContextCard, formatTokens } = await importModule(`${pathToFileURL(outputPath).href}?t=${Date.now()}`);

            assert.deepStrictEqual([155, 37190, 31115, 255780, 256000].map(formatTokens), ['155', '37.2K', '31.1K', '256K', '256K']);

            const render = (data: Record<string, unknown> | null) =>
                collectTemplates(ContextCard.prototype.render.call({ data }));
            assert.strictEqual(textOf(render(null)), '');

            const base = { title: 'Fix tests', model: 'gemini-3.8-flash', usedTokens: 37190, maxTokens: 256000, percent: 14.5, warningThreshold: 80, compressedAt: null };
            const normal = textOf(render(base));
            assert.match(normal, /Context/);
            assert.match(normal, /37\.2K \/ 256K \(15%\)/);
            assert.match(normal, /context-fill normal/);
            assert.match(normal, /Fix tests · gemini-3\.8-flash/);
            assert.doesNotMatch(normal, /Compressed at/);

            assert.match(textOf(render({ ...base, percent: 85 })), /context-fill warning/);
            assert.match(textOf(render({ ...base, percent: 99.9 })), /context-fill critical/);
            assert.match(textOf(render({ ...base, compressedAt: Date.now() })), /Compressed at /);
        } finally {
            if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
            else delete (globalThis as { window?: unknown }).window;
            if (originalRegistry) Object.defineProperty(globalThis, 'customElements', originalRegistry);
            else delete (globalThis as { customElements?: unknown }).customElements;
            fs.rmSync(outputPath, { force: true });
        }
    });
});
