/**
 * Unit tests for Commit Message Claude module
 * 
 * Tests core logic for diff truncation, prompt building, and response parsing
 */
import * as assert from 'assert';
import { truncateDiff, buildClaudePrompt, parseClaudeResponse } from '../../commitMessageClaude';

suite('Commit Message Claude Test Suite', () => {

    suite('truncateDiff', () => {
        test('should not truncate diff smaller than limit', () => {
            const diff = 'small diff content';
            const result = truncateDiff(diff, 1000);

            assert.strictEqual(result.truncated, false);
            assert.strictEqual(result.result, diff);
        });

        test('should truncate diff larger than limit', () => {
            const diff = 'a'.repeat(1000);
            const result = truncateDiff(diff, 500);

            assert.strictEqual(result.truncated, true);
            assert.ok(result.result.length < diff.length);
            assert.ok(result.result.includes('[diff truncated due to size]'));
        });

        test('should truncate at exact boundary', () => {
            const diff = 'abcdefghij'; // 10 chars
            const result = truncateDiff(diff, 10);

            assert.strictEqual(result.truncated, false);
            assert.strictEqual(result.result, diff);
        });

        test('should handle empty diff', () => {
            const result = truncateDiff('', 1000);

            assert.strictEqual(result.truncated, false);
            assert.strictEqual(result.result, '');
        });
    });

    suite('buildClaudePrompt', () => {
        test('should build conventional commit prompt', () => {
            const diff = 'diff --git a/file.ts\n+new line';
            const stat = ' 1 file changed, 1 insertion(+)';
            const recentCommits = ['feat: add login', 'fix: typo'];
            const repoName = 'my-project';

            const prompt = buildClaudePrompt(diff, stat, recentCommits, repoName, 'conventional');

            assert.ok(prompt.includes('conventional'));
            assert.ok(prompt.includes('type(scope): description'));
            assert.ok(prompt.includes('Repository: my-project'));
            assert.ok(prompt.includes('Recent commit messages'));
            assert.ok(prompt.includes('feat: add login'));
            assert.ok(prompt.includes('diff --git'));
        });

        test('should build simple commit prompt', () => {
            const diff = 'some diff';
            const stat = '1 file changed';

            const prompt = buildClaudePrompt(diff, stat, [], '', 'simple');

            assert.ok(!prompt.includes('conventional'));
            assert.ok(!prompt.includes('type(scope)'));
            assert.ok(!prompt.includes('Repository:'));
            assert.ok(!prompt.includes('Recent commit'));
        });

        test('should handle empty recent commits', () => {
            const prompt = buildClaudePrompt('diff', 'stat', [], 'repo', 'conventional');

            assert.ok(!prompt.includes('Recent commit messages'));
        });

        test('should include 72 char limit instruction', () => {
            const prompt = buildClaudePrompt('diff', 'stat', [], 'repo', 'conventional');

            assert.ok(prompt.includes('<= 72 characters'));
        });

        test('should include imperative mood instruction', () => {
            const prompt = buildClaudePrompt('diff', 'stat', [], 'repo', 'conventional');

            assert.ok(prompt.includes('imperative mood'));
        });
    });

    suite('parseClaudeResponse', () => {
        test('should parse valid text response', () => {
            const response = {
                content: [
                    { type: 'text', text: 'feat: add new feature\n\n- Added login\n- Added logout' }
                ]
            };

            const result = parseClaudeResponse(response);

            assert.strictEqual(result.success, true);
            assert.strictEqual(result.message, 'feat: add new feature\n\n- Added login\n- Added logout');
        });

        test('should handle API error response', () => {
            const response = {
                error: { message: 'Invalid API key' }
            };

            const result = parseClaudeResponse(response);

            assert.strictEqual(result.success, false);
            assert.strictEqual(result.error, 'Invalid API key');
        });

        test('should handle empty content array', () => {
            const response = {
                content: []
            };

            const result = parseClaudeResponse(response);

            assert.strictEqual(result.success, false);
            assert.ok(result.error?.includes('Unable to parse'));
        });

        test('should handle missing content', () => {
            const response = {};

            const result = parseClaudeResponse(response);

            assert.strictEqual(result.success, false);
        });

        test('should handle non-text content type', () => {
            const response = {
                content: [
                    { type: 'image', data: 'base64...' }
                ]
            };

            const result = parseClaudeResponse(response);

            assert.strictEqual(result.success, false);
            assert.ok(result.error?.includes('Unable to parse'));
        });

        test('should trim whitespace from response', () => {
            const response = {
                content: [
                    { type: 'text', text: '  fix: trim spaces  \n\n' }
                ]
            };

            const result = parseClaudeResponse(response);

            assert.strictEqual(result.success, true);
            assert.strictEqual(result.message, 'fix: trim spaces');
        });

        test('should handle response with multiple content items', () => {
            const response = {
                content: [
                    { type: 'thinking', text: 'internal reasoning' },
                    { type: 'text', text: 'feat: the actual response' }
                ]
            };

            const result = parseClaudeResponse(response);

            assert.strictEqual(result.success, true);
            assert.strictEqual(result.message, 'feat: the actual response');
        });
    });
});
