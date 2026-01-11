/**
 * Workspace ID utilities for matching Language Server workspace identification
 * 
 * The Language Server generates workspace_id from the opened folder path,
 * using different encoding rules per platform. This module replicates that logic.
 */

import * as vscode from "vscode";

/**
 * Calculate expected Workspace IDs for all current VS Code workspace folders
 * 
 * @returns Array of workspace IDs matching Language Server format
 */
export function getExpectedWorkspaceIds(): string[] {
    return getWorkspaceIdsFromFolders(vscode.workspace.workspaceFolders || []);
}

export function getWorkspaceIdsFromFolders(folders: readonly vscode.WorkspaceFolder[]): string[] {
    if (!folders || folders.length === 0) return [];

    return folders.map(folder => {
        const rootPath = folder.uri.fsPath;

        if (process.platform === 'win32') {
            return normalizeWindowsPath(rootPath);
        } else {
            return normalizeUnixPath(rootPath);
        }
    });
}

/**
 * Normalize Windows path to match Language Server workspace_id format
 * 
 * Rules derived from actual Language Server output:
 * - Drive letter: lowercase (V → v)
 * - Colon: URL-encoded as _3A_ 
 * - Backslash: replaced with _
 * - Directory names: preserve original case
 * - Special chars (like -): replaced with _
 * 
 * @example
 * normalizeWindowsPath("V:\\DevSpace\\daisy-box") 
 * // → "file_v_3A_DevSpace_daisy_box"
 */
export function normalizeWindowsPath(path: string): string {
    // Split into drive and rest: "V:\DevSpace\daisy-box" → ["V:", "DevSpace\daisy-box"]
    const driveMatch = path.match(/^([A-Za-z]):(.*)/);
    if (!driveMatch) {
        // Fallback for UNC paths or unusual formats
        return normalizeUnixPath(path);
    }

    const driveLetter = driveMatch[1].toLowerCase();  // V → v
    const restOfPath = driveMatch[2];                 // \DevSpace\daisy-box

    // Process the rest: replace \ and special chars with _, preserve case
    const normalizedRest = restOfPath
        .replace(/\\/g, "_")           // Backslash → underscore
        .replace(/[^a-zA-Z0-9_]/g, "_") // Other special chars → underscore
        .replace(/^_+/, "");            // Strip leading underscores

    // Combine: file_ + driveLetter + _3A_ + rest
    return `file_${driveLetter}_3A_${normalizedRest}`;
}

/**
 * Normalize Unix/WSL/macOS path to match Language Server workspace_id format
 * 
 * The Language Server URL-encodes special characters:
 * - Spaces become %20 which is then represented as _20 in the workspace ID
 * - Other special chars are replaced with underscores
 * 
 * @example
 * normalizeUnixPath("/Users/bob/open source/project")
 * // → "file_Users_bob_open_20source_project"
 * 
 * normalizeUnixPath("/home/deploy/projects")
 * // → "file_home_deploy_projects"
 */
export function normalizeUnixPath(path: string): string {
    // First, normalize backslashes to forward slashes (for UNC/Windows paths)
    // This prevents backslashes from being URL-encoded as %5C → _5C
    const normalizedSlashes = path.replace(/\\/g, '/');

    // URL-encode the path to match what the language server does
    // This handles spaces as %20 and other special characters
    const urlEncoded = normalizedSlashes
        .split('/')
        .map(segment => {
            // Encode each path segment, which converts spaces to %20
            return encodeURIComponent(segment);
        })
        .join('/');

    // Now convert the URL-encoded string to the workspace ID format
    // Replace all non-alphanumeric characters with underscores
    // This converts %20 to _20, / to _, etc.
    // IMPORTANT: Do NOT lowercase - preserve case like the server does
    const normalizedPath = urlEncoded
        .replace(/^[^a-zA-Z0-9]+/, "")    // Strip leading non-alphanumeric (preserve case)
        .replace(/[^a-zA-Z0-9]+$/, "")    // Strip trailing non-alphanumeric (preserve case)
        .replace(/[^a-zA-Z0-9]/g, "_");   // Replace everything else with underscore (preserves case)

    return `file_${normalizedPath}`;
}
