/**
 * Workspace ID utilities for matching Language Server workspace identification
 *
 * The Language Server generates workspace_id from the opened folder path,
 * using different encoding rules per platform. This module replicates that logic.
 */

import * as vscode from "vscode";

export function getExpectedWorkspaceIds(): string[] {
  const ids = getWorkspaceIdsFromFolders(vscode.workspace.workspaceFolders || []);

  // If we are in a multi-root workspace (.code-workspace file), also include the workspace file ID
  // Reference: Issue #55 - Multi-root workspace ID mismatch
  const workspaceFile = vscode.workspace.workspaceFile;
  if (workspaceFile && workspaceFile.scheme === 'file') {
    const fsPath = workspaceFile.fsPath;
    const id = process.platform === "win32" ? normalizeWindowsPath(fsPath) : normalizeUnixPath(fsPath);
    if (!ids.includes(id)) {
      ids.push(id);
    }
  }

  return ids;
}

export function getWorkspaceIdsFromFolders(
  folders: readonly vscode.WorkspaceFolder[],
): string[] {
  if (!folders || folders.length === 0) return [];

  return folders.map((folder) => {
    const rootPath = folder.uri.fsPath;

    if (process.platform === "win32") {
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
 * - ALL special chars (including . and -): replaced with _
 * - Runs of consecutive special chars: collapsed into a SINGLE _
 * - Spaces: URL-encoded as %20, then % becomes _ → _20
 *
 * @example
 * normalizeWindowsPath("C:\\Users\\israel.toledo\\Local Projects\\visionboard-ff")
 * // → "file_c_3A_Users_israel_toledo_Local_20Projects_visionboard_ff"
 */
export function normalizeWindowsPath(path: string): string {
  // Split into drive and rest: "C:\Users\foo" → ["C:", "\Users\foo"]
  const driveMatch = path.match(/^([A-Za-z]):(.*)/);
  if (!driveMatch) {
    // Fallback for UNC paths or unusual formats
    return normalizeUnixPath(path);
  }

  const driveLetter = driveMatch[1].toLowerCase(); // C → c
  const restOfPath = driveMatch[2]; // \Users\foo

  // Split path into segments and URL-encode each (to match server behavior)
  // This converts spaces to %20, etc.
  const segments = restOfPath.split(/[\\/]/);
  const encodedSegments = segments
    .filter((s) => s.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join("_");

  // Convert runs of non-alphanumerics to a single underscore (including %, ., -)
  // This transforms %20 → _20, dots → _, hyphens → _. The server collapses
  // consecutive special characters into ONE underscore (verified live on Unix;
  // see normalizeUnixPath), so runs must not produce multiple underscores.
  const normalizedRest = encodedSegments.replace(/[^a-zA-Z0-9]+/g, "_");

  // Combine: file_ + driveLetter + _3A_ + rest; collapse a possible run at the
  // template boundary (rest may start with an underscore, e.g. "C:\_foo")
  return `file_${driveLetter}_3A_${normalizedRest}`.replace(/_+/g, "_");
}

/**
 * Normalize Unix/WSL/macOS path to match Language Server workspace_id format
 *
 * The Language Server URL-encodes special characters:
 * - Spaces become %20 which is then represented as _20 in the workspace ID
 * - Other special chars are replaced with underscores
 *
 * Runs of special characters collapse into a SINGLE underscore, matching the
 * server (verified live: the server announces "/home/deploy/_projects/antigravity-panel"
 * as "file_home_deploy_projects_antigravity_panel").
 *
 * @example
 * normalizeUnixPath("/Users/bob/open source/project")
 * // → "file_Users_bob_open_20source_project"
 *
 * normalizeUnixPath("/home/deploy/_projects")
 * // → "file_home_deploy_projects"
 */
export function normalizeUnixPath(path: string): string {
  // First, normalize backslashes to forward slashes (for UNC/Windows paths)
  // This prevents backslashes from being URL-encoded as %5C → _5C
  const normalizedSlashes = path.replace(/\\/g, "/");

  // URL-encode the path to match what the language server does
  // This handles spaces as %20 and other special characters
  const urlEncoded = normalizedSlashes
    .split("/")
    .map((segment) => {
      // Encode each path segment, which converts spaces to %20
      return encodeURIComponent(segment);
    })
    .join("/");

  // Now convert the URL-encoded string to the workspace ID format
  // Replace each run of non-alphanumeric characters with ONE underscore
  // This converts %20 to _20, / to _, "/_" to _, etc.
  // IMPORTANT: Do NOT lowercase - preserve case like the server does
  const normalizedPath = urlEncoded
    .replace(/^[^a-zA-Z0-9]+/, "") // Strip leading non-alphanumeric (preserve case)
    .replace(/[^a-zA-Z0-9]+$/, "") // Strip trailing non-alphanumeric (preserve case)
    .replace(/[^a-zA-Z0-9]+/g, "_"); // Collapse runs to a single underscore (preserves case)

  return `file_${normalizedPath}`;
}
