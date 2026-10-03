import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import { AppViewModel } from '../../view-model/app.vm';
import { QuotaStrategyManager } from '../../model/strategy';
import { ConfigManager, IConfigReader } from '../../shared/config/config_manager';
import type { IQuotaService, ICacheService, IStorageService, IAutomationService } from '../../model/services/interfaces';
import type { QuotaSnapshot } from '../../model/types/entities';

// Mock Automation Service
const defaultMockAutomationService: IAutomationService = {
    start: () => { },
    stop: () => { },
    updateInterval: () => { },
    setAcceptTerminalCommands: () => { }
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
    getCleanPlan: async (keepCount = 5) => ({ keepCount, tasks: [], orphanConversations: [], conversationFileCount: 0, totalBytes: 0 }),
    executeCleanPlan: async () => ({ deletedCount: 0, deletedConversationCount: 0, freedBytes: 0, failedCount: 0 }),
    cleanCache: async () => ({ deletedCount: 0, deletedConversationCount: 0, freedBytes: 0, failedCount: 0 })
};

const defaultMockStorageService: IStorageService = {
    recordQuotaPoint: async () => { },
    calculateUsageBuckets: () => [],
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
    setLastCacheWarningTime: async () => { },
    getLastCacheWarningTime: () => 0,
    getRecentHistory: () => [],
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
    });

    test('auto-accept terminal setting should reach the automation service at startup and on change', async () => {
        vm.dispose();
        const terminalCalls: boolean[] = [];
        const automation: IAutomationService = {
            ...defaultMockAutomationService,
            setAcceptTerminalCommands: (enabled: boolean) => { terminalCalls.push(enabled); }
        };
        configReader.set('system.autoAcceptTerminal', true);
        vm = new AppViewModel(mockQuota, mockCache, mockStorage, configManager, strategyManager, automation);
        assert.deepStrictEqual(terminalCalls, [true]);

        configReader.set('system.autoAcceptTerminal', false);
        await vm.onConfigurationChanged();
        assert.deepStrictEqual(terminalCalls, [true, false]);
    });

    test('terminal accept setting is applied before any await in onConfigurationChanged', () => {
        vm.dispose();
        const terminalCalls: boolean[] = [];
        const automation: IAutomationService = {
            ...defaultMockAutomationService,
            setAcceptTerminalCommands: (enabled: boolean) => { terminalCalls.push(enabled); }
        };
        // A cache scan that never finishes must not delay the terminal switch
        mockCache.getCacheInfo = () => new Promise(() => { });
        configReader.set('system.autoAcceptTerminal', true);
        vm = new AppViewModel(mockQuota, mockCache, mockStorage, configManager, strategyManager, automation);

        configReader.set('system.autoAcceptTerminal', false);
        void vm.onConfigurationChanged();
        assert.deepStrictEqual(terminalCalls, [true, false], 'setAcceptTerminalCommands(false) must run synchronously');
    });

    test('automation settings still apply when a refresh rejects', async () => {
        vm.dispose();
        const intervalCalls: number[] = [];
        const terminalCalls: boolean[] = [];
        const automation: IAutomationService = {
            ...defaultMockAutomationService,
            updateInterval: (ms: number) => { intervalCalls.push(ms); },
            setAcceptTerminalCommands: (enabled: boolean) => { terminalCalls.push(enabled); }
        };
        mockCache.getCacheInfo = async () => { throw new Error('scan failed'); };
        vm = new AppViewModel(mockQuota, mockCache, mockStorage, configManager, strategyManager, automation);

        configReader.set('system.autoAcceptInterval', 1200);
        configReader.set('system.autoAcceptTerminal', true);
        await vm.onConfigurationChanged().catch(() => { });

        assert.deepStrictEqual(intervalCalls, [800, 1200]);
        assert.deepStrictEqual(terminalCalls, [false, true]);
    });

    test('toggleAutoAccept should persist the toggle without the config listener flipping it back', async () => {
        vm.dispose();
        const calls: string[] = [];
        const automation: IAutomationService = {
            ...defaultMockAutomationService,
            start: () => { calls.push('start'); },
            stop: () => { calls.push('stop'); }
        };
        const writes: Array<[string, unknown]> = [];
        const reader = new MockConfigReader() as MockConfigReader & IConfigReader;
        reader.update = async (key: string, value: unknown) => {
            writes.push([key, value]);
            reader.set(key, value);
            await vm.onConfigurationChanged();
        };
        vm = new AppViewModel(mockQuota, mockCache, mockStorage, new ConfigManager(reader), strategyManager, automation);

        await vm.toggleAutoAccept();
        assert.strictEqual(vm.getState().automation.enabled, true);
        await vm.toggleAutoAccept();
        assert.strictEqual(vm.getState().automation.enabled, false);
        assert.deepStrictEqual(writes, [['system.autoAccept', true], ['system.autoAccept', false]]);
        assert.deepStrictEqual(calls, ['start', 'stop']);
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

    test('refreshQuota should report fetch success and failure', async () => {
        vm.setConnectionStatus('detecting', null);
        mockQuota.fetchQuota = async () => null;
        assert.strictEqual(await vm.refreshQuota(), false);
        assert.strictEqual(vm.getState().connectionStatus, 'detecting', 'A failed fetch must not claim connected');

        mockQuota.fetchQuota = async () => ({ timestamp: new Date(), models: [] });
        assert.strictEqual(await vm.refreshQuota(), true);
        assert.strictEqual(vm.getState().connectionStatus, 'connected');

        vm.dispose();
        assert.strictEqual(await vm.refreshQuota(), false, 'No-op after dispose');
    });

    test('refreshQuota superseded by a newer refresh still reports a successful fetch', async () => {
        let resolveFirst: (value: QuotaSnapshot) => void = () => { };
        let calls = 0;
        mockQuota.fetchQuota = async () => {
            calls++;
            if (calls === 1) return new Promise<QuotaSnapshot>(resolve => { resolveFirst = resolve; });
            return null;
        };

        const first = vm.refreshQuota();
        assert.strictEqual(await vm.refreshQuota(), false);
        resolveFirst({ timestamp: new Date(), models: [] });
        assert.strictEqual(await first, true);
    });

    test('refreshCache should update cache state', async () => {
        mockCache.getCacheInfo = async () => ({
            totalSize: 2048,
            brainSize: 1024,
            conversationsSize: 1024,
            brainTasks: [],
            codeContexts: []
        });

        await vm.refreshCache();

        const state = vm.getState();
        assert.strictEqual(state.cache.totalSize, 2048);
        assert.strictEqual(state.cache.formattedTotal, '2.0 KB');
        assert.strictEqual(state.cache.formattedBrain, '1.0 KB');
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

    suite('Cache cleaning confirmations', () => {
        const plan = {
            keepCount: 3,
            tasks: [{ id: 'old-task', size: 1000, conversations: [{ path: '/c/old-task.pb', size: 24 }] }],
            orphanConversations: [{ path: '/c/orphan.pb', size: 1024 }],
            conversationFileCount: 2,
            totalBytes: 2048
        };
        let planKeepCount: number | undefined;
        let executedPlan: unknown;
        let l10nSpy: sinon.SinonSpy;

        /** Arguments of the l10n.t call for the given English message */
        function l10nArgs(message: string): unknown[] | undefined {
            return l10nSpy.getCalls().find(c => c.args[0] === message)?.args.slice(1);
        }

        setup(() => {
            l10nSpy = sinon.spy(vscode.l10n as any, 't');
            planKeepCount = undefined;
            executedPlan = undefined;
            (vscode.window as any).lastInfoMessage = undefined;
            (vscode.window as any).lastWarningMessage = undefined;
            (vscode.window as any).nextMessageSelection = undefined;
            mockCache.getCleanPlan = async (keepCount) => { planKeepCount = keepCount; return plan; };
            mockCache.executeCleanPlan = async (p) => {
                executedPlan = p;
                return { deletedCount: 1, deletedConversationCount: 2, freedBytes: 2048, failedCount: 0 };
            };
            configReader.set('cache.autoCleanKeepCount', 3);
        });

        teardown(() => {
            l10nSpy.restore();
            (vscode.window as any).nextMessageSelection = undefined;
        });

        test('cleanCache asks before deleting and deletes nothing when dismissed', async () => {
            const result = await vm.cleanCache();

            assert.strictEqual(result, null);
            assert.strictEqual(planKeepCount, 3);
            assert.strictEqual(executedPlan, undefined);
            const confirmMessage = 'Permanently delete {0} tasks and {1} conversation files ({2})? The {3} most recently active tasks will be kept.';
            assert.strictEqual((vscode.window as any).lastWarningMessage, confirmMessage);
            assert.deepStrictEqual(l10nArgs(confirmMessage), [1, 2, '2.0 KB', 3]);
            assert.deepStrictEqual((vscode.window as any).lastMessageItems, [{ modal: true }, 'Delete']);
        });

        test('cleanCache executes exactly the confirmed plan and reports the result', async () => {
            (vscode.window as any).nextMessageSelection = 'Delete';
            const result = await vm.cleanCache();

            assert.strictEqual(executedPlan, plan);
            assert.strictEqual(result?.deletedCount, 1);
            const doneMessage = 'Cache cleaned: deleted {0} tasks and {1} conversation files, freed {2}.';
            assert.strictEqual((vscode.window as any).lastInfoMessage, doneMessage);
            assert.deepStrictEqual(l10nArgs(doneMessage), [1, 2, '2.0 KB']);
        });

        test('cleanCache reports failures as a warning', async () => {
            mockCache.executeCleanPlan = async () => ({ deletedCount: 0, deletedConversationCount: 1, freedBytes: 1024, failedCount: 1 });
            (vscode.window as any).nextMessageSelection = 'Delete';
            await vm.cleanCache();

            const failMessage = 'Cache cleaned: deleted {0} tasks and {1} conversation files, freed {2}. {3} items could not be deleted; see the log for details.';
            assert.strictEqual((vscode.window as any).lastWarningMessage, failMessage);
            assert.deepStrictEqual(l10nArgs(failMessage), [0, 1, '1.0 KB', 1]);
        });

        test('cleanCache shows an info message and stops when nothing is to be deleted', async () => {
            mockCache.getCleanPlan = async (keepCount = 5) => ({ keepCount, tasks: [], orphanConversations: [], conversationFileCount: 0, totalBytes: 0 });
            const result = await vm.cleanCache();

            assert.strictEqual(result, null);
            assert.strictEqual((vscode.window as any).lastWarningMessage, undefined);
            assert.ok(((vscode.window as any).lastInfoMessage as string).startsWith('Nothing to clean'));
        });

        test('performAutoClean cleans unattended with the configured keepCount', async () => {
            configReader.set('cache.autoClean', true);
            let cleanKeepCount: number | undefined;
            mockCache.cleanCache = async (keepCount) => {
                cleanKeepCount = keepCount;
                return { deletedCount: 1, deletedConversationCount: 0, freedBytes: 10, failedCount: 0 };
            };

            const result = await vm.performAutoClean();

            assert.strictEqual(cleanKeepCount, 3);
            assert.strictEqual(result?.deletedCount, 1);
            assert.strictEqual((vscode.window as any).lastWarningMessage, undefined);
        });

        test('deleteFile does nothing when the confirmation is dismissed', async () => {
            let deletedPath: string | undefined;
            mockCache.deleteFile = async (p) => { deletedPath = p; };

            await vm.deleteFile('/brain/task-1/notes.md');

            assert.strictEqual(deletedPath, undefined);
            const confirmMessage = 'Are you sure you want to permanently delete {0}?';
            assert.strictEqual((vscode.window as any).lastWarningMessage, confirmMessage);
            assert.deepStrictEqual(l10nArgs(confirmMessage), ['notes.md']);
            assert.deepStrictEqual((vscode.window as any).lastMessageItems, [{ modal: true }, 'Delete']);
        });

        test('deleteFile deletes after confirmation', async () => {
            let deletedPath: string | undefined;
            mockCache.deleteFile = async (p) => { deletedPath = p; };
            (vscode.window as any).nextMessageSelection = 'Delete';

            await vm.deleteFile('/brain/task-1/notes.md');

            assert.strictEqual(deletedPath, '/brain/task-1/notes.md');
        });
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

    test('toggling a tree section should catch a failed tree state write', async () => {
        const rejections: unknown[] = [];
        const onRejection = (reason: unknown) => rejections.push(reason);
        process.on('unhandledRejection', onRejection);
        mockStorage.setLastTreeState = async () => { throw new Error('storage failed'); };
        try {
            vm.toggleTasksSection();
            vm.toggleContextsSection();
            await new Promise(resolve => setImmediate(resolve));
            assert.deepStrictEqual(rejections, []);
        } finally {
            process.off('unhandledRejection', onRejection);
        }
    });

    test('reset refresh timer should catch a failed quota refresh', async () => {
        const clock = sinon.useFakeTimers({ now: Date.now(), toFake: ['setTimeout', 'clearTimeout'] });
        const rejections: unknown[] = [];
        const onRejection = (reason: unknown) => rejections.push(reason);
        process.on('unhandledRejection', onRejection);
        mockQuota.fetchQuota = async () => { throw new Error('fetch failed'); };
        try {
            const internals = vm as unknown as { _resetRefreshTargetMs: number; armResetRefreshTimer(): void };
            internals._resetRefreshTargetMs = Date.now();
            internals.armResetRefreshTimer();
            clock.tick(0);
            clock.restore();
            await new Promise(resolve => setImmediate(resolve));
            assert.deepStrictEqual(rejections, []);
        } finally {
            clock.restore();
            process.off('unhandledRejection', onRejection);
        }
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
        vm.getState().tree.tasks.folders = [{ id: taskId, label: 'Task 1', size: '', lastModified: 0, expanded: false, files: [] }];

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
        vm.getState().tree.contexts.folders = [{ id: contextId, label: 'Ctx 1', size: '', lastModified: 0, expanded: false, files: [] }];

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

    test('low quota notifications should fire only below a threshold', () => {
        // Default thresholds: warning 40, critical 20
        const notify = (remaining: number) => {
            (vscode.window as any).lastInfoMessage = undefined;
            (vscode.window as any).lastWarningMessage = undefined;
            (vm as unknown as { _notificationCooldowns: Map<string, number> })._notificationCooldowns.clear();
            (vm as unknown as { checkQuotaNotifications(group: unknown): void })
                .checkQuotaNotifications({ id: 'gemini', label: 'Gemini', hasData: true, remaining });
        };

        notify(40);
        assert.strictEqual((vscode.window as any).lastInfoMessage, undefined);
        assert.strictEqual((vscode.window as any).lastWarningMessage, undefined);

        notify(20);
        assert.match((vscode.window as any).lastInfoMessage || '', /^Low Quota Warning:/);
        assert.strictEqual((vscode.window as any).lastWarningMessage, undefined);

        notify(19);
        assert.match((vscode.window as any).lastWarningMessage || '', /^CRITICAL Quota:/);
    });

    test('output channel changes should not count as editor activity', () => {
        let listener: ((e: { document: { uri: { scheme: string } } }) => void) | undefined;
        const stub = sinon.stub(vscode.workspace, 'onDidChangeTextDocument').callsFake(l => {
            listener = l as typeof listener;
            return { dispose: () => { } };
        });
        try {
            vm.dispose();
            vm = new AppViewModel(mockQuota, mockCache, mockStorage, configManager, strategyManager, defaultMockAutomationService);
            const internals = vm as unknown as { _lastActivityTs: number };

            internals._lastActivityTs = 0;
            listener?.({ document: { uri: { scheme: 'output' } } });
            assert.strictEqual(internals._lastActivityTs, 0);

            listener?.({ document: { uri: { scheme: 'vscode-remote' } } });
            assert.ok(internals._lastActivityTs > 0);
        } finally {
            stub.restore();
        }
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
            let windowListener: ((e: vscode.WindowState) => void) | undefined;
            const windowStub = sinon.stub(vscode.window, 'onDidChangeWindowState').callsFake(listener => {
                windowListener = listener;
                return { dispose: () => { } };
            });

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
                windowListener?.({ focused: false, active: false });
                global.Date.now = () => start + 22 * 60 * 1000;
                mockQuota.fetchQuota = async () => makeSnapshot(88);
                await vm.refreshQuota();
                assert.match(
                    (vscode.window as any).lastWarningMessage || '',
                    /^Abnormal quota drain:/
                );
            } finally {
                global.Date.now = realNow;
                windowStub.restore();
            }
        });

        test('should not blame idle drain on a drop that happened while focused', async () => {
            const clock = sinon.useFakeTimers({ now: Date.now(), toFake: ['Date'] });
            let windowListener: ((e: vscode.WindowState) => void) | undefined;
            const windowStub = sinon.stub(vscode.window, 'onDidChangeWindowState').callsFake(listener => {
                windowListener = listener;
                return { dispose: () => { } };
            });
            try {
                vm.dispose();
                vm = new AppViewModel(mockQuota, mockCache, mockStorage, configManager, strategyManager, defaultMockAutomationService);
                mockQuota.fetchQuota = async () => makeSnapshot(60);
                await vm.refreshQuota();

                // Focused for 60 minutes, blurred one second before the next poll
                clock.tick(60 * 60 * 1000);
                (vscode.window as any).state.focused = false;
                windowListener?.({ focused: false, active: false });
                clock.tick(1000);
                mockQuota.fetchQuota = async () => makeSnapshot(54);
                await vm.refreshQuota();

                assert.strictEqual((vscode.window as any).lastWarningMessage, undefined);
            } finally {
                windowStub.restore();
                clock.restore();
            }
        });

        test('should warn when quota keeps dropping long after the window lost focus', async () => {
            const clock = sinon.useFakeTimers({ now: Date.now(), toFake: ['Date'] });
            let windowListener: ((e: vscode.WindowState) => void) | undefined;
            const windowStub = sinon.stub(vscode.window, 'onDidChangeWindowState').callsFake(listener => {
                windowListener = listener;
                return { dispose: () => { } };
            });
            try {
                vm.dispose();
                vm = new AppViewModel(mockQuota, mockCache, mockStorage, configManager, strategyManager, defaultMockAutomationService);
                mockQuota.fetchQuota = async () => makeSnapshot(100);
                await vm.refreshQuota();

                clock.tick(60 * 1000);
                (vscode.window as any).state.focused = false;
                windowListener?.({ focused: false, active: false });

                clock.tick(11 * 60 * 1000);
                await vm.refreshQuota();
                clock.tick(11 * 60 * 1000);
                mockQuota.fetchQuota = async () => makeSnapshot(97);
                await vm.refreshQuota();
                assert.strictEqual((vscode.window as any).lastWarningMessage, undefined);

                clock.tick(11 * 60 * 1000);
                mockQuota.fetchQuota = async () => makeSnapshot(94);
                await vm.refreshQuota();
                assert.match(
                    (vscode.window as any).lastWarningMessage || '',
                    /with no editor activity/
                );
            } finally {
                windowStub.restore();
                clock.restore();
            }
        });
    });

    test('getSidebarData should include current and previous seven-day usage totals', () => {
        const queriedGroups: string[] = [];
        const todayStart = new Date(Date.now());
        todayStart.setHours(0, 0, 0, 0);
        const dayStarts = Array.from({ length: 14 }, (_, index) => {
            const date = new Date(todayStart);
            date.setDate(date.getDate() - (13 - index));
            return date.getTime();
        });
        mockStorage.getDailyConsumption = (groupId, days, maxSampleGapMs) => {
            queriedGroups.push(groupId);
            assert.strictEqual(days, 14);
            assert.strictEqual(maxSampleGapMs, 10 * 60 * 1000);
            return dayStarts.map((dayStart, index) => ({
                dayStart,
                usage: index < 7 ? 1 : 2,
                hasData: true
            }));
        };

        const weekly = vm.getSidebarData().weekly;

        assert.deepStrictEqual(queriedGroups, ['gemini', 'non-google']);
        assert.ok(weekly);
        assert.strictEqual(weekly.days.length, 7);
        assert.strictEqual(weekly.days[6].items.length, 2);
        assert.strictEqual(weekly.total, 28);
        assert.strictEqual(weekly.previousTotal, 14);
    });

    test('getSidebarData should align quota pools by local day instead of array index', () => {
        const todayStart = new Date(Date.now());
        todayStart.setHours(0, 0, 0, 0);
        const makeDayStarts = (lastDayOffset: number) => Array.from({ length: 14 }, (_, index) => {
            const date = new Date(todayStart);
            date.setDate(date.getDate() - (13 - index) + lastDayOffset);
            return date.getTime();
        });
        mockStorage.getDailyConsumption = groupId => {
            const dayStarts = makeDayStarts(groupId === 'gemini' ? 0 : -1);
            return dayStarts.map(dayStart => ({ dayStart, usage: 1, hasData: true }));
        };

        const weekly = vm.getSidebarData().weekly;

        assert.ok(weekly);
        assert.strictEqual(weekly.days[6].dayStart, todayStart.getTime());
        // The label date is the host's calendar date, independent of the Webview's time zone
        assert.strictEqual(
            new Date(weekly.days[6].labelDate).toISOString().slice(0, 10),
            `${todayStart.getFullYear()}-${String(todayStart.getMonth() + 1).padStart(2, '0')}-${String(todayStart.getDate()).padStart(2, '0')}`
        );
        assert.deepStrictEqual(weekly.days[6].items.map(item => item.label), ['Gemini']);
        assert.deepStrictEqual(weekly.days[5].items.map(item => item.label), ['Gemini', 'Claude']);
        assert.strictEqual(weekly.total, 13);
        assert.strictEqual(weekly.previousTotal, 14);
    });

    test('restoreFromCache should fire change events when something was restored', () => {
        mockStorage.getLastViewState = <T>() => vm.getState().quota as T;
        const fired: string[] = [];
        const disposables = [
            vm.onQuotaChange(() => fired.push('quota')),
            vm.onCacheChange(() => fired.push('cache')),
            vm.onTreeChange(() => fired.push('tree')),
            vm.onStateChange(() => fired.push('state'))
        ];

        assert.strictEqual(vm.restoreFromCache(), true);
        assert.deepStrictEqual(fired, ['quota', 'cache', 'tree', 'state']);
        disposables.forEach(d => d.dispose());
    });

    test('restoreFromCache should fire no events when nothing was cached', () => {
        let fired = false;
        const disposable = vm.onStateChange(() => { fired = true; });

        assert.strictEqual(vm.restoreFromCache(), false);
        assert.strictEqual(fired, false);
        disposable.dispose();
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
        const gemini = vm.getState().quota.displayItems[0];
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
    suite('Configuration change re-render', () => {
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
        });

        const restoreSnapshot = (remainingPercentage: number) => {
            const cachedQuota = vm.getState().quota;
            const snapshot = makeSnapshot(remainingPercentage);
            mockStorage.getLastViewState = <T>() => cachedQuota as T;
            mockStorage.getLastSnapshot = <T>() => snapshot as T;
            assert.strictEqual(vm.restoreFromCache(), true);
        };

        test('config change keeps a failed connection status and writes nothing', async () => {
            restoreSnapshot(70);
            vm.setConnectionStatus('failed', 'no_process');
            let records = 0;
            let snapshotWrites = 0;
            mockStorage.recordQuotaPoint = async () => { records++; };
            mockStorage.setLastSnapshot = async () => { snapshotWrites++; };
            let quotaEvents = 0;
            const sub = vm.onQuotaChange(() => { quotaEvents++; });

            configReader.set('dashboard.historyRange', 30);
            await vm.onConfigurationChanged();
            sub.dispose();

            assert.strictEqual(vm.getState().connectionStatus, 'failed');
            assert.strictEqual(vm.getState().failureReason, 'no_process');
            assert.strictEqual(records, 0);
            assert.strictEqual(snapshotWrites, 0);
            assert.strictEqual(quotaEvents, 1);
            assert.strictEqual(vm.getState().quota.groups.find(g => g.id === 'gemini')?.remaining, 70);
        });

        test('first live refresh after a config change still checks offline drain', async () => {
            mockStorage.getRecentHistory = () => [{ timestamp: Date.now() - 5 * 60 * 1000, usage: { gemini: 90 } }];
            restoreSnapshot(90);

            configReader.set('dashboard.historyRange', 30);
            await vm.onConfigurationChanged();
            mockQuota.fetchQuota = async () => makeSnapshot(80);
            await vm.refreshQuota();

            assert.match((vscode.window as any).lastWarningMessage || '', /while the IDE was closed/);
        });

        test('a refresh in flight during a config change still applies its value', async () => {
            mockQuota.fetchQuota = async () => makeSnapshot(60);
            await vm.refreshQuota();

            let resolveFetch!: (snapshot: QuotaSnapshot) => void;
            mockQuota.fetchQuota = () => new Promise(resolve => { resolveFetch = resolve; });
            const refresh = vm.refreshQuota();
            configReader.set('dashboard.historyRange', 30);
            await vm.onConfigurationChanged();
            resolveFetch(makeSnapshot(40));

            assert.strictEqual(await refresh, true);
            assert.strictEqual(vm.getState().quota.groups.find(g => g.id === 'gemini')?.remaining, 40);
            assert.strictEqual(vm.getState().connectionStatus, 'connected');
        });

        test('only cache settings trigger a cache rescan', async () => {
            restoreSnapshot(70);
            let scans = 0;
            mockCache.getCacheInfo = async () => {
                scans++;
                return { totalSize: 0, brainSize: 0, conversationsSize: 0, brainTasks: [], codeContexts: [] };
            };

            configReader.set('system.autoAccept', true);
            await vm.onConfigurationChanged();
            configReader.set('dashboard.viewMode', 'models');
            await vm.onConfigurationChanged();
            assert.strictEqual(scans, 0);

            configReader.set('cache.hideEmptyFolders', true);
            await vm.onConfigurationChanged();
            assert.strictEqual(scans, 1);
        });
    });

    test('refreshCache should keep the files of expanded folders', async () => {
        const tasks = [{ id: 'task-1', label: 'Task One', path: '/brain/task-1', size: 100, fileCount: 2, createdAt: 1000 }];
        const contexts = [{ id: 'ctx-1', name: 'Context One', size: 100, lastModified: 1000 }];
        mockCache.getCacheInfo = async () => ({ totalSize: 200, brainSize: 100, conversationsSize: 100, brainTasks: tasks, codeContexts: contexts });
        let taskLoads = 0;
        mockCache.getTaskFiles = async id => {
            taskLoads++;
            return [{ name: 'a.md', path: `/brain/${id}/a.md` }, { name: 'b.md', path: `/brain/${id}/b.md` }];
        };
        mockCache.getContextFiles = async id => [{ name: 'c.ts', path: `/ctx/${id}/c.ts` }];

        await vm.refreshCache();
        await vm.toggleTaskExpansion('task-1');
        await vm.toggleContextExpansion('ctx-1');
        await vm.refreshCache();

        const task = vm.getState().tree.tasks.folders.find(f => f.id === 'task-1');
        const ctx = vm.getState().tree.contexts.folders.find(f => f.id === 'ctx-1');
        assert.strictEqual(task?.expanded, true);
        assert.strictEqual(task?.files.length, 2);
        assert.strictEqual(ctx?.files.length, 1);
        assert.strictEqual(taskLoads, 1, 'cached files are reused');
    });

    test('reset refresh timer should not fire early for a reset beyond the setTimeout limit', async () => {
        const clock = sinon.useFakeTimers({ now: Date.now(), toFake: ['Date', 'setTimeout', 'clearTimeout'] });
        try {
            const dayMs = 24 * 60 * 60 * 1000;
            const resetTime = new Date(Date.now() + 30 * dayMs);
            let fetches = 0;
            mockQuota.fetchQuota = async () => {
                fetches++;
                return {
                    timestamp: new Date(),
                    models: [{
                        modelId: 'MODEL_PLACEHOLDER_M47',
                        label: 'Gemini 3 Flash',
                        remainingPercentage: 50,
                        isExhausted: false,
                        resetTime,
                        timeUntilReset: '30d'
                    }]
                };
            };

            await vm.refreshQuota();
            await clock.tickAsync(5000);
            assert.strictEqual(fetches, 1);

            await clock.tickAsync(30 * dayMs - 15_000);
            assert.strictEqual(fetches, 1, 'no refresh before the reset');

            await clock.tickAsync(60_000);
            assert.strictEqual(fetches, 2, 'one refresh after the reset');
        } finally {
            clock.restore();
        }
    });

    suite('Usage prediction', () => {
        const runPrediction = async (latestReset: number | null) => {
            const now = Date.now();
            configReader.set('dashboard.historyRange', 90);
            mockStorage.getLatestResetTime = groupId => (groupId === 'gemini' ? latestReset : null);
            mockStorage.calculateUsageBuckets = (displayMinutes, bucketMinutes) => {
                const bucketMs = bucketMinutes * 60 * 1000;
                const buckets = [];
                for (let end = now; end > now - displayMinutes * 60 * 1000; end -= bucketMs) {
                    buckets.unshift({
                        startTime: end - bucketMs,
                        endTime: end,
                        items: end === now ? [{ groupId: 'gemini', usage: 5, color: '' }] : []
                    });
                }
                return buckets;
            };
            mockQuota.fetchQuota = async () => ({
                timestamp: new Date(),
                models: [{
                    modelId: 'MODEL_PLACEHOLDER_M47',
                    label: 'Gemini 3 Flash',
                    remainingPercentage: 95,
                    isExhausted: false,
                    resetTime: new Date(now + 4.8 * 60 * 60 * 1000),
                    timeUntilReset: '4h 48m'
                }]
            });
            await vm.refreshQuota();
            return vm.getState().quota.chart.prediction!;
        };

        test('rate after a reset is measured over the time since the reset', async () => {
            const prediction = await runPrediction(Date.now() - 10 * 60 * 1000);
            assert.ok(Math.abs(prediction.usageRate - 30) < 0.5, `usageRate ${prediction.usageRate}`);
            assert.notStrictEqual(prediction.runway, 'Stable');
        });

        test('rate without a reset in the window still uses the whole history range', async () => {
            const prediction = await runPrediction(null);
            assert.ok(Math.abs(prediction.usageRate - 5 / 1.5) < 0.01, `usageRate ${prediction.usageRate}`);
        });
    });
});
