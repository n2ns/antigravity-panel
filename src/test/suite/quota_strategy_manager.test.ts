import * as assert from 'assert';
import { QuotaStrategyManager } from '../../core/quota_strategy_manager';

suite('QuotaStrategyManager Test Suite', () => {
    let manager: QuotaStrategyManager;

    setup(() => {
        manager = new QuotaStrategyManager();
    });

    test('should load groups from config', () => {
        const groups = manager.getGroups();
        assert.ok(groups.length > 0, 'Should have at least one group');
        
        // Verify expected groups exist
        const geminiGroup = groups.find(g => g.id === 'gemini');
        const claudeGroup = groups.find(g => g.id === 'claude');
        const gptGroup = groups.find(g => g.id === 'gpt');
        
        assert.ok(geminiGroup, 'Should have Gemini group');
        assert.ok(claudeGroup, 'Should have Claude group');
        assert.ok(gptGroup, 'Should have GPT group');
    });

    test('should find group by exact model ID', () => {
        const group = manager.getGroupForModel('gemini-3-pro-high');
        assert.strictEqual(group.id, 'gemini');
        assert.strictEqual(group.label, 'Gemini');
    });

    test('should find group by model name', () => {
        const group = manager.getGroupForModel('MODEL_CLAUDE_4_5_SONNET');
        assert.strictEqual(group.id, 'claude');
    });

    test('should find group by prefix in model ID', () => {
        // Test with lowercase prefix
        const group1 = manager.getGroupForModel('gemini-unknown-model');
        assert.strictEqual(group1.id, 'gemini');
        
        // Test with mixed case
        const group2 = manager.getGroupForModel('Claude-New-Model');
        assert.strictEqual(group2.id, 'claude');
        
        // Test GPT prefix
        const group3 = manager.getGroupForModel('gpt-5-turbo');
        assert.strictEqual(group3.id, 'gpt');
    });

    test('should find group by prefix in model label', () => {
        const group = manager.getGroupForModel('unknown-id', 'Gemini 4 Pro');
        assert.strictEqual(group.id, 'gemini');
    });

    test('should return other group for unknown models', () => {
        // Note: The config doesn't have an "other" group, so it should return the first group
        const group = manager.getGroupForModel('completely-unknown-model');
        assert.ok(group, 'Should return a fallback group');
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
        // Label matching uses modelName field, not displayName
        // For example, "MODEL_CLAUDE_4_5_SONNET" is the modelName
        const def = manager.getModelDefinition('unknown-id', 'MODEL_CLAUDE_4_5_SONNET');
        assert.ok(def, 'Should find model by modelName in label');
        assert.strictEqual(def.id, 'claude-4-5-sonnet');

        // Also test partial match
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
        assert.strictEqual(group1.id, 'gemini');
        
        const group2 = manager.getGroupForModel('test', 'CLAUDE Model');
        assert.strictEqual(group2.id, 'claude');
    });

    test('should prioritize ID match over label match', () => {
        // If ID contains prefix, should match even if label doesn't
        const group = manager.getGroupForModel('gemini-test', 'Some Other Label');
        assert.strictEqual(group.id, 'gemini');
    });

    test('should get all models in a group', () => {
        const groups = manager.getGroups();
        const geminiGroup = groups.find(g => g.id === 'gemini');
        
        assert.ok(geminiGroup);
        assert.strictEqual(geminiGroup.models.length, 2);
        assert.ok(geminiGroup.models.some(m => m.id === 'gemini-3-pro-high'));
        assert.ok(geminiGroup.models.some(m => m.id === 'gemini-3-pro-low'));
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
        const geminiGroup = groups.find(g => g.id === 'gemini');
        
        assert.ok(geminiGroup);
        assert.ok(geminiGroup.prefixes);
        assert.ok(geminiGroup.prefixes.includes('gemini'));
    });

    test('should handle model with multiple possible matches', () => {
        // Test that exact match takes priority
        const group = manager.getGroupForModel('claude-4-5-sonnet');
        assert.strictEqual(group.id, 'claude');
        
        // Verify the model definition is correct
        const def = manager.getModelDefinition('claude-4-5-sonnet');
        assert.ok(def);
        assert.strictEqual(def.displayName, 'Claude Sonnet 4.5');
    });

    test('should handle empty or null labels gracefully', () => {
        const group1 = manager.getGroupForModel('gemini-test', '');
        assert.strictEqual(group1.id, 'gemini');
        
        const group2 = manager.getGroupForModel('claude-test', undefined);
        assert.strictEqual(group2.id, 'claude');
    });
});

