import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Reads product identity from the current extension host's product.json.
 * vscode.version only exposes the VS Code base version, not the product identity.
 * Missing fields remain undefined; an unreadable file returns no product fields.
 */
export function getIdeProductInfo(appRoot: string, readFile: (p: string) => string = (p) => fs.readFileSync(p, 'utf8')): {
    productName?: string;
    applicationName?: string;
    productVersion?: string;
} {
    try {
        const product = JSON.parse(readFile(path.join(appRoot, 'product.json')));
        return {
            productName: typeof product.nameLong === 'string' ? product.nameLong : undefined,
            applicationName: typeof product.applicationName === 'string' ? product.applicationName : undefined,
            productVersion: typeof product.ideVersion === 'string' ? product.ideVersion : undefined,
        };
    } catch {
        return {};
    }
}

/**
 * Gets a human-readable OS version string, especially for Windows 10/11 and Linux distros.
 */
export function getDetailedOSVersion(): string {
    const platform = process.platform;
    const release = os.release();
    const arch = process.arch;

    if (platform === 'win32') {
        const build = parseInt(release.split('.')[2], 10);
        if (build >= 22000) {
            return `Windows 11 Build ${build} (${arch})`;
        } else if (build >= 10240) {
            return `Windows 10 Build ${build} (${arch})`;
        } else if (build >= 9200) {
            return `Windows 8.1/8 Build ${build} (${arch})`;
        }
        return `Windows (Build ${release}) (${arch})`;
    } else if (platform === 'darwin') {
        const major = parseInt(release.split('.')[0], 10);
        const versionMap: Record<number, string> = {
            24: 'macOS 15 Sequoia',
            23: 'macOS 14 Sonoma',
            22: 'macOS 13 Ventura',
            21: 'macOS 12 Monterey',
            20: 'macOS 11 Big Sur',
            19: 'macOS 10.15 Catalina',
            18: 'macOS 10.14 Mojave'
        };
        const name = versionMap[major] || `macOS (Darwin ${release})`;
        return `${name} (${arch})`;
    } else if (platform === 'linux') {
        try {
            // Try to get distro name from /etc/os-release (Standard on most modern distros)
            if (fs.existsSync('/etc/os-release')) {
                const content = fs.readFileSync('/etc/os-release', 'utf8');
                const prettyNameMatch = content.match(/^PRETTY_NAME="?([^"\n]+)"?/m);
                if (prettyNameMatch) {
                    return `${prettyNameMatch[1]} (Kernel ${release}, ${arch})`;
                }
            }
        } catch {
            // Silent fallback
        }
        return `Linux ${release} (${arch})`;
    }

    return `${platform} ${release} (${arch})`;
}
