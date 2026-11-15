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

    test('should map model groups to independently configurable quota pools', () => {
        const pools = manager.getQuotaPools();
        assert.deepStrictEqual(pools.map(pool => pool.id), ['gemini', 'argon', 'non-google']);
        assert.strictEqual(manager.getPoolIdForHistoryKey('gemini-flash'), 'gemini');
        assert.strictEqual(manager.getPoolIdForHistoryKey('gemini-pro'), 'gemini');
        assert.strictEqual(manager.getPoolIdForHistoryKey('gemini-argon'), 'argon');
        assert.strictEqual(manager.getPoolIdForHistoryKey('claude'), 'non-google');
        assert.strictEqual(manager.getPoolIdForHistoryKey('gpt'), 'non-google');
    });

    test('should map each quota pool to its weekly summary bucket', () => {
        const buckets = Object.fromEntries(manager.getQuotaPools().map(pool => [pool.id, pool.weeklyBucketId]));
        assert.deepStrictEqual(buckets, { gemini: 'gemini-weekly', argon: 'gemini-argon-wtu-weekly', 'non-google': '3p-weekly' });
    });

    test('should map quota pools to their 5-hour summary bucket', () => {
        const buckets = Object.fromEntries(manager.getQuotaPools().map(pool => [pool.id, pool.fiveHourBucketId]));
        assert.deepStrictEqual(buckets, {
            gemini: 'gemini-5h',
            argon: undefined,
            'non-google': '3p-5h'
        });
    });

    test('should route Gemini 4 Argon to its own pool despite the broader gemini prefix', () => {
        const cases: [string, string][] = [
            ['MODEL_PLACEHOLDER_M417', 'Gemini 4 Argon (High)'],
            ['MODEL_PLACEHOLDER_M418', 'Gemini 4 Argon (Medium)'],
            ['MODEL_PLACEHOLDER_M419', 'Gemini 4 Argon (Low)'],
            ['MODEL_PLACEHOLDER_M999', 'Gemini 4 Argon (Max)'],
            ['gemini-4-argon-max', 'Unlisted']
        ];
        for (const [id, label] of cases) {
            assert.strictEqual(manager.getGroupForModel(id, label).quotaPoolId, 'argon', `${id} / ${label}`);
        }
    });

    test('should allow shared pools to be split through strategy data only', () => {
        const groups = manager.getGroups().map(group => ({
            ...group,
            quotaPoolId: group.id
        }));
        const splitManager = new QuotaStrategyManager({
            groups,
            quotaPools: groups.map(group => ({
                id: group.id,
                label: group.label,
                shortLabel: group.shortLabel,
                themeColor: group.themeColor
            }))
        });

        assert.strictEqual(splitManager.getPoolIdForHistoryKey('gemini-flash'), 'gemini-flash');
        assert.strictEqual(splitManager.getPoolIdForHistoryKey('gemini-pro'), 'gemini-pro');
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

    test('should return the other group for unknown models', () => {
        const group = manager.getGroupForModel('completely-unknown-model');
        assert.ok(group, 'Should return a fallback group');
        assert.strictEqual(group.id, 'other');
        assert.strictEqual(group.quotaPoolId, 'non-google');
    });

    test('should classify an unknown non-Google model as other, not Gemini', () => {
        const group = manager.getGroupForModel('MODEL_PLACEHOLDER_M300', 'Kimi K2');
        assert.strictEqual(group.id, 'other');
        assert.strictEqual(group.quotaPoolId, 'non-google');
    });

    test('should resolve every server-ID modelName without a label', () => {
        for (const group of manager.getGroups()) {
            for (const model of group.models) {
                for (const label of [undefined, '']) {
                    assert.strictEqual(manager.getModelDefinition(model.modelName, label), model,
                        `${model.modelName} with label ${JSON.stringify(label)}`);
                    assert.strictEqual(manager.getModelDefinition(model.modelName.toLowerCase(), label), model,
                        `${model.modelName} lowercased with label ${JSON.stringify(label)}`);
                    assert.strictEqual(manager.getGroupForModel(model.modelName, label).id, group.id,
                        `${model.modelName} group with label ${JSON.stringify(label)}`);
                }
            }
        }
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
        const def = manager.getModelDefinition('MODEL_CLAUDE_4_6_SONNET_THINKING');
        assert.ok(def, 'Should find model by normalized id');
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

    test('should not route numeric-suffixed IDs to a prefix-sharing model (M264 vs M26)', () => {
        // IDE 2.1.1 introduced Gemini 3.6 Flash as MODEL_PLACEHOLDER_M264/M265/M266,
        // which share the prefix of Claude Opus's MODEL_PLACEHOLDER_M26.
        const rows: Array<[string, string]> = [
            ['MODEL_PLACEHOLDER_M264', 'Gemini 3.6 Flash (High)'],
            ['MODEL_PLACEHOLDER_M265', 'Gemini 3.6 Flash (Medium)'],
            ['MODEL_PLACEHOLDER_M266', 'Gemini 3.6 Flash (Low)'],
        ];
        for (const [id, label] of rows) {
            const group = manager.getGroupForModel(id, label);
            assert.strictEqual(group.quotaPoolId, 'gemini', `${label} must stay in the gemini pool`);
            assert.strictEqual(
                manager.getModelDisplayName(id, label),
                undefined,
                `${label} must not borrow a Claude display name`
            );
        }

        // The real Opus row still resolves through the exact ID match
        const opus = manager.getGroupForModel('MODEL_PLACEHOLDER_M26', 'Claude Opus 4.6 (Thinking)');
        assert.strictEqual(opus.id, 'claude');
        assert.strictEqual(
            manager.getModelDisplayName('MODEL_PLACEHOLDER_M26', 'Claude Opus 4.6 (Thinking)'),
            'Claude Opus 4.6 (Thinking)'
        );
    });

    test('should match modelName inside labels only on token boundaries', () => {
        const def = manager.getModelDefinition('unknown-id', 'xMODEL_PLACEHOLDER_M35x');
        assert.strictEqual(def, undefined, 'Embedded (non-token) occurrences must not match');

        const def2 = manager.getModelDefinition('unknown-id', 'label with MODEL_PLACEHOLDER_M35 inside');
        assert.strictEqual(def2?.id, 'claude-4-6-sonnet-thinking', 'Token-bounded occurrences still match');
    });

    test('should handle empty or null labels gracefully', () => {
        const group1 = manager.getGroupForModel('gemini-test', '');
        assert.strictEqual(group1.id, 'gemini-pro');

        const group2 = manager.getGroupForModel('claude-test', undefined);
        assert.strictEqual(group2.id, 'claude');
    });

    test('should route Gemini 4 Hydrogen to the gemini pool and resolve display names', () => {
        const cases: [string, string][] = [
            ['MODEL_PLACEHOLDER_M525', 'Gemini 4 Hydrogen (High)'],
            ['MODEL_PLACEHOLDER_M526', 'Gemini 4 Hydrogen (Medium)'],
            ['MODEL_PLACEHOLDER_M527', 'Gemini 4 Hydrogen (Low)'],
            ['MODEL_PLACEHOLDER_M528', 'Gemini 4 Hydrogen (XHigh)'],
        ];
        for (const [id, expectedName] of cases) {
            const group = manager.getGroupForModel(id);
            assert.strictEqual(group.id, 'gemini-hydrogen', `${id} group`);
            assert.strictEqual(group.quotaPoolId, 'gemini', `${id} pool`);
            assert.strictEqual(manager.getModelDisplayName(id), expectedName, `${id} displayName`);
        }
    });

    test('should route Orchestrator (Argon) to gemini-argon and the argon pool', () => {
        const group = manager.getGroupForModel('MODEL_PLACEHOLDER_M668');
        assert.strictEqual(group.id, 'gemini-argon');
        assert.strictEqual(group.quotaPoolId, 'argon');
        assert.strictEqual(manager.getModelDisplayName('MODEL_PLACEHOLDER_M668'), 'Orchestrator (Argon)');
    });

    test('should route Gemini 3.8 Flash and Claude 5.5 models to their respective pools', () => {
        const flashGroup = manager.getGroupForModel('MODEL_PLACEHOLDER_M318');
        assert.strictEqual(flashGroup.id, 'gemini-flash');
        assert.strictEqual(flashGroup.quotaPoolId, 'gemini');
        assert.strictEqual(manager.getModelDisplayName('MODEL_PLACEHOLDER_M319'), 'Gemini 3.8 Flash (Medium)');

        const opusGroup = manager.getGroupForModel('MODEL_PLACEHOLDER_M402');
        assert.strictEqual(opusGroup.id, 'claude');
        assert.strictEqual(opusGroup.quotaPoolId, 'non-google');
        assert.strictEqual(manager.getModelDisplayName('MODEL_PLACEHOLDER_M400'), 'Claude Opus 5.5 (Low)');
        assert.strictEqual(manager.getModelDisplayName('MODEL_PLACEHOLDER_M405'), 'Claude Sonnet 5.5 (High)');
    });
});
