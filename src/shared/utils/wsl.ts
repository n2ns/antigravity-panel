import * as fs from 'fs';

/**
 * Detects if the current environment is WSL.
 * @param platformOverride Optional platform string for testing
 * @param versionReader Optional function to read /proc/version for testing
 */
export function isWsl(
    platformOverride?: string,
    versionReader?: () => string
): boolean {
    const platform = platformOverride || process.platform;
    if (platform !== 'linux') {
        return false;
    }
    try {
        const reader = versionReader || (() => fs.readFileSync('/proc/version', 'utf8'));
        const version = reader().toLowerCase();
        return version.includes('microsoft') || version.includes('wsl');
    } catch {
        return false;
    }
}

/**
 * Parses /etc/resolv.conf to find the Windows host IP (nameserver).
 * This is used in NAT mode to reach services on the host.
 * @param resolvReader Optional function to read /etc/resolv.conf for testing
 */
export function getWslHostIp(resolvReader?: () => string): string | null {
    try {
        const reader = resolvReader || (() => fs.readFileSync('/etc/resolv.conf', 'utf8'));
        const resolvConf = reader();
        const match = resolvConf.match(/^nameserver\s+([0-9.]+)/m);
        const nameserver = match ? match[1] : null;

        // 10.255.255.254 is the DNS resolver address in WSL2 Mirrored Networking Mode,
        // NOT a valid Host IP for connecting to Windows services.
        // In mirrored mode, 127.0.0.1 directly routes to the Windows loopback adapter.
        // See: https://learn.microsoft.com/en-us/windows/wsl/networking#mirrored-mode-networking
        if (nameserver === '10.255.255.254') {
            return null;
        }

        return nameserver;
    } catch {
        return null;
    }
}
