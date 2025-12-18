import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { CacheService } from '../../model/services/cache.service';

suite('CacheService Test Suite', () => {
    let tempDir: string;
    let brainDir: string;
    let conversationsDir: string;
    let contextsDir: string;
    let cacheService: CacheService;

    setup(async () => {
        // Create a temporary directory structure
        tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'antigravity-test-'));
        brainDir = path.join(tempDir, 'brain');
        conversationsDir = path.join(tempDir, 'conversations');
        contextsDir = path.join(tempDir, 'contexts');

        await fs.promises.mkdir(brainDir);
        await fs.promises.mkdir(conversationsDir);
        await fs.promises.mkdir(contextsDir);

        cacheService = new CacheService(brainDir, conversationsDir, contextsDir);
    });

    teardown(async () => {
        // Cleanup
        try {
            await fs.promises.rm(tempDir, { recursive: true, force: true });
        } catch (e) {
            console.error('Failed to cleanup temp dir', e);
        }
    });

    test('should report empty cache initially', async () => {
        const info = await cacheService.getCacheInfo();
        assert.strictEqual(info.totalSize, 0);
        assert.strictEqual(info.brainCount, 0);
        assert.strictEqual(info.conversationsCount, 0);
    });

    test('should calculate cache size correctly', async () => {
        // Create dummy files
        await fs.promises.writeFile(path.join(conversationsDir, '1.json'), 'hello'); // 5 bytes
        await fs.promises.writeFile(path.join(conversationsDir, '2.json'), 'world'); // 5 bytes

        // Brain task structure: brain/task-id/files...
        const taskDir = path.join(brainDir, 'task-1');
        await fs.promises.mkdir(taskDir);
        await fs.promises.writeFile(path.join(taskDir, 'task.md'), '# Test Task'); // 11 bytes

        const info = await cacheService.getCacheInfo();

        assert.strictEqual(info.conversationsCount, 2);
        assert.strictEqual(info.brainCount, 1);

        // Note: Directory sizes might vary by OS, but file content size is consistent
        // We check rough consistency or specific known sizes if logic sums file sizes strictly
        // CacheService uses getDirectorySize which recurses.
        assert.ok(info.conversationsSize >= 10);
        assert.ok(info.brainSize >= 11);
    });

    test('should clean cache keeping newest 5 brain tasks', async () => {
        // Create 7 brain task directories
        for (let i = 1; i <= 7; i++) {
            const taskDir = path.join(brainDir, `task-${i}`);
            await fs.promises.mkdir(taskDir);
            await fs.promises.writeFile(path.join(taskDir, 'file'), `data-${i}`);
            await fs.promises.writeFile(path.join(conversationsDir, `task-${i}.pb`), `conv-${i}`);

            // Ensure timestamp diff
            await new Promise(r => setTimeout(r, 10));
        }

        let info = await cacheService.getCacheInfo();
        assert.strictEqual(info.brainCount, 7);

        // Clean to keep 5
        const deletedCount = await cacheService.cleanCache(5);

        info = await cacheService.getCacheInfo();
        assert.strictEqual(deletedCount, 2);
        assert.strictEqual(info.brainCount, 5);
    });
});
