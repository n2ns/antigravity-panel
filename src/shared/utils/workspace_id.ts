/**
 * Workspace ID utilities for matching Language Server workspace identification
 *
 * The Language Server generates workspace_id from the opened folder path,
 * using different encoding rules per platform. This module replicates that logic.
 */

import * as vscode from "vscode";
import {
  normalizeWindowsPath,
  normalizeUnixPath,
} from "./workspace_path";

export {
  normalizeWindowsPath,
  normalizeUnixPath,
  normalizePathToWorkspaceId,
} from "./workspace_path";

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
