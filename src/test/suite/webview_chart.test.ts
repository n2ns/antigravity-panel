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

interface RenderableComponent {
    prototype: {
        render: (this: Record<string, unknown>) => unknown;
    };
}

function collectTemplates(value: unknown, output: LitTemplate[] = []): LitTemplate[] {
    if (Array.isArray(value)) {
        value.forEach(item => collectTemplates(item, output));
        return output;
    }
    if (!value || typeof value !== 'object') return output;

    const candidate = value as Partial<LitTemplate>;
    if (candidate._$litType$ !== undefined && candidate.strings && candidate.values) {
        const template = candidate as LitTemplate;
        output.push(template);
        template.values.forEach(item => collectTemplates(item, output));
    }
    return output;
}

suite('Webview Usage Chart Test Suite', () => {
    test('sidebar should mount charts and keep subscription credits visible independently', async () => {
        const sidebarPath = path.resolve(process.cwd(), 'src/view/webview/components/sidebar-app.ts');
        const chartPath = path.resolve(process.cwd(), 'src/view/webview/components/usage-chart.ts');
        const creditsPath = path.resolve(process.cwd(), 'src/view/webview/components/credits-bar.ts');
        const entrySource = [
            `export { SidebarApp } from ${JSON.stringify(sidebarPath)};`,
            `export { UsageChart } from ${JSON.stringify(chartPath)};`,
            `export { CreditsBar } from ${JSON.stringify(creditsPath)};`
        ].join('\n');
        const result = await build({
            stdin: {
                contents: entrySource,
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
        const outputPath = path.join(os.tmpdir(), `antigravity-webview-chart-${process.pid}-${Date.now()}.mjs`);
        fs.writeFileSync(outputPath, result.outputFiles[0].contents);

        const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
        Object.defineProperty(globalThis, 'window', {
            configurable: true,
            value: {
                __TRANSLATIONS__: {
                    usageStable: '用量稳定',
                    noReportedQuotaChange: '未上报配额变化'
                }
            }
        });

        try {
            const importModule = new Function('specifier', 'return import(specifier)') as
                (specifier: string) => Promise<{
                    SidebarApp: RenderableComponent;
                    UsageChart: RenderableComponent;
                    CreditsBar: RenderableComponent;
                }>;
            const moduleUrl = `${pathToFileURL(outputPath).href}?t=${Date.now()}`;
            const { SidebarApp, UsageChart, CreditsBar } = await importModule(moduleUrl);
            const chartData = {
                buckets: [
                    { startTime: 0, endTime: 1, items: [] },
                    { startTime: 1, endTime: 2, items: [{ groupId: 'gemini-flash', usage: 0.25, color: '#40C4FF' }] },
                    { startTime: 2, endTime: 3, items: [{ groupId: 'claude', usage: 0.5, color: '#FFAB40' }] }
                ],
                maxUsage: 0.5,
                groupColors: { 'gemini-flash': '#40C4FF', claude: '#FFAB40' },
                groupLabels: { 'gemini-flash': 'Gemini Flash', claude: 'Claude' },
                displayMinutes: 90,
                interval: 240,
                prediction: { groupId: 'claude', groupLabel: 'Claude', usageRate: 0.5, runway: 'Stable', remaining: 80 }
            };
            const sidebarTokenUsage = { userCredits: [{ creditType: 'GOOGLE_ONE_AI', creditAmount: '0' }] };

            const sidebarTemplate = SidebarApp.prototype.render.call({
                _connectionStatus: 'connected',
                _failureReason: null,
                _quotas: [],
                _gaugeStyle: 'semi-arc',
                _chartData: chartData,
                _showCreditsCard: false,
                _showUserInfoCard: false,
                _tokenUsage: sidebarTokenUsage,
                _user: null,
                _tasks: { stats: '', collapsed: true, loading: false, folders: [] },
                _contexts: { stats: '', collapsed: true, loading: false, folders: [] },
                _autoAcceptEnabled: false,
                _vscode: { postMessage: () => undefined }
            });
            const sidebarTemplates = collectTemplates(sidebarTemplate);
            const sidebarMarkup = sidebarTemplates
                .map(template => template.strings.join(''))
                .join('\n');
            assert.match(sidebarMarkup, /<usage-chart\s+\.data=/, 'Sidebar must mount UsageChart with current chart data');
            const chartBindingTemplate = sidebarTemplates.find(template =>
                template.strings.some(part => part.includes('<usage-chart .data='))
            );
            assert.ok(chartBindingTemplate, 'Sidebar chart binding template must exist');
            const chartDataValueIndex = chartBindingTemplate.strings.findIndex(part =>
                part.includes('<usage-chart .data=')
            );
            assert.strictEqual(
                chartBindingTemplate.values[chartDataValueIndex],
                chartData,
                'Sidebar must pass its current chart data object to UsageChart'
            );
            assert.match(sidebarMarkup, /<credits-bar\s+\.tokenUsage=/, 'Sidebar must always mount CreditsBar');
            assert.match(sidebarMarkup, /\.showPromptFlowCredits=/, 'Prompt/Flow visibility must be passed separately');
            const creditsBindingTemplate = sidebarTemplates.find(template =>
                template.strings.some(part => part.includes('<credits-bar'))
            );
            assert.ok(creditsBindingTemplate, 'Sidebar credits binding template must exist');
            const tokenUsageValueIndex = creditsBindingTemplate.strings.findIndex(part => part.includes('.tokenUsage='));
            const creditsFlagValueIndex = creditsBindingTemplate.strings.findIndex(part => part.includes('.showPromptFlowCredits='));
            assert.strictEqual(creditsBindingTemplate.values[tokenUsageValueIndex], sidebarTokenUsage);
            assert.strictEqual(creditsBindingTemplate.values[creditsFlagValueIndex], false);

            const enabledSidebarTemplate = SidebarApp.prototype.render.call({
                _connectionStatus: 'connected',
                _failureReason: null,
                _quotas: [],
                _gaugeStyle: 'semi-arc',
                _chartData: chartData,
                _showCreditsCard: true,
                _showUserInfoCard: false,
                _tokenUsage: sidebarTokenUsage,
                _user: null,
                _tasks: { stats: '', collapsed: true, loading: false, folders: [] },
                _contexts: { stats: '', collapsed: true, loading: false, folders: [] },
                _autoAcceptEnabled: false,
                _vscode: { postMessage: () => undefined }
            });
            const enabledCreditsBinding = collectTemplates(enabledSidebarTemplate).find(template =>
                template.strings.some(part => part.includes('<credits-bar'))
            );
            assert.ok(enabledCreditsBinding);
            const enabledFlagIndex = enabledCreditsBinding.strings.findIndex(part => part.includes('.showPromptFlowCredits='));
            assert.strictEqual(enabledCreditsBinding.values[enabledFlagIndex], true);

            const emptyChartData = {
                ...chartData,
                buckets: chartData.buckets.map(bucket => ({ ...bucket, items: [] }))
            };
            assert.strictEqual(
                collectTemplates(UsageChart.prototype.render.call({ data: emptyChartData })).length,
                0,
                'UsageChart must stay hidden until the first positive usage sample'
            );

            const chartTemplate = UsageChart.prototype.render.call({ data: chartData });
            const chartTemplates = collectTemplates(chartTemplate);
            const chartValues = chartTemplates.flatMap(template => template.values);
            assert.ok(chartValues.includes('用量稳定'), 'Stable runway should use the visible localized status');
            const renderedBars = chartTemplates.filter(template =>
                template.strings.some(part => part.includes('class="usage-bar'))
            );
            assert.strictEqual(renderedBars.length, chartData.buckets.length, 'UsageChart must render one bar per time bucket');
            const barClasses = renderedBars.map(template => {
                const index = template.strings.findIndex(part => part.includes('class="usage-bar '));
                return template.values[index];
            });
            const barHeights = renderedBars.map(template => {
                const index = template.strings.findIndex(part => part.includes('style="height: '));
                return template.values[index] as number;
            });
            const barBackgrounds = renderedBars.map(template => {
                const index = template.strings.findIndex(part => part.includes('px; background: '));
                return template.values[index] as string;
            });
            assert.deepStrictEqual(barClasses, ['empty', '', '']);
            assert.strictEqual(barHeights[0], 1);
            assert.ok(barHeights[1] > 1 && barHeights[2] > 1, 'Positive buckets must render visible bars');
            assert.ok(barBackgrounds[1].includes('#40C4FF') && barBackgrounds[2].includes('#FFAB40'));
            const barTooltips = renderedBars.map(template => {
                const index = template.strings.findIndex(part => part.includes('data-tooltip="'));
                return template.values[index] as string;
            });
            assert.ok(barTooltips[0].includes('未上报配额变化'), 'Empty bucket tooltip should be localized');

            const tokenUsage = {
                promptCredits: { available: 500, monthly: 50000, remainingPercentage: 1 },
                flowCredits: { available: 100, monthly: 150000, remainingPercentage: 1 },
                userCredits: [{ creditType: 'GOOGLE_ONE_AI', creditAmount: '0' }],
                formatted: {
                    promptAvailable: '500', promptMonthly: '50.0K',
                    flowAvailable: '100', flowMonthly: '150.0K'
                }
            };
            const subscriptionOnly = CreditsBar.prototype.render.call({
                tokenUsage,
                showPromptFlowCredits: false,
                _getColor: () => '#fff'
            });
            const subscriptionTemplates = collectTemplates(subscriptionOnly);
            const subscriptionMarkup = subscriptionTemplates.map(template => template.strings.join('')).join('\n');
            const subscriptionValues = subscriptionTemplates.flatMap(template => template.values);
            assert.ok(subscriptionValues.includes('Google One AI'), 'Google One AI must remain visible by default');
            assert.ok(!subscriptionValues.some(value => typeof value === 'string' && /Reasoning Credits|Execution Credits/.test(value)), 'Static Prompt/Flow rows must stay hidden by default');
            assert.match(subscriptionMarkup, /class="credit-header"/, 'Credit label and value must share an aligned row');

            const allCredits = CreditsBar.prototype.render.call({
                tokenUsage,
                showPromptFlowCredits: true,
                _getColor: () => '#fff'
            });
            const allCreditValues = collectTemplates(allCredits).flatMap(template => template.values);
            assert.ok(allCreditValues.some(value => typeof value === 'string' && value.includes('Reasoning Credits')), 'Prompt credits must render when explicitly enabled');
            assert.ok(allCreditValues.some(value => typeof value === 'string' && value.includes('Execution Credits')), 'Flow credits must render when explicitly enabled');
        } finally {
            if (originalWindow) {
                Object.defineProperty(globalThis, 'window', originalWindow);
            } else {
                Reflect.deleteProperty(globalThis, 'window');
            }
            fs.rmSync(outputPath, { force: true });
        }
    });
});
