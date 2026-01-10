/**
 * Commit Message Generator using Local LLM
 * 
 * Workaround for upstream "Generate commit message" stream error.
 * Uses configurable local LLM endpoint (Ollama, LM Studio, etc.)
 * Privacy-compliant: no external servers by default.
 */

import * as vscode from 'vscode';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { infoLog, errorLog } from './shared/utils/logger';

const execFileAsync = promisify(execFile);

// Constants
const DEFAULT_ENDPOINT = 'http://localhost:11434/api/generate'; // Ollama default
const API_KEY_SECRET_KEY = 'tfa.llmApiKey';

/**
 * Result of git diff extraction
 */
export interface DiffResult {
    diff: string;
    stat: string;
    truncated: boolean;
}

/**
 * LLM API response structure (generic for multiple providers)
 */
interface LLMResponse {
    // Anthropic format
    content?: Array<{ type: string; text?: string }>;
    // Ollama format
    response?: string;
    // OpenAI format
    choices?: Array<{ message?: { content?: string } }>;
    // Error
    error?: { message: string } | string;
}

/**
 * Get the workspace root folder
 */
export function getWorkspaceRoot(): string | undefined {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
        return undefined;
    }
    return folders[0].uri.fsPath;
}

/**
 * Check if git is available and workspace is a git repo
 */
export async function verifyGitRepo(workspaceRoot: string): Promise<{ valid: boolean; error?: string }> {
    try {
        await execFileAsync('git', ['rev-parse', '--show-toplevel'], { cwd: workspaceRoot });
        return { valid: true };
    } catch (e: any) {
        if (e.code === 'ENOENT') {
            return { valid: false, error: 'Git is not installed or not in PATH' };
        }
        return { valid: false, error: 'Not a git repository' };
    }
}

/**
 * Get staged diff from git
 */
export async function getStagedDiff(workspaceRoot: string, maxChars: number): Promise<DiffResult> {
    // Get the full diff
    const { stdout: diff } = await execFileAsync(
        'git',
        ['diff', '--cached'],
        { cwd: workspaceRoot, maxBuffer: 10 * 1024 * 1024 } // 10MB buffer
    );

    // Get the stat summary
    const { stdout: stat } = await execFileAsync(
        'git',
        ['diff', '--cached', '--stat'],
        { cwd: workspaceRoot }
    );

    // Truncate if needed
    if (diff.length > maxChars) {
        const truncatedDiff = diff.substring(0, maxChars);
        return {
            diff: truncatedDiff + '\n\n[diff truncated due to size]',
            stat: stat.trim(),
            truncated: true
        };
    }

    return {
        diff: diff,
        stat: stat.trim(),
        truncated: false
    };
}

/**
 * Get recent commit messages for style reference
 */
export async function getRecentCommitMessages(workspaceRoot: string): Promise<string[]> {
    try {
        const { stdout } = await execFileAsync(
            'git',
            ['log', '-3', '--pretty=%s'],
            { cwd: workspaceRoot }
        );
        return stdout.trim().split('\n').filter(Boolean);
    } catch {
        // If there are no commits yet, return empty
        return [];
    }
}

/**
 * Get repository name from remote or folder
 */
export async function getRepoName(workspaceRoot: string): Promise<string> {
    try {
        const { stdout } = await execFileAsync(
            'git',
            ['remote', 'get-url', 'origin'],
            { cwd: workspaceRoot }
        );
        // Extract repo name from URL like git@github.com:user/repo.git or https://github.com/user/repo.git
        const url = stdout.trim();
        const match = url.match(/\/([^/]+?)(?:\.git)?$/);
        if (match) {
            return match[1];
        }
    } catch {
        // No remote configured
    }
    // Fallback to folder name
    const parts = workspaceRoot.split(/[/\\]/);
    return parts[parts.length - 1] || 'unknown';
}

/**
 * Truncate diff to specified character limit
 * Exported for testing
 */
export function truncateDiff(diff: string, maxChars: number): { result: string; truncated: boolean } {
    if (diff.length <= maxChars) {
        return { result: diff, truncated: false };
    }
    return {
        result: diff.substring(0, maxChars) + '\n\n[diff truncated due to size]',
        truncated: true
    };
}

/**
 * Build the prompt for Claude
 */
export function buildClaudePrompt(
    diff: string,
    stat: string,
    recentCommits: string[],
    repoName: string,
    format: 'conventional' | 'simple'
): string {
    let prompt = `Generate a ${format === 'conventional' ? 'conventional ' : ''}commit message for the following staged changes.

Rules:
- Output ONLY the commit message text, nothing else
- First line must be <= 72 characters
- Use imperative mood (e.g., "Add feature" not "Added feature")
- If the changes are unclear, stay generic but accurate
${format === 'conventional' ? '- Use conventional commit format: type(scope): description' : ''}
- After the first line, add a blank line, then optionally bullet points for key changes

`;

    if (repoName) {
        prompt += `Repository: ${repoName}\n\n`;
    }

    if (recentCommits.length > 0) {
        prompt += `Recent commit messages for style reference:\n`;
        recentCommits.forEach((msg, i) => {
            prompt += `${i + 1}. ${msg}\n`;
        });
        prompt += '\n';
    }

    prompt += `Diff statistics:\n${stat}\n\n`;
    prompt += `Staged diff:\n\`\`\`\n${diff}\n\`\`\``;

    return prompt;
}

