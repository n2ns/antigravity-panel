/**
 * Pure (vscode-free) path normalization utilities matching Antigravity Language
 * Server workspace_id formatting.
 */

/**
 * Normalize Windows path to match Language Server workspace_id format.
 *
 * @example
 * normalizeWindowsPath("C:\\Users\\bob\\My Project")
 * // → "file_c_3A_Users_bob_My_20Project"
 */
export function normalizeWindowsPath(fsPath: string): string {
  const driveMatch = fsPath.match(/^([A-Za-z]):(.*)/);
  if (!driveMatch) {
    return normalizeUnixPath(fsPath);
  }

  const driveLetter = driveMatch[1].toLowerCase();
  const restOfPath = driveMatch[2];

  const segments = restOfPath.split(/[\\/]/);
  const encodedSegments = segments
    .filter((s) => s.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join("_");

  const normalizedRest = encodedSegments.replace(/[^a-zA-Z0-9]+/g, "_");
  return `file_${driveLetter}_3A_${normalizedRest}`.replace(/_+/g, "_");
}

/**
 * Normalize Unix/WSL/macOS path to match Language Server workspace_id format.
 *
 * @example
 * normalizeUnixPath("/Users/bob/open source/project")
 * // → "file_Users_bob_open_20source_project"
 */
export function normalizeUnixPath(fsPath: string): string {
  const normalizedSlashes = fsPath.replace(/\\/g, "/");

  const urlEncoded = normalizedSlashes
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  const normalizedPath = urlEncoded
    .replace(/^[^a-zA-Z0-9]+/, "")
    .replace(/[^a-zA-Z0-9]+$/, "")
    .replace(/[^a-zA-Z0-9]+/g, "_");

  return `file_${normalizedPath}`;
}

/**
 * Normalize a filesystem path (Windows drive path or Unix path) into a
 * Language Server workspace_id.
 */
export function normalizePathToWorkspaceId(fsPath: string): string {
  return /^[A-Za-z]:/.test(fsPath)
    ? normalizeWindowsPath(fsPath)
    : normalizeUnixPath(fsPath);
}
