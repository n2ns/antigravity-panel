/**
 * Unit tests for Commit Message Claude module
 * 
 * Tests core logic for diff truncation, prompt building, and response parsing
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import * as vscode from 'vscode';
import {
    truncateDiff, buildClaudePrompt, parseLLMResponse, detectApiFormat, callLLMApi, getStagedDiff,
    applyCommitMessageToScm, getWorkspaceRoot
} from '../../commitMessageClaude';

suite('Commit Message Claude Test Suite', () => {

    suite('getWorkspaceRoot', () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mock = vscode as any;
        const folderA = { uri: { fsPath: '/work/a' } };
        const folderB = { uri: { fsPath: '/work/b' } };

        function installWorkspace(folders: object[] | undefined, activePath?: string): void {
            mock.workspace.workspaceFolders = folders;
            mock.workspace.getWorkspaceFolder = (uri: { fsPath: string }) =>
                (folders as { uri: { fsPath: string } }[] | undefined)
                    ?.find(f => uri.fsPath.startsWith(f.uri.fsPath + '/'));
            mock.window.activeTextEditor = activePath
                ? { document: { uri: { fsPath: activePath } } }
                : undefined;
        }

        teardown(() => {
            delete mock.workspace.workspaceFolders;
            delete mock.workspace.getWorkspaceFolder;
            delete mock.window.activeTextEditor;
        });

        test('should return undefined without workspace folders', () => {
            installWorkspace(undefined);
            assert.strictEqual(getWorkspaceRoot(), undefined);
        });

        test('should use the folder of the active editor in a multi-root workspace', () => {
            installWorkspace([folderA, folderB], '/work/b/src/index.ts');
            assert.strictEqual(getWorkspaceRoot(), '/work/b');
        });

        test('should fall back to the first folder without an active editor', () => {
            installWorkspace([folderA, folderB]);
            assert.strictEqual(getWorkspaceRoot(), '/work/a');
        });

        test('should fall back to the first folder when the active file is outside the workspace', () => {
            installWorkspace([folderA, folderB], '/tmp/notes.md');
            assert.strictEqual(getWorkspaceRoot(), '/work/a');
        });
    });

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

    suite('parseLLMResponse', () => {
        test('should parse valid text response', () => {
            const response = {
                content: [
                    { type: 'text', text: 'feat: add new feature\n\n- Added login\n- Added logout' }
                ]
            };

            const result = parseLLMResponse(response);

            assert.strictEqual(result.success, true);
            assert.strictEqual(result.message, 'feat: add new feature\n\n- Added login\n- Added logout');
        });

        test('should handle API error response', () => {
            const response = {
                error: { message: 'Invalid API key' }
            };

            const result = parseLLMResponse(response);

            assert.strictEqual(result.success, false);
            assert.strictEqual(result.error, 'Invalid API key');
        });

        test('should handle empty content array', () => {
            const response = {
                content: []
            };

            const result = parseLLMResponse(response);

            assert.strictEqual(result.success, false);
            assert.ok(result.error?.includes('Unable to parse'));
        });

        test('should handle missing content', () => {
            const response = {};

            const result = parseLLMResponse(response);

            assert.strictEqual(result.success, false);
        });

        test('should handle non-text content type', () => {
            const response = {
                content: [
                    { type: 'image', data: 'base64...' }
                ]
            };

            const result = parseLLMResponse(response);

            assert.strictEqual(result.success, false);
            assert.ok(result.error?.includes('Unable to parse'));
        });

        test('should trim whitespace from response', () => {
            const response = {
                content: [
                    { type: 'text', text: '  fix: trim spaces  \n\n' }
                ]
            };

            const result = parseLLMResponse(response);

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

            const result = parseLLMResponse(response);

            assert.strictEqual(result.success, true);
            assert.strictEqual(result.message, 'feat: the actual response');
        });
    });

    suite('parseLLMResponse (A1/A2 additions)', () => {
        test('should fail when Anthropic output stopped at max_tokens', () => {
            const result = parseLLMResponse({
                stop_reason: 'max_tokens',
                content: [{ type: 'text', text: 'feat: partial' }]
            });

            assert.strictEqual(result.success, false);
            assert.ok(result.error?.includes('cut off (max_tokens)'));
        });

        test('should parse Ollama /api/chat response { message: { content } }', () => {
            const result = parseLLMResponse({ message: { content: '  feat: from chat \n' } });

            assert.strictEqual(result.success, true);
            assert.strictEqual(result.message, 'feat: from chat');
        });
    });

    suite('detectApiFormat', () => {
        test('should detect format from the URL path', () => {
            assert.strictEqual(detectApiFormat('http://localhost:11434/api/generate'), 'ollama-generate');
            assert.strictEqual(detectApiFormat('http://localhost:11434/api/chat'), 'ollama-chat');
            assert.strictEqual(detectApiFormat('http://localhost:11434/v1/chat/completions'), 'openai');
            assert.strictEqual(detectApiFormat('https://api.anthropic.com/v1/messages'), 'anthropic');
            assert.strictEqual(detectApiFormat('https://proxy.example.com/v1/messages'), 'anthropic');
            assert.strictEqual(detectApiFormat('https://api.openai.com/v1/chat/completions'), 'openai');
        });

        test('should fall back to substring heuristic for unparseable endpoints', () => {
            assert.strictEqual(detectApiFormat('ollama host 11434'), 'ollama-generate');
            assert.strictEqual(detectApiFormat('not a url anthropic'), 'anthropic');
            assert.strictEqual(detectApiFormat('not a url'), 'openai');
        });
    });

    suite('callLLMApi request body', () => {
        const originalFetch = globalThis.fetch;
        let calls: Array<{ url: string; init: RequestInit }>;

        function stubFetch(data: unknown): void {
            calls = [];
            globalThis.fetch = (async (url: string, init: RequestInit) => {
                calls.push({ url: String(url), init });
                return { ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data) };
            }) as unknown as typeof fetch;
        }

        teardown(() => {
            globalThis.fetch = originalFetch;
        });

        test('Anthropic: no temperature, max_tokens 4096, anthropic-version header', async () => {
            stubFetch({ content: [{ type: 'text', text: 'feat: x' }], stop_reason: 'end_turn' });
            const result = await callLLMApi('p', 'claude-x', 'sk-ant-test', 'https://api.anthropic.com/v1/messages');

            assert.strictEqual(result.success, true);
            const body = JSON.parse(String(calls[0].init.body));
            assert.ok(!('temperature' in body));
            assert.strictEqual(body.max_tokens, 4096);
            const headers = calls[0].init.headers as Record<string, string>;
            assert.strictEqual(headers['anthropic-version'], '2023-06-01');
            assert.strictEqual(headers['x-api-key'], 'sk-ant-test');
        });

        test('Anthropic: max_tokens stop reason is reported as an error', async () => {
            stubFetch({ content: [{ type: 'text', text: 'feat: par' }], stop_reason: 'max_tokens' });
            const result = await callLLMApi('p', 'claude-x', 'k', 'https://api.anthropic.com/v1/messages');

            assert.strictEqual(result.success, false);
            assert.ok(result.error?.includes('max_tokens'));
        });

        test('OpenAI-compatible: keeps temperature and messages', async () => {
            stubFetch({ choices: [{ message: { content: 'feat: x' } }] });
            const result = await callLLMApi('p', 'llama3.2', undefined, 'http://localhost:11434/v1/chat/completions');

            assert.strictEqual(result.success, true);
            const body = JSON.parse(String(calls[0].init.body));
            assert.strictEqual(body.temperature, 0.2);
            assert.strictEqual(body.max_tokens, 300);
            assert.deepStrictEqual(body.messages, [{ role: 'user', content: 'p' }]);
            assert.ok(!('prompt' in body));
        });

        test('Ollama /api/generate: prompt body', async () => {
            stubFetch({ response: 'feat: g' });
            const result = await callLLMApi('p', 'llama3.2', undefined, 'http://localhost:11434/api/generate');

            assert.strictEqual(result.message, 'feat: g');
            assert.deepStrictEqual(JSON.parse(String(calls[0].init.body)), { model: 'llama3.2', prompt: 'p', stream: false });
        });

        test('Ollama /api/chat: messages body and message.content response', async () => {
            stubFetch({ message: { role: 'assistant', content: 'feat: c' } });
            const result = await callLLMApi('p', 'llama3.2', undefined, 'http://localhost:11434/api/chat');

            assert.strictEqual(result.message, 'feat: c');
            assert.deepStrictEqual(JSON.parse(String(calls[0].init.body)), {
                model: 'llama3.2', messages: [{ role: 'user', content: 'p' }], stream: false
            });
        });
    });

    suite('getStagedDiff', () => {
        let repoDir: string;

        setup(() => {
            repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tfa-staged-diff-'));
            const git = (...args: string[]) => execFileSync('git', args, { cwd: repoDir, stdio: 'ignore' });
            git('init', '-q');
            git('config', 'user.name', 'test');
            git('config', 'user.email', 'test@example.invalid');
            fs.writeFileSync(path.join(repoDir, 'big.txt'), ('x'.repeat(99) + '\n').repeat(110 * 1024)); // ~11MB
            git('add', 'big.txt');
        });

        teardown(() => {
            fs.rmSync(repoDir, { recursive: true, force: true });
        });

        test('should read an 11MB staged diff without buffer errors and truncate it', async function () {
            this.timeout(30000);
            const maxChars = 80000;
            const result = await getStagedDiff(repoDir, maxChars);

            assert.strictEqual(result.truncated, true);
            const marker = '\n\n[diff truncated due to size]';
            assert.ok(result.diff.endsWith(marker));
            assert.ok(result.diff.length - marker.length <= maxChars);
            assert.ok(result.diff.startsWith('diff --git'));
            assert.ok(result.stat.includes('big.txt'));
        });

        test('should reject when the directory is not a git repository', async () => {
            const notRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'tfa-not-repo-'));
            try {
                await assert.rejects(getStagedDiff(notRepo, 1000));
            } finally {
                fs.rmSync(notRepo, { recursive: true, force: true });
            }
        });
    });

    suite('applyCommitMessageToScm', () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mock = vscode as any;
        const originalExtensions = mock.extensions;
        let repoA: { rootUri: { fsPath: string }; inputBox: { value: string } };
        let repoB: { rootUri: { fsPath: string }; inputBox: { value: string } };

        function installGit(api: object): void {
            mock.extensions = {
                getExtension: () => ({ isActive: true, exports: { getAPI: () => api } })
            };
        }

        setup(() => {
            repoA = { rootUri: { fsPath: '/work/a' }, inputBox: { value: '' } };
            repoB = { rootUri: { fsPath: '/work/b' }, inputBox: { value: '' } };
        });

        teardown(() => {
            mock.extensions = originalExtensions;
        });

        test('should use api.getRepository for the workspace root', async () => {
            installGit({
                repositories: [repoA, repoB],
                getRepository: (uri: { fsPath: string }) => (uri.fsPath === '/work/b' ? repoB : null)
            });
            const result = await applyCommitMessageToScm('feat: b', '/work/b');

            assert.strictEqual(result.fallbackUsed, false);
            assert.strictEqual(repoB.inputBox.value, 'feat: b');
            assert.strictEqual(repoA.inputBox.value, '');
        });

        test('should match repository root containing the workspace root', async () => {
            installGit({ repositories: [repoA, repoB], getRepository: () => null });
            await applyCommitMessageToScm('feat: sub', path.join('/work/b', 'packages', 'x'));

            assert.strictEqual(repoB.inputBox.value, 'feat: sub');
            assert.strictEqual(repoA.inputBox.value, '');
        });

        test('should fall back to the first repository when nothing matches', async () => {
            installGit({ repositories: [repoA, repoB] });
            await applyCommitMessageToScm('feat: other', '/elsewhere');

            assert.strictEqual(repoA.inputBox.value, 'feat: other');
            assert.strictEqual(repoB.inputBox.value, '');
        });
    });
});
