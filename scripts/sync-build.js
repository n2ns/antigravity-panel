const fs = require('fs');
const path = require('path');

/**
 * sync-build.js
 * Automatically copies the latest .vsix file to the Windows artifact directory.
 */

// Target Windows path in WSL (D:\_Artifacts\vscode -> /mnt/d/_Artifacts/vscode)
const WINDOWS_BASE_PATH = '/mnt/d/_Artifacts/vscode';
const TARGET_SUBDIR = 'Toolkit-for-Antigravity';
const FULL_TARGET_PATH = path.join(WINDOWS_BASE_PATH, TARGET_SUBDIR);

async function sync() {
    console.log('📦 Starting build artifact synchronization...');

    // 1. Find the latest .vsix in the project root
    const files = fs.readdirSync(process.cwd());
    const vsixFiles = files
        .filter(f => f.endsWith('.vsix'))
        .sort((a, b) => fs.statSync(b).mtime - fs.statSync(a).mtime);

    if (vsixFiles.length === 0) {
        console.log('⚠️ No .vsix files found in the current directory. Skipping sync.');
        return;
    }

    const latestVsix = vsixFiles[0];
    console.log(`🔍 Found latest artifact: ${latestVsix}`);

    // 2. Check if the D: drive mount exists
    if (!fs.existsSync(WINDOWS_BASE_PATH)) {
        console.log(`ℹ️ Windows path ${WINDOWS_BASE_PATH} not found. Sync skipped (likely not in WSL or drive not mounted).`);
        return;
    }

    // 3. Create target directory if it doesn't exist
    if (!fs.existsSync(FULL_TARGET_PATH)) {
        console.log(`📁 Creating target directory: ${FULL_TARGET_PATH}`);
        fs.mkdirSync(FULL_TARGET_PATH, { recursive: true });
    }

    // 4. Copy the file
    const destFile = path.join(FULL_TARGET_PATH, latestVsix);
    console.log(`🚚 Copying ${latestVsix} to ${destFile}...`);

    try {
        fs.copyFileSync(latestVsix, destFile);
        console.log('✅ Sync completed successfully!');
    } catch (err) {
        console.error('❌ Error during copy:', err.message);
    }
}

sync();
