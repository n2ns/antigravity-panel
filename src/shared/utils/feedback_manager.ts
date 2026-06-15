import * as vscode from 'vscode';

export interface DiagnosticMetadata {
    reason: string;
    candidateCount?: number;
    parsingInfo?: string;
    platform: string;
    arch: string;
    version: string;
    // New fields for enhanced diagnostics
    ideVersion?: string;
    processName?: string;
    serverResponse?: string;
    attemptDetails?: string;
    osDetailedVersion?: string;
    // Enhanced diagnostics v2
    tokenPreview?: string;  // First 8 chars of CSRF token
    portsFromCmdline?: number;  // Ports from command line
    portsFromNetstat?: number;  // Ports from netstat
    protocolUsed?: string;  // Protocol used (https/http/none)
    retryCount?: number;  // Number of retry attempts
    bootRetryCount?: number; // External boot retry attempts
    diagnosticSummary?: string; // Last related-process diagnostic output
}

/**
 * FeedbackManager: Handles construction of feedback reports and 
 * GitHub issue redirection logic.
 */
export class FeedbackManager {
    private static readonly GITHUB_ISSUES_URL = "https://github.com/n2ns/antigravity-panel/issues/new";

    /**
     * Constructs a GitHub Issue URL with diagnostic information.
     */
    public static getFeedbackUrl(meta: DiagnosticMetadata): vscode.Uri {
        const title = encodeURIComponent(`[REPORT-AUTO] ${meta.reason} - ${meta.version}`);

        let diagInfo = `**${vscode.l10n.t("Diagnostic System Information (Auto-generated)")}**\n`;
        diagInfo += `- **${vscode.l10n.t("Extension Version")}**: ${meta.version}\n`;
        const osString = meta.osDetailedVersion ? `${meta.platform} (${meta.osDetailedVersion})` : `${meta.platform} (${meta.arch})`;
        diagInfo += `- **${vscode.l10n.t("Operating System")}**: ${osString}\n`;
        if (meta.ideVersion) diagInfo += `- **IDE Version**: ${meta.ideVersion}\n`;
        diagInfo += `- **${vscode.l10n.t("Error Code")}**: ${meta.reason}\n`;
        if (meta.processName) diagInfo += `- **Process Searched**: ${meta.processName}\n`;
        if (meta.candidateCount !== undefined) diagInfo += `- **${vscode.l10n.t("Candidate Process Count")}**: ${meta.candidateCount}\n`;
        if (meta.parsingInfo) diagInfo += `- **${vscode.l10n.t("Parsing Details")}**: ${meta.parsingInfo}\n`;
        if (meta.attemptDetails) diagInfo += `- **Attempt Details**: ${meta.attemptDetails}\n`;
        // Enhanced diagnostics v2
        if (meta.tokenPreview) diagInfo += `- **Token Preview**: ${meta.tokenPreview}...\n`;
        if (meta.portsFromCmdline !== undefined || meta.portsFromNetstat !== undefined) {
            diagInfo += `- **Port Sources**: cmdline=${meta.portsFromCmdline ?? 0}, netstat=${meta.portsFromNetstat ?? 0}\n`;
        }
        if (meta.protocolUsed) diagInfo += `- **Protocol Used**: ${meta.protocolUsed}\n`;
        if (meta.retryCount !== undefined) diagInfo += `- **Retry Count**: ${meta.retryCount}\n`;
        if (meta.diagnosticSummary) {
            diagInfo += `\n**Process Diagnostics**:\n\`\`\`\n${meta.diagnosticSummary.substring(0, 1500)}\n\`\`\`\n`;
        }
        if (meta.serverResponse) diagInfo += `\n**Server Response**:\n\`\`\`\n${meta.serverResponse.substring(0, 500)}\n\`\`\`\n`;

        const body = encodeURIComponent(
            `${vscode.l10n.t("**Problem Description**\n(Please briefly describe the situation under which this problem occurred, e.g., did you just upgrade the IDE?)\n\n---")}\n${diagInfo}`
        );

        const url = `${this.GITHUB_ISSUES_URL}?title=${title}&body=${body}&labels=bug,auto-report`;
        return vscode.Uri.parse(url);
    }

    /**
     * Common helper to show a standard error notification with functional feedback button.
     */
    public static async showFeedbackNotification(message: string, meta: DiagnosticMetadata): Promise<void> {
        const feedbackBtn = vscode.l10n.t("Feedback");
        const diagnosticBtn = vscode.l10n.t("Run Diagnostics");
        const selection = await vscode.window.showWarningMessage(message, feedbackBtn, diagnosticBtn);
        if (selection === feedbackBtn) {
            const url = this.getFeedbackUrl(meta);
            await vscode.env.openExternal(url);
        } else if (selection === diagnosticBtn) {
            await vscode.commands.executeCommand("tfa.runDiagnostics");
        }
    }
}
