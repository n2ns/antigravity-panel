import * as vscode from 'vscode';

export interface DiagnosticMetadata {
    reason: string;
    candidateCount?: number;
    parsingInfo?: string;
    platform: string;
    arch: string;
    version: string;
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
        diagInfo += `- **${vscode.l10n.t("Operating System")}**: ${meta.platform} (${meta.arch})\n`;
        diagInfo += `- **${vscode.l10n.t("Error Code")}**: ${meta.reason}\n`;
        if (meta.candidateCount !== undefined) diagInfo += `- **${vscode.l10n.t("Candidate Process Count")}**: ${meta.candidateCount}\n`;
        if (meta.parsingInfo) diagInfo += `- **${vscode.l10n.t("Parsing Details")}**: ${meta.parsingInfo}\n`;

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
