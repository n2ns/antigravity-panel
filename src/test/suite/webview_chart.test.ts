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
        const weeklyPath = path.resolve(process.cwd(), 'src/view/webview/components/weekly-usage.ts');
        const quotaPiePath = path.resolve(process.cwd(), 'src/view/webview/components/quota-pie.ts');
        const creditsPath = path.resolve(process.cwd(), 'src/view/webview/components/credits-bar.ts');
        const entrySource = [
            `export { SidebarApp } from ${JSON.stringify(sidebarPath)};`,
            `export { UsageChart } from ${JSON.stringify(chartPath)};`,
            `export { WeeklyUsage } from ${JSON.stringify(weeklyPath)};`,
            `export { QuotaPie } from ${JSON.stringify(quotaPiePath)};`,
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
                    noReportedQuotaChange: '未上报配额变化',
                    totalConsumed: '已消耗',
                    weeklyUsageTooltip: '本地估算，并非官方周限额',
                    noSamplingData: '无采样数据',
                    previous7Days: '前 7 天',
                    noPreviousWeekData: '无前一周数据'
                }
            }
        });

        try {
            const importModule = new Function('specifier', 'return import(specifier)') as
                (specifier: string) => Promise<{
                    SidebarApp: RenderableComponent;
                    UsageChart: RenderableComponent;
                    WeeklyUsage: RenderableComponent;
                    QuotaPie: RenderableComponent & { new(): any };
                    CreditsBar: RenderableComponent;
                }>;
            const moduleUrl = `${pathToFileURL(outputPath).href}?t=${Date.now()}`;
            const { SidebarApp, UsageChart, WeeklyUsage, QuotaPie, CreditsBar } = await importModule(moduleUrl);
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
            const weeklyData = {
                groupId: 'gemini-flash',
                groupLabel: 'Gemini Flash',
                themeColor: '#40C4FF',
                days: Array.from({ length: 7 }, (_, index) => ({
                    dayStart: index * 24 * 60 * 60 * 1000,
                    usage: index,
                    hasData: index !== 0
                })),
                total: 21,
                previousTotal: 12
            };
            const sidebarTokenUsage = { userCredits: [{ creditType: 'GOOGLE_ONE_AI', creditAmount: '0' }] };

            const sidebarTemplate = SidebarApp.prototype.render.call({
                _connectionStatus: 'connected',
                _failureReason: null,
                _quotas: [],
                _gaugeStyle: 'semi-arc',
                _chartData: chartData,
                _weekly: weeklyData,
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
            assert.match(sidebarMarkup, /<weekly-usage\s+\.data=/, 'Sidebar must mount WeeklyUsage');
            const weeklyBindingTemplate = sidebarTemplates.find(template =>
                template.strings.some(part => part.includes('<weekly-usage .data='))
            );
            assert.ok(weeklyBindingTemplate, 'Sidebar weekly binding template must exist');
            const weeklyDataValueIndex = weeklyBindingTemplate.strings.findIndex(part =>
                part.includes('<weekly-usage .data=')
            );
            assert.strictEqual(weeklyBindingTemplate.values[weeklyDataValueIndex], weeklyData);
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
                _weekly: weeklyData,
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

            const weeklyTemplate = WeeklyUsage.prototype.render.call({ data: weeklyData });
            const weeklyTemplates = collectTemplates(weeklyTemplate);
            const weeklyValues = weeklyTemplates.flatMap(template => template.values);
            const weeklyBars = weeklyTemplates.filter(template =>
                template.strings.some(part => part.includes('class="usage-bar'))
            );
            assert.strictEqual(weeklyBars.length, 7, 'WeeklyUsage must render one bar per current-day bucket');
            assert.ok(weeklyValues.includes('21.0'), 'WeeklyUsage must render the current seven-day total');
            assert.ok(weeklyValues.includes('本地估算，并非官方周限额'), 'WeeklyUsage must explain the estimate boundary');
            const weeklyTooltips = weeklyBars.map(template => {
                const index = template.strings.findIndex(part => part.includes('data-tooltip="'));
                return template.values[index] as string;
            });
            assert.ok(weeklyTooltips[0].includes('无采样数据'), 'Unsampled days must not render as zero usage');
            assert.ok(
                weeklyValues.some(value => value === '前 7 天: 12.0 pp'),
                'WeeklyUsage must render the localized previous-period comparison'
            );

            const noPreviousData = WeeklyUsage.prototype.render.call({
                data: { ...weeklyData, previousTotal: null }
            });
            assert.ok(
                collectTemplates(noPreviousData).flatMap(template => template.values).includes('无前一周数据'),
                'WeeklyUsage must render the no-previous-period state'
            );

            const resetTimeGetter = Object.getOwnPropertyDescriptor(QuotaPie.prototype, 'resetTimeText')?.get;
            assert.ok(resetTimeGetter, 'QuotaPie live countdown getter must exist');
            const realNow = Date.now;
            const start = 1_700_000_000_000;
            try {
                global.Date.now = () => start;
                const countdownHost = { data: { resetDate: start + 90 * 60_000, resetTime: 'stale' } };
                assert.strictEqual(resetTimeGetter.call(countdownHost), '1h 30m');
                global.Date.now = () => start + 30 * 60_000;
                assert.strictEqual(resetTimeGetter.call(countdownHost), '1h 0m');
            } finally {
                global.Date.now = realNow;
            }

            const realSetInterval = global.setInterval;
            const realClearInterval = global.clearInterval;
            let tick: (() => void) | undefined;
            let cleared = false;
            try {
                global.setInterval = ((handler: () => void) => {
                    tick = handler;
                    return 123 as unknown as NodeJS.Timeout;
                }) as typeof setInterval;
                global.clearInterval = ((timer: NodeJS.Timeout) => {
                    cleared = timer === (123 as unknown as NodeJS.Timeout);
                }) as typeof clearInterval;
                const quotaPie = new QuotaPie();
                quotaPie.data = { resetDate: start + 60_000, resetTime: '1m', remaining: 50, hasData: true };
                let updates = 0;
                quotaPie.requestUpdate = () => { updates++; };
                quotaPie.connectedCallback();
                tick?.();
                quotaPie.disconnectedCallback();
                assert.strictEqual(updates, 1, 'Countdown interval must request a repaint');
                assert.strictEqual(cleared, true, 'Countdown interval must be cleared on disconnect');
            } finally {
                global.setInterval = realSetInterval;
                global.clearInterval = realClearInterval;
            }

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
