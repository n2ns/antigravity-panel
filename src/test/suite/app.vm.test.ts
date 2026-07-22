import * as assert from 'assert';
import * as vscode from 'vscode';
import { AppViewModel } from '../../view-model/app.vm';
import { QuotaStrategyManager } from '../../model/strategy';
import { ConfigManager, IConfigReader } from '../../shared/config/config_manager';
import type { IQuotaService, ICacheService, IStorageService, IAutomationService } from '../../model/services/interfaces';
import type { QuotaSnapshot } from '../../model/types/entities';

// Mock Automation Service
const defaultMockAutomationService: IAutomationService = {
    start: () => { },
    stop: () => { },
    isRunning: () => false,
    toggle: () => false,
    updateInterval: () => { }
};

// Mock Config Reader (reused)
class MockConfigReader implements IConfigReader {
    private values: Map<string, any> = new Map();
    get<T>(key: string, defaultValue: T): T {
        return this.values.has(key) ? this.values.get(key) as T : defaultValue;
    }
    set(key: string, value: any) { this.values.set(key, value); }
}

// Mock Dependencies Defaults
const defaultMockQuotaService: IQuotaService = {
    fetchQuota: async () => null,
    onUpdate: () => { },
    onError: () => { }
};

const defaultMockCacheService: ICacheService = {
    getCacheInfo: async () => ({
        totalSize: 1024,
        brainSize: 512,
        conversationsSize: 512,
        brainCount: 1,
        conversationsCount: 1,
        brainTasks: [],
        codeContexts: []
    }),
    getTaskFiles: async () => [],
    getContextFiles: async () => [],
    getBrainTasks: async () => [],
    getCodeContexts: async () => [],
    deleteTask: async () => { },
    deleteContext: async () => { },
    deleteFile: async () => { },
    cleanCache: async () => ({ deletedCount: 0, freedBytes: 0 })
};

const defaultMockStorageService: IStorageService = {
    recordQuotaPoint: async () => { },
    calculateUsageBuckets: () => [],
    getMaxUsage: () => 0,
    getLatestResetTime: () => null,
    getDailyConsumption: () => [],
    setLastViewState: async () => { },
    getLastViewState: () => null,
    setLastSnapshot: async () => { },
    getLastSnapshot: () => null,
    setLastCacheSize: async () => { },
    getLastCacheSize: () => 0,
    setLastCacheDetails: async () => { },
    getLastCacheDetails: () => ({ brain: 0, workspace: 0 }),
    setLastTreeState: async () => { },
    getLastTreeState: () => null,
    setLastDisplayPercentage: async () => { },
    setLastPrediction: async () => { },
    setLastCacheWarningTime: async () => { },
    getLastCacheWarningTime: () => 0,
    getRecentHistory: () => [],
    getLastDisplayPercentage: () => 0,
    getLastPrediction: () => ({ usageRate: 0, runway: '', groupId: '' }),
    getLastUserInfo: () => null,
    setLastUserInfo: async () => { },
    getLastTokenUsage: () => null,
    setLastTokenUsage: async () => { },
    clear: async () => { },
    count: 0
};

