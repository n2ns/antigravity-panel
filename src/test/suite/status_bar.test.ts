
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

    const mockStatusBarData: StatusBarData = {
        primary: mockGroupItem,
        allGroups: [mockGroupItem]
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

    setup(() => {
        // Mock StatusBarItem
        mockStatusBarItem = {
            text: '',
            tooltip: '',
            show: () => { },
            hide: () => { },
            dispose: () => { },
            backgroundColor: undefined
        };

        // Mock vscode.MarkdownString
        (vscode as any).MarkdownString = class MockMarkdownString {
            value: string = '';
            isTrusted = true;
            supportHtml = true;
            constructor(value?: string) {
                this.value = value || '';
            }
            appendMarkdown(value: string) {
                this.value += value;
                return this;
            }
        };

        // Stub vscode.window.createStatusBarItem
        const createStub = (vscode.window.createStatusBarItem as unknown) = () => mockStatusBarItem;

        // Mock ViewModel
        mockViewModel = {
            onStateChange: () => ({ dispose: () => { } }),
            onQuotaChange: () => ({ dispose: () => { } }),
            onCacheChange: () => ({ dispose: () => { } }),
            getState: () => ({
                cache: mockCacheState
            }),
            getStatusBarData: () => mockStatusBarData
        };

        // Mock ConfigManager
        mockConfigManager = {
            getConfig: () => ({
                "status.showQuota": true,
                "status.showCache": false,
                "status.warningThreshold": 30,
                "status.criticalThreshold": 10
            })
        };

        statusBarManager = new StatusBarManager(
            mockViewModel as AppViewModel,
            mockConfigManager as ConfigManager
        );

        // Inject mock item directly if construction created a different one (not needed if stub works, but for safety)
        (statusBarManager as any).item = mockStatusBarItem;
    });

    teardown(() => {
        statusBarManager.dispose();
    });

    test('should format status bar text in combined format', () => {
        statusBarManager.update();
        // Combined format: always shows shortLabel + percentage + resetTime
        assert.ok(mockStatusBarItem.text.includes('Fls 75% 2h 30m'), `Expected "Fls 75% 2h 30m", got "${mockStatusBarItem.text}"`);
    });
});
