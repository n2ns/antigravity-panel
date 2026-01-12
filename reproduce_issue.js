
// Mock vscode module for standalone execution
const vscode = {
    workspace: {
        workspaceFolders: []
    }
};

// --- Copy of normalizeWindowsPath from src/shared/utils/workspace_id.ts ---
function normalizeWindowsPath(path) {
    // Split into drive and rest: "V:\DevSpace\daisy-box" → ["V:", "DevSpace\daisy-box"]
    const driveMatch = path.match(/^([A-Za-z]):(.*)/);
    if (!driveMatch) {
        return "fallback_path"; // Simplification for test
    }

    const driveLetter = driveMatch[1].toLowerCase();  // V → v
    const restOfPath = driveMatch[2];                 // \DevSpace\daisy-box

    const normalizedRest = restOfPath
        .replace(/\\/g, "_")           // Backslash → underscore
        .replace(/[^a-zA-Z0-9_.-]/g, "_") // Other special chars → underscore (keep . and -)
        .replace(/^_+/, "");            // Strip leading underscores

    // Combine: file_ + driveLetter + _3A_ + rest
    return `file_${driveLetter}_3A_${normalizedRest}`;
}

// --- Copy of normalizeUnixPath from src/shared/utils/workspace_id.ts ---
function normalizeUnixPath(path) {
    const normalizedSlashes = path.replace(/\\/g, '/');
    const urlEncoded = normalizedSlashes
        .split('/')
        .map(segment => encodeURIComponent(segment))
        .join('/');

    const normalizedPath = urlEncoded
        .replace(/^[^a-zA-Z0-9]+/, "")
        .replace(/[^a-zA-Z0-9]+$/, "")
        .replace(/[^a-zA-Z0-9]/g, "_");

    return `file_${normalizedPath}`;
}

// --- Test Cases ---
const testPaths = [
    // Standard path
    "C:\\Users\\Deploy\\Projects\\MyApp",
    // Path with dots (Potential culprit for Issue #40)
    "C:\\Users\\Deploy\\Projects\\My.App.v2",
    // Path with spaces
    "C:\\Users\\Deploy\\Projects\\My App",
    // Path with mixed case drive
    "D:\\Data\\Project",
    // Path with hyphens
    "C:\\Users\\Deploy\\my-project",
    // Path with underscores
    "C:\\Users\\Deploy\\my_project"
];

console.log("--- Windows Path Normalization Tests ---");
testPaths.forEach(p => {
    const id = normalizeWindowsPath(p);
    console.log(`Path: "${p}"`);
    console.log(`ID:   "${id}"`);

    // Test compliance with platform_strategies.ts regex: ([a-zA-Z0-9\-_.]+)
    // Note: The regex ALLOWS dots (.), but normalizeWindowsPath REPLACES them with (_)
    const regex = /^[a-zA-Z0-9\-_.]+$/;
    console.log(`Matches Regex? ${regex.test(id)}`);
    console.log(`Original has dot? ${p.includes('.')}`);
    console.log(`Result has dot? ${id.includes('.')}`);
    console.log("---");
});
