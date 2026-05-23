import * as assert from 'assert';
import * as os from 'os';
import * as path from 'path';
import {
    getGeminiRootDir,
    getGeminiBaseDir,
    getGlobalRulesPath,
    getBrainDir,
    getConversationsDir,
    getMcpConfigPath,
    getBrowserAllowlistPath,
    getCodeTrackerActiveDir
} from '../../shared/utils/paths';

suite('Paths Utils Test Suite', () => {
    const homeDir = os.homedir();

    test('getGeminiRootDir should return ~/.gemini', () => {
        const result = getGeminiRootDir();
        const expected = path.join(homeDir, '.gemini');
        assert.strictEqual(result, expected);
    });

    test('getGeminiBaseDir should return ~/.gemini/antigravity-ide', () => {
        const result = getGeminiBaseDir();
        const expected = path.join(homeDir, '.gemini', 'antigravity-ide');
        assert.strictEqual(result, expected);
    });

    test('getGlobalRulesPath should return ~/.gemini/GEMINI.md', () => {
        const result = getGlobalRulesPath();
        const expected = path.join(homeDir, '.gemini', 'GEMINI.md');
        assert.strictEqual(result, expected);
    });

    test('getBrainDir should return ~/.gemini/antigravity-ide/brain', () => {
        const result = getBrainDir();
        const expected = path.join(homeDir, '.gemini', 'antigravity-ide', 'brain');
        assert.strictEqual(result, expected);
    });

    test('getConversationsDir should return ~/.gemini/antigravity-ide/conversations', () => {
        const result = getConversationsDir();
        const expected = path.join(homeDir, '.gemini', 'antigravity-ide', 'conversations');
        assert.strictEqual(result, expected);
    });

    test('getMcpConfigPath should return ~/.gemini/config/mcp_config.json', () => {
        const result = getMcpConfigPath();
        const expected = path.join(homeDir, '.gemini', 'config', 'mcp_config.json');
        assert.strictEqual(result, expected);
    });

    test('getBrowserAllowlistPath should return ~/.gemini/config/browserAllowlist.txt', () => {
        const result = getBrowserAllowlistPath();
        const expected = path.join(homeDir, '.gemini', 'config', 'browserAllowlist.txt');
        assert.strictEqual(result, expected);
    });

    test('getCodeTrackerActiveDir should return ~/.gemini/antigravity-ide/conversations', () => {
        const result = getCodeTrackerActiveDir();
        const expected = path.join(homeDir, '.gemini', 'antigravity-ide', 'conversations');
        assert.strictEqual(result, expected);
    });

    test('all paths should use platform-specific separators', () => {
        const paths = [
            getGeminiRootDir(),
            getGeminiBaseDir(),
            getGlobalRulesPath(),
            getBrainDir(),
            getConversationsDir(),
            getMcpConfigPath(),
            getBrowserAllowlistPath(),
            getCodeTrackerActiveDir()
        ];

        for (const p of paths) {
            // Path should be normalized (no mixed separators)
            assert.strictEqual(p, path.normalize(p), `Path should be normalized: ${p}`);
        }
    });

    test('all paths should be absolute', () => {
        const paths = [
            getGeminiRootDir(),
            getGeminiBaseDir(),
            getGlobalRulesPath(),
            getBrainDir(),
            getConversationsDir(),
            getMcpConfigPath(),
            getBrowserAllowlistPath(),
            getCodeTrackerActiveDir()
        ];

        for (const p of paths) {
            assert.ok(path.isAbsolute(p), `Path should be absolute: ${p}`);
        }
    });

    test('all directory paths should not end with separator', () => {
        const dirPaths = [
            getGeminiRootDir(),
            getGeminiBaseDir(),
            getBrainDir(),
            getConversationsDir(),
            getCodeTrackerActiveDir()
        ];

        for (const p of dirPaths) {
            assert.ok(!p.endsWith(path.sep), `Directory path should not end with separator: ${p}`);
        }
    });

    test('file paths should have correct extensions', () => {
        assert.ok(getGlobalRulesPath().endsWith('.md'), 'Global rules should be .md file');
        assert.ok(getMcpConfigPath().endsWith('.json'), 'MCP config should be .json file');
        assert.ok(getBrowserAllowlistPath().endsWith('.txt'), 'Browser allowlist should be .txt file');
    });

    test('paths should maintain hierarchy', () => {
        const rootDir = getGeminiRootDir();
        const baseDir = getGeminiBaseDir();
        const brainDir = getBrainDir();
        const conversationsDir = getConversationsDir();
        const codeTrackerDir = getCodeTrackerActiveDir();

        // Base dir should be under root dir
        assert.ok(baseDir.startsWith(rootDir), 'Base dir should be under root dir');

        // Brain and conversations should be under base dir
        assert.ok(brainDir.startsWith(baseDir), 'Brain dir should be under base dir');
        assert.ok(conversationsDir.startsWith(baseDir), 'Conversations dir should be under base dir');

        // Code tracker should be under base dir
        assert.ok(codeTrackerDir.startsWith(baseDir), 'Code tracker dir should be under base dir');
    });
});