suite('AppViewModel Test Suite', () => {
    let vm: AppViewModel;
    let configManager: ConfigManager;
    let configReader: MockConfigReader;
    let strategyManager: QuotaStrategyManager;
    let mockQuota: IQuotaService;
    let mockCache: ICacheService;
    let mockStorage: IStorageService;

    setup(() => {
        configReader = new MockConfigReader();
        configManager = new ConfigManager(configReader);
        strategyManager = new QuotaStrategyManager();

        // Clone mocks to allow per-test modification of methods
        mockQuota = { ...defaultMockQuotaService };
        mockCache = { ...defaultMockCacheService };
        mockStorage = { ...defaultMockStorageService };

        vm = new AppViewModel(mockQuota, mockCache, mockStorage, configManager, strategyManager, defaultMockAutomationService);
    });

    teardown(() => {
        if (vm) vm.dispose();
    });

    test('should initialize with empty state', () => {
        const state = vm.getState();
        assert.ok(state.quota.groups.length > 0);
        assert.strictEqual(state.lastUpdated, 0);
    });

    test('refreshQuota should update state from service', async () => {
        let recordedUsage: Record<string, number> | undefined;
        mockStorage.recordQuotaPoint = async usage => { recordedUsage = usage; };
        const snapshot: QuotaSnapshot = {
            timestamp: new Date(),
            models: [{
                modelId: 'MODEL_PLACEHOLDER_M47',
                label: 'Gemini 3 Flash',
                remainingPercentage: 50,
                isExhausted: false,
                resetTime: new Date(),
                timeUntilReset: '1h'
            }]
        };
        mockQuota.fetchQuota = async () => snapshot;

        await vm.refreshQuota();

        const state = vm.getState();
        const activeGroups = state.quota.groups.filter(g => g.hasData);
        assert.strictEqual(activeGroups.length, 1, 'Should have 1 active group');
        assert.strictEqual(activeGroups[0].id, 'gemini');
        assert.strictEqual(activeGroups[0].remaining, 50);
        assert.deepStrictEqual(recordedUsage, { gemini: 50 }, 'History should be recorded once per quota pool');
    });

    test('Gemini Flash and Pro should aggregate into one configurable quota pool', async () => {
        let recordedUsage: Record<string, number> | undefined;
        mockStorage.recordQuotaPoint = async usage => { recordedUsage = usage; };
        mockQuota.fetchQuota = async () => ({
            timestamp: new Date(),
            models: [
                {
                    modelId: 'MODEL_PLACEHOLDER_M37',
                    label: 'Gemini 3.1 Pro (High)',
                    remainingPercentage: 55,
                    isExhausted: false,
                    resetTime: new Date(Date.now() + 2 * 3600000),
                    timeUntilReset: '2h'
                },
                {
                    modelId: 'MODEL_PLACEHOLDER_M47',
                    label: 'Gemini 3 Flash',
                    remainingPercentage: 80,
                    isExhausted: false,
                    resetTime: new Date(Date.now() + 5 * 3600000),
                    timeUntilReset: '5h'
                }
            ]
        });

        await vm.refreshQuota();

        const geminiPool = vm.getState().quota.groups.find(group => group.id === 'gemini');
        assert.ok(geminiPool?.hasData);
        assert.strictEqual(geminiPool.remaining, 55);
        assert.strictEqual(geminiPool.resetTime, '2h');
        assert.deepStrictEqual(recordedUsage, { gemini: 55 });
        assert.strictEqual(vm.getState().quota.displayItems.filter(item => item.hasData).length, 1);
        assert.deepStrictEqual(vm.getStatusBarData().allGroups.map(group => group.id), ['gemini']);
    });

    test('models view should retain Flash and Pro identities while sharing pool consumption', async () => {
        configReader.set('dashboard.viewMode', 'models');
        mockStorage.calculateUsageBuckets = () => [{
            startTime: Date.now() - 60_000,
            endTime: Date.now(),
            items: [{ groupId: 'gemini', usage: 3 }]
        }];
        mockQuota.fetchQuota = async () => ({
            timestamp: new Date(),
            models: [
                { modelId: 'MODEL_PLACEHOLDER_M47', label: 'Gemini 3 Flash', remainingPercentage: 75, isExhausted: false, resetTime: new Date(), timeUntilReset: '1h' },
                { modelId: 'MODEL_PLACEHOLDER_M37', label: 'Gemini 3.1 Pro (High)', remainingPercentage: 75, isExhausted: false, resetTime: new Date(), timeUntilReset: '1h' }
            ]
        });

        await vm.refreshQuota();

        const items = vm.getState().quota.displayItems;
        assert.deepStrictEqual(items.map(item => item.label), ['Gemini 3 Flash', 'Gemini 3.1 Pro (High)']);
        assert.deepStrictEqual(items.map(item => item.themeColor), ['#40C4FF', '#69F0AE']);
        assert.ok(items.every(item => item.subLabel === '🔥2.0 pp/h'));
    });

    test('chart should aggregate polling samples into a readable number of buckets', async () => {
        let requestedDisplayMinutes = 0;
        let requestedBucketMinutes = 0;
        mockStorage.calculateUsageBuckets = (displayMinutes, bucketMinutes) => {
            requestedDisplayMinutes = displayMinutes;
            requestedBucketMinutes = bucketMinutes;
            return [{
                startTime: Date.now() - bucketMinutes * 60 * 1000,
                endTime: Date.now(),
                items: [
                    { groupId: 'gemini-flash', usage: 0.5 },
                    { groupId: 'gemini-pro', usage: 0.25 }
                ]
            }];
        };
        mockQuota.fetchQuota = async () => ({
            timestamp: new Date(),
            models: [{
                modelId: 'MODEL_PLACEHOLDER_M47',
                label: 'Gemini 3 Flash',
                remainingPercentage: 50,
                isExhausted: false,
                resetTime: new Date(Date.now() + 60 * 60 * 1000),
                timeUntilReset: '1h'
            }]
        });

        await vm.refreshQuota();

        const chart = vm.getState().quota.chart;
        assert.strictEqual(requestedDisplayMinutes, 90);
        assert.strictEqual(requestedBucketMinutes, 4, '90 minutes should use at most about 24 bars');
        assert.strictEqual(chart.interval, 240);
        assert.strictEqual(chart.groupLabels?.gemini, 'Gemini');
        assert.deepStrictEqual(chart.buckets[0].items, [{ groupId: 'gemini', usage: 0.5, color: '#40C4FF' }]);
    });

    test('refreshQuota should ignore stale slower responses', async () => {
        let resolveFirst: (value: QuotaSnapshot) => void = () => { };
        let resolveSecond: (value: QuotaSnapshot) => void = () => { };
        let calls = 0;
        const makeSnapshot = (remainingPercentage: number): QuotaSnapshot => ({
            timestamp: new Date(),
            models: [{
                modelId: 'MODEL_PLACEHOLDER_M47',
                label: 'Gemini 3 Flash',
                remainingPercentage,
                isExhausted: false,
                resetTime: new Date(),
                timeUntilReset: '1h'
            }]
        });

        mockQuota.fetchQuota = async () => {
            calls++;
            return new Promise<QuotaSnapshot>((resolve) => {
                if (calls === 1) {
                    resolveFirst = resolve;
                } else {
                    resolveSecond = resolve;
                }
            });
        };

        const firstRefresh = vm.refreshQuota();
        const secondRefresh = vm.refreshQuota();

        resolveSecond(makeSnapshot(80));
        await secondRefresh;

        resolveFirst(makeSnapshot(10));
        await firstRefresh;

        const gemini = vm.getState().quota.groups.find(g => g.id === 'gemini');
        assert.strictEqual(gemini?.remaining, 80);
    });

    test('refreshCache should update cache state', async () => {
        mockCache.getCacheInfo = async () => ({
            totalSize: 2048,
            brainSize: 1024,
            conversationsSize: 1024,
            brainCount: 5,
            conversationsCount: 5,
            brainTasks: [],
            codeContexts: []
        });

        await vm.refreshCache();

        const state = vm.getState();
        assert.strictEqual(state.cache.totalSize, 2048);
        assert.strictEqual(state.cache.formattedTotal, '2.0 KB');
    });

    test('should detect active group based on consumption', async () => {
        // First update: 100%
        mockQuota.fetchQuota = async () => ({
            timestamp: new Date(),
            models: [
                { modelId: 'gpt-4', label: 'GPT-4', remainingPercentage: 100, isExhausted: false, resetTime: new Date(), timeUntilReset: '' },
                { modelId: 'claude-3-sonnet', label: 'Claude', remainingPercentage: 100, isExhausted: false, resetTime: new Date(), timeUntilReset: '' }
            ]
        });
        await vm.refreshQuota();

        // Second update: Claude drops
        mockQuota.fetchQuota = async () => ({
            timestamp: new Date(),
            models: [
                { modelId: 'gpt-4', label: 'GPT-4', remainingPercentage: 100, isExhausted: false, resetTime: new Date(), timeUntilReset: '' },
                { modelId: 'claude-3-sonnet', label: 'Claude', remainingPercentage: 90, isExhausted: false, resetTime: new Date(), timeUntilReset: '' }
            ]
        });
        await vm.refreshQuota();

        const state = vm.getState();
        // If strategy maps claude-3-sonnet to 'claude' group, it should be active
        // We rely on QuotaStrategyManager default config here. 
        // If 'claude' group exists, assert it is active.
        const claudeGroup = state.quota.groups.find(g => g.label.toLowerCase().includes('claude'));
        if (claudeGroup) {
            assert.strictEqual(state.quota.activeGroupId, claudeGroup.id);
        }
    });

    test('Claude and GPT shared pool: one pool uses min remaining and matching reset', async () => {
        const gptReset = new Date(Date.now() + 48 * 3600000);
        mockQuota.fetchQuota = async () => ({
            timestamp: new Date(),
            models: [
                {
                    modelId: 'MODEL_OPENAI_GPT_OSS_120B_MEDIUM',
                    label: 'GPT-OSS 120B (Medium)',
                    remainingPercentage: 45,
                    isExhausted: false,
                    resetTime: gptReset,
                    timeUntilReset: '2d'
                },
                {
                    modelId: 'MODEL_PLACEHOLDER_M35',
                    label: 'Claude Sonnet 4.6 (Thinking)',
                    remainingPercentage: 70,
                    isExhausted: false,
                    resetTime: new Date(Date.now() + 5 * 3600000),
                    timeUntilReset: '5h'
                }
            ]
        });
        await vm.refreshQuota();
        const state = vm.getState();
        const claudeG = state.quota.groups.find(g => g.id === 'non-google');
        assert.ok(claudeG?.hasData, 'shared pool should have data');
        assert.strictEqual(claudeG!.remaining, 45, 'Claude pool should use pool minimum');
        assert.strictEqual(claudeG!.resetTime, '2d');
    });

    test('deleteTask should call service and refresh', async () => {
        let deletedId = '';
        mockCache.deleteTask = async (id) => { deletedId = id; };

        let refreshed = false;
        const originalRefresh = vm.refreshCache.bind(vm);
        vm.refreshCache = async () => { refreshed = true; await originalRefresh(); };

        (vscode.window as any).nextMessageSelection = 'Delete';
        try {
            await vm.deleteTask('task-to-delete');
        } finally {
            (vscode.window as any).nextMessageSelection = undefined;
        }

        assert.strictEqual(deletedId, 'task-to-delete');
        assert.strictEqual(refreshed, true);
    });
    test('toggleTasksSection should invert tasks expanded state', () => {
        const initialState = vm.getState().tree.tasks.expanded;

        // Listen for event
        let eventFired = false;
        const disposable = vm.onTreeChange(() => { eventFired = true; });

        vm.toggleTasksSection();

        const newState = vm.getState().tree.tasks.expanded;
        assert.notStrictEqual(newState, initialState, 'State should be inverted');
        assert.strictEqual(eventFired, true, 'onTreeChange event should fire');

        disposable.dispose();
    });

    test('toggleContextsSection should invert contexts expanded state', () => {
        const initialState = vm.getState().tree.contexts.expanded;

        // Listen for event
        let eventFired = false;
        const disposable = vm.onTreeChange(() => { eventFired = true; });

        vm.toggleContextsSection();

        const newState = vm.getState().tree.contexts.expanded;
        assert.notStrictEqual(newState, initialState, 'State should be inverted');
        assert.strictEqual(eventFired, true, 'onTreeChange event should fire');

        disposable.dispose();
    });
    test('toggleTaskExpansion should load files and toggle state', async () => {
        const taskId = 'task-1';

        // Setup initial tree state
        vm.getState().tree.tasks.folders = [{ id: taskId, label: 'Task 1', size: '', lastModified: 0, expanded: false, loading: false, files: [] }];

        // Mock file loading
        mockCache.getTaskFiles = async (id) => ([{ name: 'file1.txt', path: '/path/file1.txt' }]);

        let eventFired = false;
        const disposable = vm.onTreeChange(() => { eventFired = true; });

        // Expand
        await vm.toggleTaskExpansion(taskId);

        const folder = vm.getState().tree.tasks.folders.find(f => f.id === taskId);
        assert.strictEqual(folder?.expanded, true, 'Folder should be expanded');
        assert.strictEqual(folder?.files.length, 1, 'Files should be loaded');
        assert.strictEqual(eventFired, true, 'onTreeChange should fire');

        // Collapse
        eventFired = false;
        await vm.toggleTaskExpansion(taskId);

        assert.strictEqual(folder?.expanded, false, 'Folder should be collapsed');
        assert.strictEqual(folder?.files.length, 0, 'Files should be cleared on collapse (UI optimization)');

        disposable.dispose();
    });

    test('toggleContextExpansion should load files and toggle state', async () => {
        const contextId = 'ctx-1';

        // Setup initial tree state
        vm.getState().tree.contexts.folders = [{ id: contextId, label: 'Ctx 1', size: '', lastModified: 0, expanded: false, loading: false, files: [] }];

        // Mock file loading
        mockCache.getContextFiles = async (id) => ([{ name: 'ctx_file.ts', path: '/path/ctx_file.ts' }]);

        let eventFired = false;
        const disposable = vm.onTreeChange(() => { eventFired = true; });

        // Expand
        await vm.toggleContextExpansion(contextId);

        const folder = vm.getState().tree.contexts.folders.find(f => f.id === contextId);
        assert.strictEqual(folder?.expanded, true, 'Folder should be expanded');
        assert.strictEqual(folder?.files.length, 1, 'Files should be loaded');
        assert.strictEqual(eventFired, true, 'onTreeChange should fire');

        // Collapse
        eventFired = false;
        await vm.toggleContextExpansion(contextId);

        assert.strictEqual(folder?.expanded, false, 'Folder should be collapsed');

        disposable.dispose();
    });

    test('getSidebarData should include configuration fields', () => {
        const data = vm.getSidebarData();
        assert.ok(data.hasOwnProperty('uiScale'), 'Should include uiScale');
        assert.ok(data.hasOwnProperty('gaugeStyle'), 'Should include gaugeStyle');
        assert.ok(data.hasOwnProperty('showUserInfoCard'), 'Should include showUserInfoCard');
        assert.ok(data.hasOwnProperty('showCreditsCard'), 'Should include showCreditsCard');

        // Verify default values or values from mock reader
        assert.strictEqual(data.uiScale, 1.0);
        assert.strictEqual(data.gaugeStyle, 'semi-arc');
        assert.strictEqual(data.showUserInfoCard, true);
        assert.strictEqual(data.showCreditsCard, false);
    });

    test('getSidebarData should allow the credits card to be explicitly enabled', () => {
        configReader.set('dashboard.showCreditsCard', true);
        assert.strictEqual(vm.getSidebarData().showCreditsCard, true);
    });

    suite('Quota reset notification', () => {
        const makeSnapshot = (remainingPercentage: number): QuotaSnapshot => ({
            timestamp: new Date(),
            models: [{
                modelId: 'MODEL_PLACEHOLDER_M47',
                label: 'Gemini 3 Flash',
                remainingPercentage,
                isExhausted: false,
                resetTime: new Date(),
                timeUntilReset: '1h'
            }]
        });

        const refreshWith = async (remaining: number) => {
            mockQuota.fetchQuota = async () => makeSnapshot(remaining);
            await vm.refreshQuota();
        };

        setup(() => {
            (vscode.window as any).lastInfoMessage = undefined;
        });

        test('should notify when quota rebounds above the reset threshold', async () => {
            await refreshWith(10);
            await refreshWith(100);
            const message = (vscode.window as any).lastInfoMessage as string | undefined;
            assert.ok(message?.startsWith('Quota reset:'), `Expected reset notification, got: ${message}`);
        });

        test('should stay silent on small rebounds (server jitter)', async () => {
            await refreshWith(50);
            await refreshWith(52);
            assert.strictEqual((vscode.window as any).lastInfoMessage, undefined);
        });

        test('should respect system.notifyOnQuotaReset = false', async () => {
            configReader.set('system.notifyOnQuotaReset', false);
            await refreshWith(10);
            await refreshWith(100);
            assert.strictEqual((vscode.window as any).lastInfoMessage, undefined);
        });

        test('should apply the notification cooldown per group', async () => {
            await refreshWith(10);
            await refreshWith(100);
            assert.ok((vscode.window as any).lastInfoMessage, 'First reset should notify');

            (vscode.window as any).lastInfoMessage = undefined;
            await refreshWith(10);
            await refreshWith(100);
            assert.strictEqual((vscode.window as any).lastInfoMessage, undefined, 'Second reset within cooldown should stay silent');
        });

        test('should not treat the Ready display fallback as an observed quota reset', async () => {
            const records: { usage: Record<string, number>; resets?: string[] }[] = [];
            mockStorage.recordQuotaPoint = async (usage, resets) => { records.push({ usage, resets }); };
            const readySnapshot = (): QuotaSnapshot => ({
                timestamp: new Date(),
                models: [{
                    modelId: 'MODEL_PLACEHOLDER_M47',
                    label: 'Gemini 3 Flash',
                    remainingPercentage: 10,
                    isExhausted: false,
                    resetTime: new Date(Date.now() - 60_000),
                    timeUntilReset: 'Ready'
                }]
            });

            mockQuota.fetchQuota = async () => readySnapshot();
            await vm.refreshQuota();
            await vm.refreshQuota();

            assert.deepStrictEqual(records.map(record => record.usage), [{ gemini: 10 }, { gemini: 10 }]);
            assert.deepStrictEqual(records[1].resets, []);
            assert.strictEqual((vscode.window as any).lastInfoMessage, undefined);
        });
    });

    suite('Abnormal quota drain alerts', () => {
        const makeSnapshot = (remainingPercentage: number): QuotaSnapshot => ({
            timestamp: new Date(),
            models: [{
                modelId: 'MODEL_PLACEHOLDER_M47',
                label: 'Gemini 3 Flash',
                remainingPercentage,
                isExhausted: false,
                resetTime: new Date(Date.now() + 60 * 60 * 1000),
                timeUntilReset: '1h'
            }]
        });

        setup(() => {
            (vscode.window as any).lastWarningMessage = undefined;
            (vscode.window as any).state.focused = true;
        });

        teardown(() => {
            (vscode.window as any).state.focused = true;
        });

        test('should warn when quota dropped while the IDE was closed', async () => {
            const now = Date.now();
            mockStorage.getRecentHistory = () => [{
                timestamp: now - 5 * 60 * 1000,
                usage: { gemini: 90 }
            }];
            mockStorage.getLastSnapshot = <T>() => makeSnapshot(90) as T;
            mockQuota.fetchQuota = async () => makeSnapshot(80);

            await vm.refreshQuota();

            assert.match(
                (vscode.window as any).lastWarningMessage || '',
                /^Abnormal quota drain:/
            );
        });

        test('should not treat a fallback reset timestamp as a real offline reset', async () => {
            const now = Date.now();
            mockStorage.getRecentHistory = () => [{
                timestamp: now - 2 * 60 * 60 * 1000,
                usage: { gemini: 90 }
            }];
            const stored = makeSnapshot(90);
            stored.models[0].resetTime = new Date(now - 60 * 60 * 1000);
            stored.models[0].resetTimeIsFallback = true;
            mockStorage.getLastSnapshot = <T>() => stored as T;
            mockQuota.fetchQuota = async () => makeSnapshot(80);

            await vm.refreshQuota();

            assert.match(
                (vscode.window as any).lastWarningMessage || '',
                /^Abnormal quota drain:/
            );
        });

        test('should require an unfocused window before accumulating idle drain', async () => {
            const realNow = Date.now;
            const start = 1_700_000_000_000;

            try {
                global.Date.now = () => start;
                vm.dispose();
                vm = new AppViewModel(
                    mockQuota,
                    mockCache,
                    mockStorage,
                    configManager,
                    strategyManager,
                    defaultMockAutomationService
                );

                mockQuota.fetchQuota = async () => makeSnapshot(100);
                await vm.refreshQuota();

                global.Date.now = () => start + 11 * 60 * 1000;
                mockQuota.fetchQuota = async () => makeSnapshot(94);
                await vm.refreshQuota();
                assert.strictEqual((vscode.window as any).lastWarningMessage, undefined);

                (vscode.window as any).state.focused = false;
                global.Date.now = () => start + 12 * 60 * 1000;
                mockQuota.fetchQuota = async () => makeSnapshot(88);
                await vm.refreshQuota();
                assert.match(
                    (vscode.window as any).lastWarningMessage || '',
                    /^Abnormal quota drain:/
                );
            } finally {
                global.Date.now = realNow;
            }
        });
    });

    test('getSidebarData should include current and previous seven-day usage totals', () => {
        mockStorage.getDailyConsumption = (_groupId, days, maxSampleGapMs) => {
            assert.strictEqual(days, 14);
            assert.strictEqual(maxSampleGapMs, 10 * 60 * 1000);
            return Array.from({ length: 14 }, (_, index) => ({
                dayStart: index,
                usage: index < 7 ? 1 : 2,
                hasData: true
            }));
        };

        const weekly = vm.getSidebarData().weekly;

        assert.ok(weekly);
        assert.strictEqual(weekly.days.length, 7);
        assert.strictEqual(weekly.total, 14);
        assert.strictEqual(weekly.previousTotal, 7);
    });

    test('restoreFromCache should normalize reset timestamps serialized as strings', () => {
        const cachedQuota = vm.getState().quota;
        const cachedSnapshot = {
            timestamp: new Date().toISOString(),
            models: [{
                modelId: 'MODEL_PLACEHOLDER_M47',
                label: 'Gemini 3 Flash',
                remainingPercentage: 50,
                isExhausted: false,
                resetTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
                timeUntilReset: '1h'
            }]
        } as unknown as QuotaSnapshot;
        mockStorage.getLastViewState = <T>() => cachedQuota as T;
        mockStorage.getLastSnapshot = <T>() => cachedSnapshot as T;

        assert.strictEqual(vm.restoreFromCache(), true);
        const gemini = vm.getState().quota.displayItems.find(item => item.id === 'gemini');
        assert.strictEqual(typeof gemini?.resetDate, 'number');
    });

    test('dispose should invalidate a quota fetch that is still in flight', async () => {
        let resolveFetch!: (snapshot: QuotaSnapshot) => void;
        let recordCount = 0;
        mockQuota.fetchQuota = () => new Promise(resolve => { resolveFetch = resolve; });
        mockStorage.recordQuotaPoint = async () => { recordCount++; };

        const refresh = vm.refreshQuota();
        vm.dispose();
        resolveFetch({ timestamp: new Date(), models: [] });
        await refresh;

        assert.strictEqual(recordCount, 0);
    });

    test('serialized quota updates should not let an older refresh overwrite a newer one', async () => {
        const snapshot = (remainingPercentage: number): QuotaSnapshot => ({
            timestamp: new Date(),
            models: [{
                modelId: 'MODEL_PLACEHOLDER_M47',
                label: 'Gemini 3 Flash',
                remainingPercentage,
                isExhausted: false,
                resetTime: new Date(Date.now() + 60 * 60 * 1000),
                timeUntilReset: '1h'
            }]
        });
        let firstRecordStarted!: () => void;
        const firstRecord = new Promise<void>(resolve => { firstRecordStarted = resolve; });
        let releaseFirstRecord!: () => void;
        const firstRecordBlocked = new Promise<void>(resolve => { releaseFirstRecord = resolve; });
        let recordCount = 0;
        mockStorage.recordQuotaPoint = async () => {
            recordCount++;
            if (recordCount === 1) {
                firstRecordStarted();
                await firstRecordBlocked;
            }
        };

        mockQuota.fetchQuota = async () => snapshot(50);
        const olderRefresh = vm.refreshQuota();
        await firstRecord;
        mockQuota.fetchQuota = async () => snapshot(40);
        const newerRefresh = vm.refreshQuota();
        releaseFirstRecord();
        await Promise.all([olderRefresh, newerRefresh]);

        const gemini = vm.getState().quota.groups.find(group => group.id === 'gemini');
        assert.strictEqual(gemini?.remaining, 40);
    });
});
