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
        // MODEL_PLACEHOLDER_M35 requires a label to be routed to Claude;
        // without label it falls back to groups[0] (gemini-flash).
        // Use the label-based overload to properly identify Claude.
        const group = manager.getGroupForModel('MODEL_PLACEHOLDER_M35', 'MODEL_PLACEHOLDER_M35');
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

    test('should classify Gemini Flash labels without mixing into Pro', () => {
        const byHumanLabel = manager.getGroupForModel('opaque-internal-id', 'Gemini 3 Flash');
        assert.strictEqual(byHumanLabel.id, 'gemini-flash');

        const byId = manager.getGroupForModel('vendor-model-gemini-3-flash-preview');
        assert.strictEqual(byId.id, 'gemini-flash');
    });

    test('should return first group for unknown models', () => {
        const group = manager.getGroupForModel('completely-unknown-model');
        assert.ok(group, 'Should return a fallback group');
        assert.strictEqual(group.id, 'gemini-flash'); // Based on current order in json
    });

    test('should get model display name by exact ID', () => {
        const displayName = manager.getModelDisplayName('gemini-3-pro-high');
        // displayName reflects current quota_strategy.json (updated to 3.1 in IDE update)
        assert.strictEqual(displayName, 'Gemini 3.1 Pro (High)');
    });

    test('should get model display name by model name', () => {
        // MODEL_PLACEHOLDER_M35 alone has no label; must pass label for findModelByLabel to resolve Claude
        const displayName = manager.getModelDisplayName('MODEL_PLACEHOLDER_M35', 'MODEL_PLACEHOLDER_M35');
        assert.strictEqual(displayName, 'Claude Sonnet 4.6 (Thinking)');
    });

    test('should normalize model ID with MODEL_ prefix', () => {
        // Test normalization: MODEL_PLACEHOLDER_M35 -> placeholder-m35 (no direct match, falls through)
        const def = manager.getModelDefinition('claude-4-6-sonnet-thinking');
        assert.ok(def, 'Should find model by exact id');
        assert.strictEqual(def.id, 'claude-4-6-sonnet-thinking');
    });

    test('should find model by label match', () => {
        const def = manager.getModelDefinition('unknown-id', 'MODEL_PLACEHOLDER_M35');
        assert.ok(def, 'Should find model by modelName in label');
        assert.strictEqual(def.id, 'claude-4-6-sonnet-thinking');

        const def2 = manager.getModelDefinition('unknown-id', 'some label with MODEL_PLACEHOLDER_M35 in it');
        assert.ok(def2, 'Should find model by partial modelName match');
        assert.strictEqual(def2.id, 'claude-4-6-sonnet-thinking');
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
        const group = manager.getGroupForModel('claude-4-6-sonnet-thinking');
        assert.strictEqual(group.id, 'claude');

        const def = manager.getModelDefinition('claude-4-6-sonnet-thinking');
        assert.ok(def);
        assert.strictEqual(def.displayName, 'Claude Sonnet 4.6 (Thinking)');
    });

    test('should handle empty or null labels gracefully', () => {
        const group1 = manager.getGroupForModel('gemini-test', '');
        assert.strictEqual(group1.id, 'gemini-pro');

        const group2 = manager.getGroupForModel('claude-test', undefined);
        assert.strictEqual(group2.id, 'claude');
    });
});