/**
 * Parse LLM API response (supports multiple providers)
 * Exported for testing
 */
export function parseLLMResponse(response: LLMResponse): { success: boolean; message?: string; error?: string } {
    // Handle error responses
    if (response.error) {
        const errorMsg = typeof response.error === 'string'
            ? response.error
            : response.error.message;
        return { success: false, error: errorMsg };
    }

    // Ollama format: { response: "..." }
    if (response.response && typeof response.response === 'string') {
        return { success: true, message: response.response.trim() };
    }

    // Anthropic format: { content: [{ type: "text", text: "..." }] }
    if (response.content && Array.isArray(response.content) && response.content.length > 0) {
        const textContent = response.content.find((c: { type: string; text?: string }) => c.type === 'text');
        if (textContent?.text) {
            return { success: true, message: textContent.text.trim() };
        }
    }

    // OpenAI format: { choices: [{ message: { content: "..." } }] }
    if (response.choices && Array.isArray(response.choices) && response.choices.length > 0) {
        const content = response.choices[0]?.message?.content;
        if (content) {
            return { success: true, message: content.trim() };
        }
    }

    return { success: false, error: 'Unable to parse LLM response' };
}

// Legacy alias for test compatibility
export const parseClaudeResponse = parseLLMResponse;

/**
 * Call LLM API (supports configurable endpoint)
 */
export async function callLLMApi(
    prompt: string,
    model: string,
    apiKey: string | undefined,
    endpoint: string
): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
        // Build headers based on endpoint type
        const headers: Record<string, string> = {
            'content-type': 'application/json'
        };

        // Add API key if provided (for cloud services)
        if (apiKey) {
            // Detect endpoint type and set appropriate header
            if (endpoint.includes('anthropic')) {
                headers['x-api-key'] = apiKey;
                headers['anthropic-version'] = '2023-06-01';
            } else if (endpoint.includes('openai')) {
                headers['authorization'] = `Bearer ${apiKey}`;
            } else {
                // Generic API key header for other services
                headers['authorization'] = `Bearer ${apiKey}`;
            }
        }

        // Build request body based on endpoint type
        let body: string;
        if (endpoint.includes('ollama') || endpoint.includes('11434')) {
            // Ollama format
            body = JSON.stringify({
                model: model,
                prompt: prompt,
                stream: false
            });
        } else if (endpoint.includes('anthropic')) {
            // Anthropic format
            body = JSON.stringify({
                model: model,
                max_tokens: 300,
                temperature: 0.2,
                messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }]
            });
        } else {
            // OpenAI-compatible format (default)
            body = JSON.stringify({
                model: model,
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 300,
                temperature: 0.2
            });
        }

        const response = await fetch(endpoint, {
            method: 'POST',
            headers,
            body
        });

        if (!response.ok) {
            const errorBody = await response.text();
            let errorMessage = `API request failed: ${response.status}`;
            try {
                const errorJson = JSON.parse(errorBody);
                if (errorJson.error?.message) {
                    errorMessage = errorJson.error.message;
                } else if (typeof errorJson.error === 'string') {
                    errorMessage = errorJson.error;
                }
            } catch {
                // Use default error message
            }
            return { success: false, error: errorMessage };
        }

        const data = await response.json() as LLMResponse;
        return parseLLMResponse(data);
    } catch (e: any) {
        return { success: false, error: e.message || 'Unknown error occurred' };
    }
}

// Legacy alias for test compatibility
export const callAnthropicApi = async (
    prompt: string,
    model: string,
    apiKey: string
) => callLLMApi(prompt, model, apiKey, 'https://api.anthropic.com/v1/messages');

/**
 * Apply commit message to SCM input box
 */
export async function applyCommitMessageToScm(message: string): Promise<{ success: boolean; fallbackUsed: boolean }> {
    try {
        // Try to get the Git extension's SCM input
        const gitExtension = vscode.extensions.getExtension('vscode.git');
        if (gitExtension) {
            const git = gitExtension.isActive ? gitExtension.exports : await gitExtension.activate();
            const api = git.getAPI(1);

            if (api && api.repositories && api.repositories.length > 0) {
                const repo = api.repositories[0];
                repo.inputBox.value = message;

                // Focus the SCM view
                await vscode.commands.executeCommand('workbench.view.scm');
                return { success: true, fallbackUsed: false };
            }
        }
    } catch (e) {
        errorLog('Failed to access SCM input box', e);
    }

    // Fallback: copy to clipboard
    await vscode.env.clipboard.writeText(message);
    return { success: true, fallbackUsed: true };
}

