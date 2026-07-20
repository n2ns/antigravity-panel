import * as assert from 'assert';
import * as vscode from 'vscode';
import { StatusBarManager } from '../../view/status-bar';
import { AppViewModel } from '../../view-model/app.vm';
import { ConfigManager } from '../../shared/config/config_manager';
import { StatusBarData, StatusBarGroupItem } from '../../view-model/types';

suite('StatusBarManager Test Suite', () => {
    let statusBarManager: StatusBarManager;
    let mockViewModel: any;
    let mockConfigManager: any;
    let mockStatusBarItem: any;
    let isShown: boolean;
    let isHidden: boolean;

    const mockGroupItem: StatusBarGroupItem = {
        id: 'gemini',
        label: 'Gemini',
        shortLabel: 'Fls',
        percentage: 75,
        resetTime: '2h 30m',
        color: '#ff0000',
        usageRate: 10,
        runway: '5h'
    };

    const mockGptGroupItem: StatusBarGroupItem = {
        id: 'gpt',
        label: 'GPT',
        shortLabel: 'Gpt',
        percentage: 50,
        resetTime: '1h',
        color: '#00ff00',
        usageRate: 5,
        runway: '2h'
    };

    const mockStatusBarData: StatusBarData = {
        primary: mockGroupItem,
        allGroups: [mockGroupItem, mockGptGroupItem]
    };

    const mockCacheState = {
        totalSize: 1024 * 1024 * 10, // 10MB
        brainSize: 0,
        conversationsSize: 0,
        brainCount: 0,
        formattedTotal: '10 MB',
        formattedBrain: '0 B',
        formattedConversations: '0 B'
    };

    const mockTokenUsageState = {
        userCredits: [
            {
                creditType: 'GOOGLE_ONE_AI',
                creditAmount: '998',
                minimumCreditAmountForUsage: '50'
            }
        ]
    };

    setup(() => {
        isShown = false;
        isHidden = false;

        // Mock StatusBarItem
        mockStatusBarItem = {
            text: '',
            tooltip: '',
            show: () => { isShown = true; },
            hide: () => { isHidden = true; },
            dispose: () => { },
            backgroundColor: undefined
        };

        // Mock vscode.MarkdownString
        (vscode as any).MarkdownString = class MockMarkdownString {
            value: string = '';
            isTrusted = true;
            supportHtml = true;
            supportThemeIcons = false;
            constructor(value?: string) {
                this.value = value || '';
            }
            appendMarkdown(value: string) {
                this.value += value;
                return this;
            }
        };

        // Stub vscode.window.createStatusBarItem
        (vscode.window.createStatusBarItem as unknown) = () => mockStatusBarItem;

        // Mock ViewModel
        mockViewModel = {
            onStateChange: () => ({ dispose: () => { } }),
            onQuotaChange: () => ({ dispose: () => { } }),
            onCacheChange: () => ({ dispose: () => { } }),
            getState: () => ({
                cache: mockCacheState,
                tokenUsage: mockTokenUsageState
            }),
            getStatusBarData: () => mockStatusBarData
        };

        // Mock ConfigManager
        mockConfigManager = {
            getConfig: () => ({
                "status.showQuota": true,
                "status.showCache": false,
                "status.scope": "primary",
                "status.warningThreshold": 30,
                "status.criticalThreshold": 10,
                "dashboard.includeSecondaryModels": false
            })
        };

        statusBarManager = new StatusBarManager(
            mockViewModel as AppViewModel,
            mockConfigManager as ConfigManager
        );

        // Inject mock item directly
        (statusBarManager as any).item = mockStatusBarItem;
    });

    teardown(() => {
        statusBarManager.dispose();
    });

    test('should show loading state', () => {
        statusBarManager.showLoading();
        assert.strictEqual(mockStatusBarItem.text, '$(sync~spin) TFA');
        assert.strictEqual(mockStatusBarItem.tooltip, 'Antigravity Panel: Detecting...');
        assert.strictEqual(isShown, true);
    });

    test('should show error state', () => {
        statusBarManager.showError('Connection failed');
        assert.strictEqual(mockStatusBarItem.text, '$(warning) TFA');
        assert.strictEqual(mockStatusBarItem.tooltip, 'Antigravity Panel: Connection failed');
        assert.strictEqual(isShown, true);
    });

    test('should hide when both showQuota and showCache are disabled', () => {
        mockConfigManager.getConfig = () => ({
            "status.showQuota": false,
            "status.showCache": false
        });
        statusBarManager.update();
        assert.strictEqual(isHidden, true);
    });

    test('should format status bar text in primary mode', () => {
        statusBarManager.update();
        assert.ok(mockStatusBarItem.text.includes('🟢 Fls 75% 2h 30m'));
    });

    test('should show all model groups when scope is all', () => {
        mockConfigManager.getConfig = () => ({
            "status.showQuota": true,
            "status.showCache": false,
            "status.scope": "all",
            "status.warningThreshold": 30,
            "status.criticalThreshold": 10,
            "dashboard.includeSecondaryModels": true
        });
        statusBarManager.update();
        // Should contain primary group and secondary group
        assert.ok(mockStatusBarItem.text.includes('Fls 75% 2h 30m'));
        assert.ok(mockStatusBarItem.text.includes('Gpt 50% 1h'));
    });

    test('should show cache size when showCache is enabled', () => {
        mockConfigManager.getConfig = () => ({
            "status.showQuota": false,
            "status.showCache": true,
            "status.warningThreshold": 30,
            "status.criticalThreshold": 10
        });
        statusBarManager.update();
        assert.ok(mockStatusBarItem.text.includes('💿 10.0 MB'));
    });

    test('should show warning yellow indicator when below warning threshold', () => {
        mockGroupItem.percentage = 25; // warningThreshold is 30, criticalThreshold is 10
        statusBarManager.update();
        assert.ok(mockStatusBarItem.text.includes('🟡 Fls 25% 2h 30m'));
    });

    test('should show critical red indicator when below critical threshold', () => {
        mockGroupItem.percentage = 5; // warningThreshold is 30, criticalThreshold is 10
        statusBarManager.update();
        assert.ok(mockStatusBarItem.text.includes('🔴 Fls 5% 2h 30m'));
    });

    test('should show credits when tokenUsage userCredits are available', () => {
        mockConfigManager.getConfig = () => ({
            "status.showQuota": true,
            "status.showCache": false,
            "status.scope": "primary",
            "status.warningThreshold": 30,
            "status.criticalThreshold": 10,
            "dashboard.includeSecondaryModels": false
        });
        statusBarManager.update();
        assert.ok(mockStatusBarItem.text.includes('$(credit-card) 998'));
        assert.ok(mockStatusBarItem.tooltip.value.includes('$(credit-card) Google One AI'));
        assert.strictEqual(mockStatusBarItem.tooltip.supportThemeIcons, true);
    });
});
