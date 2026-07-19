import * as assert from 'assert';
import * as os from 'os';
import * as path from 'path';
import {
    resolveConfigTargets,
    resolveRulesFile,
    findWindowsGeminiRootFromWsl,
    findWslGeminiRootFromWindows,
    getWslAutomountRoot,
    parseWslDistro,
    FsDeps
} from '../../shared/utils/config_targets';

function fakeFs(
    entries: Record<string, string[]>,
    existing: string[],
    files: Record<string, string> = {}
): FsDeps {
    const existingSet = new Set(existing);
    return {
        readdir: (dir: string) => {
            const found = entries[dir];
            if (!found) { throw new Error(`ENOENT: ${dir}`); }
            return found;
        },
        exists: (p: string) => existingSet.has(p),
        readFile: (p: string) => {
            const content = files[p];
            if (content === undefined) { throw new Error(`ENOENT: ${p}`); }
            return content;
        }
    };
}

suite('Config Targets Test Suite', () => {
    const homeDir = os.homedir();
    const localRules = path.join(homeDir, '.gemini', 'GEMINI.md');
    const localMcp = path.join(homeDir, '.gemini', 'config', 'mcp_config.json');
    const localAllowlist = path.join(homeDir, '.gemini', 'config', 'browserAllowlist.txt');

    test('parseWslDistro should extract distro from authority', () => {
        assert.strictEqual(parseWslDistro('wsl+Ubuntu'), 'Ubuntu');
        assert.strictEqual(parseWslDistro('WSL+Ubuntu-22.04'), 'Ubuntu-22.04');
        assert.strictEqual(parseWslDistro('ssh-remote+myhost'), null);
        assert.strictEqual(parseWslDistro(undefined), null);
        assert.strictEqual(parseWslDistro('wsl+'), null);
    });

    test('getWslAutomountRoot should default to /mnt without wsl.conf', () => {
        assert.strictEqual(getWslAutomountRoot(fakeFs({}, [])), '/mnt');
    });

    test('getWslAutomountRoot should honor [automount] root overrides', () => {
        const conf = '[automount]\nenabled = true\nroot = /custom/\n\n[user]\ndefault=deploy\n';
        const deps = fakeFs({}, [], { '/etc/wsl.conf': conf });
        assert.strictEqual(getWslAutomountRoot(deps), '/custom');
    });

    test('getWslAutomountRoot should ignore invalid root values', () => {
        const deps = fakeFs({}, [], { '/etc/wsl.conf': '[automount]\nroot = relative/path\n' });
        assert.strictEqual(getWslAutomountRoot(deps), '/mnt');
    });

    test('getWslAutomountRoot should ignore root keys outside the [automount] section', () => {
        const otherSection = fakeFs({}, [], { '/etc/wsl.conf': '[user]\nroot = /elsewhere\n' });
        assert.strictEqual(getWslAutomountRoot(otherSection), '/mnt');

        const beforeAnySection = fakeFs({}, [], { '/etc/wsl.conf': 'root = /elsewhere\n[automount]\nenabled = true\n' });
        assert.strictEqual(getWslAutomountRoot(beforeAnySection), '/mnt');

        const afterOtherSection = fakeFs({}, [], { '/etc/wsl.conf': '[network]\nroot = /bogus\n[automount]\nroot = /real\n' });
        assert.strictEqual(getWslAutomountRoot(afterOtherSection), '/real');
    });

    test('getWslAutomountRoot should keep filesystem root when root = /', () => {
        const deps = fakeFs({}, [], { '/etc/wsl.conf': '[automount]\nroot = /\n' });
        assert.strictEqual(getWslAutomountRoot(deps), '/');
    });

    test('getWslAutomountRoot should handle quoted paths with spaces and trailing comments', () => {
        const quoted = fakeFs({}, [], { '/etc/wsl.conf': '[automount]\nroot = "/my mount/"\n' });
        assert.strictEqual(getWslAutomountRoot(quoted), '/my mount');

        const commented = fakeFs({}, [], { '/etc/wsl.conf': '[automount]\nroot = /custom # drive mounts\n' });
        assert.strictEqual(getWslAutomountRoot(commented), '/custom');
    });

    test('findWindowsGeminiRootFromWsl should scan drives mounted at filesystem root', () => {
        const deps = fakeFs(
            { '/': ['c', 'etc', 'home'], '/c/Users': ['James'] },
            ['/c/Users/James/.gemini', '/c/Users/James/.gemini/config'],
            { '/etc/wsl.conf': '[automount]\nroot = /\n' }
        );
        assert.strictEqual(findWindowsGeminiRootFromWsl(deps), '/c/Users/James/.gemini');
    });

    test('findWindowsGeminiRootFromWsl should skip system profiles and prefer profile with config dir', () => {
        const deps = fakeFs(
            {
                '/mnt': ['c'],
                '/mnt/c/Users': ['All Users', 'Default', 'Public', 'Alice', 'Bob']
            },
            [
                '/mnt/c/Users/Alice/.gemini',
                '/mnt/c/Users/Bob/.gemini',
                '/mnt/c/Users/Bob/.gemini/config'
            ]
        );
        assert.strictEqual(findWindowsGeminiRootFromWsl(deps), '/mnt/c/Users/Bob/.gemini');
    });

    test('findWindowsGeminiRootFromWsl should prefer the profile that already has an allowlist', () => {
        const deps = fakeFs(
            { '/mnt': ['c'], '/mnt/c/Users': ['Alice', 'Bob'] },
            [
                '/mnt/c/Users/Alice/.gemini',
                '/mnt/c/Users/Alice/.gemini/config',
                '/mnt/c/Users/Bob/.gemini',
                '/mnt/c/Users/Bob/.gemini/config',
                '/mnt/c/Users/Bob/.gemini/config/browserAllowlist.txt'
            ]
        );
        assert.strictEqual(findWindowsGeminiRootFromWsl(deps), '/mnt/c/Users/Bob/.gemini');
    });

    test('findWindowsGeminiRootFromWsl should scan non-C drives and custom automount roots', () => {
        const conf = '[automount]\nroot = /win\n';
        const deps = fakeFs(
            {
                '/win': ['c', 'd'],
                '/win/c/Users': ['Alice'],
                '/win/d/Users': ['James']
            },
            ['/win/d/Users/James/.gemini', '/win/d/Users/James/.gemini/config'],
            { '/etc/wsl.conf': conf }
        );
        assert.strictEqual(findWindowsGeminiRootFromWsl(deps), '/win/d/Users/James/.gemini');
    });

    test('findWindowsGeminiRootFromWsl should return null when no .gemini exists', () => {
        const deps = fakeFs({ '/mnt': ['c'], '/mnt/c/Users': ['Alice'] }, []);
        assert.strictEqual(findWindowsGeminiRootFromWsl(deps), null);
    });

    test('findWindowsGeminiRootFromWsl should return null when mount is missing', () => {
        const deps = fakeFs({}, []);
        assert.strictEqual(findWindowsGeminiRootFromWsl(deps), null);
    });

    test('findWslGeminiRootFromWindows should find .gemini under UNC home', () => {
        const deps = fakeFs(
            { '\\\\wsl.localhost\\Ubuntu\\home': ['deploy'] },
            [
                '\\\\wsl.localhost\\Ubuntu\\home\\deploy\\.gemini',
                '\\\\wsl.localhost\\Ubuntu\\home\\deploy\\.gemini\\config'
            ]
        );
        assert.strictEqual(
            findWslGeminiRootFromWindows('Ubuntu', deps),
            '\\\\wsl.localhost\\Ubuntu\\home\\deploy\\.gemini'
        );
    });

    test('findWslGeminiRootFromWindows should prefer the home that already has an MCP config', () => {
        const deps = fakeFs(
            { '\\\\wsl.localhost\\Ubuntu\\home': ['alice', 'deploy'] },
            [
                '\\\\wsl.localhost\\Ubuntu\\home\\alice\\.gemini',
                '\\\\wsl.localhost\\Ubuntu\\home\\alice\\.gemini\\config',
                '\\\\wsl.localhost\\Ubuntu\\home\\deploy\\.gemini',
                '\\\\wsl.localhost\\Ubuntu\\home\\deploy\\.gemini\\config',
                '\\\\wsl.localhost\\Ubuntu\\home\\deploy\\.gemini\\config\\mcp_config.json'
            ]
        );
        assert.strictEqual(
            findWslGeminiRootFromWindows('Ubuntu', deps),
            '\\\\wsl.localhost\\Ubuntu\\home\\deploy\\.gemini'
        );
    });

    test('findWslGeminiRootFromWindows should fall back to legacy wsl$ share on older Windows', () => {
        const deps = fakeFs(
            { '\\\\wsl$\\Ubuntu\\home': ['deploy'] },
            ['\\\\wsl$\\Ubuntu\\home\\deploy\\.gemini']
        );
        assert.strictEqual(
            findWslGeminiRootFromWindows('Ubuntu', deps),
            '\\\\wsl$\\Ubuntu\\home\\deploy\\.gemini'
        );
    });

    test('findWslGeminiRootFromWindows should not rescan via wsl$ when wsl.localhost is reachable', () => {
        // Both shares expose the same filesystem: a reachable-but-empty modern
        // share must terminate the search instead of falling through.
        const deps = fakeFs(
            {
                '\\\\wsl.localhost\\Ubuntu\\home': ['deploy'],
                '\\\\wsl$\\Ubuntu\\home': ['deploy']
            },
            ['\\\\wsl$\\Ubuntu\\home\\deploy\\.gemini']
        );
        assert.strictEqual(findWslGeminiRootFromWindows('Ubuntu', deps), null);
    });

    test('findWslGeminiRootFromWindows should fall back to root home', () => {
        const deps = fakeFs(
            { '\\\\wsl.localhost\\Ubuntu\\home': [] },
            ['\\\\wsl.localhost\\Ubuntu\\root\\.gemini']
        );
        assert.strictEqual(
            findWslGeminiRootFromWindows('Ubuntu', deps),
            '\\\\wsl.localhost\\Ubuntu\\root\\.gemini'
        );
    });

    test('resolveRulesFile should prefer 2.x config/AGENTS.md, then legacy GEMINI.md, then AGENTS.md', () => {
        const root = '/home/deploy/.gemini';
        const all = fakeFs({}, [
            '/home/deploy/.gemini/config/AGENTS.md',
            '/home/deploy/.gemini/GEMINI.md',
            '/home/deploy/.gemini/AGENTS.md'
        ]);
        assert.strictEqual(resolveRulesFile(root, path.posix.join, all), '/home/deploy/.gemini/config/AGENTS.md');

        const legacyOnly = fakeFs({}, ['/home/deploy/.gemini/GEMINI.md']);
        assert.strictEqual(resolveRulesFile(root, path.posix.join, legacyOnly), '/home/deploy/.gemini/GEMINI.md');

        const crossToolOnly = fakeFs({}, ['/home/deploy/.gemini/AGENTS.md']);
        assert.strictEqual(resolveRulesFile(root, path.posix.join, crossToolOnly), '/home/deploy/.gemini/AGENTS.md');

        const none = fakeFs({}, []);
        assert.strictEqual(resolveRulesFile(root, path.posix.join, none), '/home/deploy/.gemini/GEMINI.md');
    });

    test('non-WSL environments should keep local paths for all targets', () => {
        const deps = fakeFs({}, []);
        for (const platform of ['win32', 'darwin', 'linux'] as NodeJS.Platform[]) {
            const targets = resolveConfigTargets({}, deps, platform, () => false);
            assert.strictEqual(targets.rules, localRules);
            assert.strictEqual(targets.mcp, localMcp);
            assert.strictEqual(targets.allowlist, localAllowlist);
        }
    });

    test('extension inside WSL should keep rules/mcp local but point allowlist to Windows side', () => {
        const deps = fakeFs(
            { '/mnt': ['c'], '/mnt/c/Users': ['James'] },
            ['/mnt/c/Users/James/.gemini', '/mnt/c/Users/James/.gemini/config']
        );
        const targets = resolveConfigTargets({}, deps, 'linux', () => true);
        assert.strictEqual(targets.rules, localRules);
        assert.strictEqual(targets.mcp, localMcp);
        assert.strictEqual(targets.allowlist, '/mnt/c/Users/James/.gemini/config/browserAllowlist.txt');
    });

    test('extension inside WSL should open local 2.x config/AGENTS.md rules when present', () => {
        const newRules = path.join(homeDir, '.gemini', 'config', 'AGENTS.md');
        const deps = fakeFs({ '/mnt': [] }, [newRules]);
        const targets = resolveConfigTargets({}, deps, 'linux', () => true);
        assert.strictEqual(targets.rules, newRules);
    });

    test('extension inside WSL should fall back to local allowlist when Windows side is missing', () => {
        const deps = fakeFs({}, []);
        const targets = resolveConfigTargets({}, deps, 'linux', () => true);
        assert.strictEqual(targets.allowlist, localAllowlist);
    });

    test('Windows UI host with WSL remote should point rules/mcp to WSL side', () => {
        const deps = fakeFs(
            { '\\\\wsl.localhost\\Ubuntu\\home': ['deploy'] },
            [
                '\\\\wsl.localhost\\Ubuntu\\home\\deploy\\.gemini',
                '\\\\wsl.localhost\\Ubuntu\\home\\deploy\\.gemini\\config'
            ]
        );
        const targets = resolveConfigTargets(
            { remoteName: 'wsl', remoteAuthority: 'wsl+Ubuntu' },
            deps,
            'win32',
            () => false
        );
        assert.strictEqual(targets.rules, '\\\\wsl.localhost\\Ubuntu\\home\\deploy\\.gemini\\GEMINI.md');
        assert.strictEqual(targets.mcp, '\\\\wsl.localhost\\Ubuntu\\home\\deploy\\.gemini\\config\\mcp_config.json');
        assert.strictEqual(targets.allowlist, localAllowlist);
    });

    test('Windows UI host with WSL remote should open WSL-side config/AGENTS.md rules when present', () => {
        const deps = fakeFs(
            { '\\\\wsl.localhost\\Ubuntu\\home': ['deploy'] },
            [
                '\\\\wsl.localhost\\Ubuntu\\home\\deploy\\.gemini',
                '\\\\wsl.localhost\\Ubuntu\\home\\deploy\\.gemini\\config',
                '\\\\wsl.localhost\\Ubuntu\\home\\deploy\\.gemini\\config\\AGENTS.md'
            ]
        );
        const targets = resolveConfigTargets(
            { remoteName: 'wsl', remoteAuthority: 'wsl+Ubuntu' },
            deps,
            'win32',
            () => false
        );
        assert.strictEqual(targets.rules, '\\\\wsl.localhost\\Ubuntu\\home\\deploy\\.gemini\\config\\AGENTS.md');
    });

    test('Windows UI host with WSL remote should fall back to local paths when WSL home is unreachable', () => {
        const deps = fakeFs({}, []);
        const targets = resolveConfigTargets(
            { remoteName: 'wsl', remoteAuthority: 'wsl+Ubuntu' },
            deps,
            'win32',
            () => false
        );
        assert.strictEqual(targets.rules, localRules);
        assert.strictEqual(targets.mcp, localMcp);
        assert.strictEqual(targets.allowlist, localAllowlist);
    });
});
