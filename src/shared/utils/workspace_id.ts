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
    const folders = vscode.workspace.workspaceFolders;
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
 * Simple lowercase + underscore replacement
 * 
 * @example
 * normalizeUnixPath("/home/deploy/projects")
 * // → "file_home_deploy_projects"
 */
export function normalizeUnixPath(path: string): string {
    const normalizedPath = path
        .toLowerCase()
        .replace(/^[^a-z0-9]+/, "")    // Strip leading non-alphanumeric
        .replace(/[^a-z0-9]+$/, "")    // Strip trailing non-alphanumeric
        .replace(/[^a-z0-9]/g, "_");   // Replace everything else with underscore

    return `file_${normalizedPath}`;
}
