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

        let diagInfo = `**${vscode.l10n.t("report.title")}**\n`;
        diagInfo += `- **${vscode.l10n.t("report.version")}**: ${meta.version}\n`;
        diagInfo += `- **${vscode.l10n.t("report.os")}**: ${meta.platform} (${meta.arch})\n`;
        diagInfo += `- **${vscode.l10n.t("report.error_code")}**: ${meta.reason}\n`;
        if (meta.candidateCount !== undefined) diagInfo += `- **${vscode.l10n.t("report.candidate_count")}**: ${meta.candidateCount}\n`;
        if (meta.parsingInfo) diagInfo += `- **${vscode.l10n.t("report.parsing_info")}**: ${meta.parsingInfo}\n`;

        const body = encodeURIComponent(
            `${vscode.l10n.t("report.description_placeholder")}\n${diagInfo}`
        );

        const url = `${this.GITHUB_ISSUES_URL}?title=${title}&body=${body}&labels=bug,auto-report`;
        return vscode.Uri.parse(url);
    }

    /**
     * Common helper to show a standard error notification with functional feedback button.
     */
    public static async showFeedbackNotification(message: string, meta: DiagnosticMetadata): Promise<void> {
        const btnLabel = vscode.l10n.t("button.feedback");
        const selection = await vscode.window.showWarningMessage(message, btnLabel);
        if (selection === btnLabel) {
            const url = this.getFeedbackUrl(meta);
            await vscode.env.openExternal(url);
        }
    }
}