/**
 * Get stored API key from SecretStorage
 */
export async function getApiKey(context: vscode.ExtensionContext): Promise<string | undefined> {
    return context.secrets.get(API_KEY_SECRET_KEY);
}

/**
 * Store API key in SecretStorage
 */
export async function setApiKey(context: vscode.ExtensionContext, apiKey: string): Promise<void> {
    await context.secrets.store(API_KEY_SECRET_KEY, apiKey);
}

/**
 * Delete stored API key
 */
export async function deleteApiKey(context: vscode.ExtensionContext): Promise<void> {
    await context.secrets.delete(API_KEY_SECRET_KEY);
}

/**
 * Main command handler: Generate commit message using Local LLM
 */
export async function generateCommitMessageCommand(context: vscode.ExtensionContext): Promise<void> {
    const config = vscode.workspace.getConfiguration('tfa');
    const model = config.get<string>('commitMessageClaude.model', 'llama3.2');
    const maxDiffChars = config.get<number>('commitMessageClaude.maxDiffChars', 80000);
    const format = config.get<'conventional' | 'simple'>('commitMessageClaude.format', 'conventional');
    const endpoint = config.get<string>('commitMessageClaude.endpoint', DEFAULT_ENDPOINT);

    // Check workspace
    const workspaceRoot = getWorkspaceRoot();
    if (!workspaceRoot) {
        vscode.window.showErrorMessage(vscode.l10n.t('No workspace folder open'));
        return;
    }

    // API key is optional for local endpoints
    const apiKey = await getApiKey(context);
    const isLocalEndpoint = endpoint.includes('localhost') || endpoint.includes('127.0.0.1');

    // Only require API key for non-local endpoints
    if (!apiKey && !isLocalEndpoint) {
        const setKeyAction = vscode.l10n.t('Set API Key');
        const selection = await vscode.window.showErrorMessage(
            vscode.l10n.t('API key required for remote endpoint'),
            setKeyAction
        );
        if (selection === setKeyAction) {
            await vscode.commands.executeCommand('tfa.setAnthropicApiKey');
        }
        return;
    }

    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: vscode.l10n.t('Generating commit message...'),
        cancellable: false
    }, async () => {
        try {
            // Verify git repo
            const gitCheck = await verifyGitRepo(workspaceRoot);
            if (!gitCheck.valid) {
                vscode.window.showErrorMessage(gitCheck.error || vscode.l10n.t('Git repository error'));
                return;
            }

            // Get staged diff
            const diffResult = await getStagedDiff(workspaceRoot, maxDiffChars);

            if (!diffResult.diff.trim()) {
                vscode.window.showInformationMessage(vscode.l10n.t('No staged changes found. Stage some changes first with git add.'));
                return;
            }

            // Get context
            const [recentCommits, repoName] = await Promise.all([
                getRecentCommitMessages(workspaceRoot),
                getRepoName(workspaceRoot)
            ]);

            // Build prompt
            const prompt = buildClaudePrompt(diffResult.diff, diffResult.stat, recentCommits, repoName, format);
            infoLog(`Calling LLM API: endpoint=${endpoint}, model=${model}, diff truncated=${diffResult.truncated}`);

            // Call API
            const result = await callLLMApi(prompt, model, apiKey, endpoint);

            if (!result.success) {
                vscode.window.showErrorMessage(vscode.l10n.t('LLM API error: {0}', result.error || 'Unknown error'));
                return;
            }

            // Apply to SCM
            const applyResult = await applyCommitMessageToScm(result.message!);

            if (applyResult.fallbackUsed) {
                vscode.window.showInformationMessage(
                    vscode.l10n.t('Commit message copied to clipboard. Paste into SCM input.')
                );
            } else {
                vscode.window.showInformationMessage(vscode.l10n.t('Commit message generated successfully'));
            }

        } catch (e: any) {
            errorLog('Generate commit message failed', e);
            vscode.window.showErrorMessage(vscode.l10n.t('Failed to generate commit message: {0}', e.message));
        }
    });
}

/**
 * Command handler: Set Anthropic API key
 */
export async function setAnthropicApiKeyCommand(context: vscode.ExtensionContext): Promise<void> {
    const existingKey = await getApiKey(context);

    const input = await vscode.window.showInputBox({
        prompt: vscode.l10n.t('Enter your Anthropic API key'),
        placeHolder: 'sk-ant-...',
        password: true,
        value: existingKey ? '••••••••' : undefined,
        validateInput: (value: string) => {
            if (!value || value === '••••••••') {
                return existingKey ? null : vscode.l10n.t('API key is required');
            }
            if (!value.startsWith('sk-ant-')) {
                return vscode.l10n.t('Invalid API key format. Should start with sk-ant-');
            }
            return null;
        }
    });

    if (input && input !== '••••••••') {
        await setApiKey(context, input);
        vscode.window.showInformationMessage(vscode.l10n.t('Anthropic API key saved securely'));
    }
}
