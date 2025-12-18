import * as assert from 'assert';
import { QuotaStrategyManager } from '../../model/strategy';

suite('QuotaStrategyManager Test Suite', () => {
    let manager: QuotaStrategyManager;

    setup(() => {
        manager = new QuotaStrategyManager();
    });

    test('should load groups from config', () => {
        const groups = manager.getGroups();
        assert.ok(groups.length > 0, 'Should have at least one group');

        // Verify expected groups exist
        const geminiProGroup = groups.find(g => g.id === 'gemini-pro');
        const geminiFlashGroup = groups.find(g => g.id === 'gemini-flash');
        const claudeGroup = groups.find(g => g.id === 'claude');
        const gptGroup = groups.find(g => g.id === 'gpt');

        assert.ok(geminiProGroup, 'Should have Gemini Pro group');
        assert.ok(geminiFlashGroup, 'Should have Gemini Flash group');
        assert.ok(claudeGroup, 'Should have Claude group');
        assert.ok(gptGroup, 'Should have GPT group');
    });

    test('should find group by exact model ID', () => {
        const group = manager.getGroupForModel('gemini-3-pro-high');
        assert.strictEqual(group.id, 'gemini-pro');
        assert.strictEqual(group.label, 'Gemini Pro');
    });

    test('should find group by model name', () => {
        const group = manager.getGroupForModel('MODEL_CLAUDE_4_5_SONNET');
        assert.strictEqual(group.id, 'claude');
    });

    test('should find group by prefix in model ID', () => {
        // Test with lowercase prefix
        const group1 = manager.getGroupForModel('gemini-unknown-model');
        assert.strictEqual(group1.id, 'gemini-pro');

        const groupFlash = manager.getGroupForModel('gemini-3-flash-model');
        assert.strictEqual(groupFlash.id, 'gemini-flash');

        // Test with mixed case
        const group2 = manager.getGroupForModel('Claude-New-Model');
        assert.strictEqual(group2.id, 'claude');

        // Test GPT prefix
        const group3 = manager.getGroupForModel('gpt-5-turbo');
        assert.strictEqual(group3.id, 'gpt');
    });

    test('should find group by prefix in model label', () => {
        const group = manager.getGroupForModel('unknown-id', 'Gemini 4 Pro');
        assert.strictEqual(group.id, 'gemini-pro');
    });

    test('should return first group for unknown models', () => {
        const group = manager.getGroupForModel('completely-unknown-model');
        assert.ok(group, 'Should return a fallback group');
        assert.strictEqual(group.id, 'gemini-flash'); // Based on current order in json
    });

    test('should get model display name by exact ID', () => {
        const displayName = manager.getModelDisplayName('gemini-3-pro-high');
        assert.strictEqual(displayName, 'Gemini 3 Pro (High)');
    });

    test('should get model display name by model name', () => {
        const displayName = manager.getModelDisplayName('MODEL_CLAUDE_4_5_SONNET');
        assert.strictEqual(displayName, 'Claude Sonnet 4.5');
    });

    test('should normalize model ID with MODEL_ prefix', () => {
        // Test normalization: MODEL_CLAUDE_4_5_SONNET -> claude-4-5-sonnet
        const def = manager.getModelDefinition('MODEL_CLAUDE_4_5_SONNET');
        assert.ok(def, 'Should find model after normalization');
        assert.strictEqual(def.id, 'claude-4-5-sonnet');
    });

    test('should find model by label match', () => {
        const def = manager.getModelDefinition('unknown-id', 'MODEL_CLAUDE_4_5_SONNET');
        assert.ok(def, 'Should find model by modelName in label');
        assert.strictEqual(def.id, 'claude-4-5-sonnet');

        const def2 = manager.getModelDefinition('unknown-id', 'some label with MODEL_CLAUDE_4_5_SONNET in it');
        assert.ok(def2, 'Should find model by partial modelName match');
        assert.strictEqual(def2.id, 'claude-4-5-sonnet');
    });

    test('should return undefined for completely unknown model', () => {
        const displayName = manager.getModelDisplayName('totally-unknown-model-xyz');
        assert.strictEqual(displayName, undefined);
    });

    test('should handle case-insensitive prefix matching', () => {
        const group1 = manager.getGroupForModel('GEMINI-TEST');
        assert.strictEqual(group1.id, 'gemini-pro');

        const group2 = manager.getGroupForModel('test', 'CLAUDE Model');
        assert.strictEqual(group2.id, 'claude');
    });

    test('should prioritize ID match over label match', () => {
        const group = manager.getGroupForModel('gemini-test', 'Some Other Label');
        assert.strictEqual(group.id, 'gemini-pro');
    });

    test('should get all models in a group', () => {
        const groups = manager.getGroups();
        const geminiProGroup = groups.find(g => g.id === 'gemini-pro');

        assert.ok(geminiProGroup);
        assert.strictEqual(geminiProGroup.models.length, 2);
        assert.ok(geminiProGroup.models.some(m => m.id === 'gemini-3-pro-high'));
        assert.ok(geminiProGroup.models.some(m => m.id === 'gemini-3-pro-low'));
    });

    test('should have theme colors for all groups', () => {
        const groups = manager.getGroups();

        for (const group of groups) {
            assert.ok(group.themeColor, `Group ${group.id} should have a theme color`);
            assert.ok(group.themeColor.startsWith('#'), `Theme color should be a hex color`);
        }
    });

    test('should have prefixes for matching', () => {
        const groups = manager.getGroups();
        const geminiProGroup = groups.find(g => g.id === 'gemini-pro');

        assert.ok(geminiProGroup);
        assert.ok(geminiProGroup.prefixes);
        assert.ok(geminiProGroup.prefixes.includes('gemini'));
    });

    test('should handle model with multiple possible matches', () => {
        const group = manager.getGroupForModel('claude-4-5-sonnet');
        assert.strictEqual(group.id, 'claude');

        const def = manager.getModelDefinition('claude-4-5-sonnet');
        assert.ok(def);
        assert.strictEqual(def.displayName, 'Claude Sonnet 4.5');
    });

    test('should handle empty or null labels gracefully', () => {
        const group1 = manager.getGroupForModel('gemini-test', '');
        assert.strictEqual(group1.id, 'gemini-pro');

        const group2 = manager.getGroupForModel('claude-test', undefined);
        assert.strictEqual(group2.id, 'claude');
    });
});
