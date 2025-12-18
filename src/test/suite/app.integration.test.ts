import * as assert from 'assert';
import { AppViewModel } from '../../view-model/app.vm';
import { StorageService } from '../../model/services/storage.service';
import { ConfigManager } from '../../shared/config/config_manager';
import { QuotaStrategyManager } from '../../model/strategy';
import type { IQuotaService, ICacheService } from '../../model/services/interfaces';
import type { QuotaViewState, TreeViewState } from '../../view-model/types';
import type { CachedTreeState } from '../../model/types/entities';

// Mock Config Reader
class MockConfigReader {
    get<T>(key: string, defaultValue: T): T { return defaultValue; }
    set(key: string, value: any) { }
}

// Mock Dependencies
const mockQuotaService: IQuotaService = {
    fetchQuota: async () => null,
    onUpdate: () => { },
    onError: () => { }
};

const mockCacheService: ICacheService = {
    getCacheInfo: async () => ({
        totalSize: 0,
        brainSize: 0,
        conversationsSize: 0,
        brainCount: 0,
        conversationsCount: 0,
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
    cleanCache: async () => 0
};

// Mock Memento
class MockMemento {
    private storage = new Map<string, any>();
    get<T>(key: string, defaultValue?: any) {
        return this.storage.has(key) ? this.storage.get(key) : defaultValue;
    }
    update(key: string, value: any): Thenable<void> {
        this.storage.set(key, value);
        return Promise.resolve();
    }
    set(key: string, value: any) { this.storage.set(key, value); }
    keys(): readonly string[] { return Array.from(this.storage.keys()); }
}

suite('App Initialization & Cache Integration Test', () => {
    let memento: MockMemento;
    let storageService: StorageService;
    let configManager: ConfigManager;
    let strategyManager: QuotaStrategyManager;
    let viewModel: AppViewModel;

    setup(() => {
        memento = new MockMemento();
        storageService = new StorageService(memento as any);
        configManager = new ConfigManager(new MockConfigReader() as any);
        strategyManager = new QuotaStrategyManager();
    });

    teardown(() => {
        if (viewModel) viewModel.dispose();
    });

    function createViewModel() {
        return new AppViewModel(
            mockQuotaService,
            mockCacheService,
            storageService,
            configManager,
            strategyManager
        );
    }

    test('should restore cached quota state', async () => {
        const cachedState: QuotaViewState = {
            groups: [
                { id: 'gemini', label: 'Gemini', remaining: 75.5, resetTime: '2h', themeColor: '#4285F4', hasData: true },
                { id: 'claude', label: 'Claude', remaining: 45.2, resetTime: '3h', themeColor: '#D97706', hasData: true }
            ],
            activeGroupId: 'claude',
            chart: { buckets: [], maxUsage: 1, groupColors: {} },
            displayItems: []
        };
        await storageService.setLastViewState(cachedState);

        viewModel = createViewModel();
        const success = viewModel.restoreFromCache();

        assert.ok(success, 'Should report success restoring from cache');

        const state = viewModel.getState();
        assert.strictEqual(state.quota.activeGroupId, 'claude');

        const claude = state.quota.groups.find(g => g.id === 'claude');
        assert.strictEqual(claude?.remaining, 45.2);
        assert.strictEqual(claude?.hasData, true);
    });

    test('should restore cached tree state', async () => {
        const cachedTree: CachedTreeState = {
            brainTasks: [
                { id: 't1', title: 'Task 1', size: '1MB', lastModified: 0 }
            ],
            codeContexts: [],
            lastUpdated: Date.now()
        };
        await storageService.setLastTreeState(cachedTree);

        viewModel = createViewModel();
        const success = viewModel.restoreFromCache();

        assert.ok(success, 'Should report success restoring tree from cache');

        const state = viewModel.getState();
        assert.strictEqual(state.tree.tasks.folders.length, 1);
        assert.strictEqual(state.tree.tasks.folders[0].label, 'Task 1');
    });

    test('should handle missing cache gracefully', () => {
        viewModel = createViewModel();
        const success = viewModel.restoreFromCache();

        assert.strictEqual(success, false, 'Should report failure when no cache');

        const state = viewModel.getState();
        // Default state usually has groups without data
        assert.ok(state.quota.groups.every(g => !g.hasData));
    });
});
