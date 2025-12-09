import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { CacheManager } from '../../core/cache_manager';

suite('CacheManager Test Suite', () => {
    let tempDir: string;
    let brainDir: string;
    let conversationsDir: string;
    let cacheManager: CacheManager;

    setup(async () => {
        // Create a temporary directory structure
        tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'antigravity-test-'));
        brainDir = path.join(tempDir, 'brain');
        conversationsDir = path.join(tempDir, 'conversations');

        await fs.promises.mkdir(brainDir);
        await fs.promises.mkdir(conversationsDir);

        cacheManager = new CacheManager(brainDir, conversationsDir);
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
        const info = await cacheManager.getCacheInfo();
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
        
        const info = await cacheManager.getCacheInfo();
        
        assert.strictEqual(info.conversationsCount, 2);
        assert.strictEqual(info.brainCount, 1);
        assert.strictEqual(info.conversationsSize, 10);
        assert.strictEqual(info.brainSize, 11);
        assert.strictEqual(info.totalSize, 21);
    });

    test('should extract simplified task label from task.md', async () => {
        const taskDir = path.join(brainDir, 'task-label');
        await fs.promises.mkdir(taskDir);
        await fs.promises.writeFile(path.join(taskDir, 'task.md'), '# My Feature\nDescription here');

        const info = await cacheManager.getCacheInfo();
        assert.strictEqual(info.brainTasks.length, 1);
        assert.strictEqual(info.brainTasks[0].label, 'My Feature');
    });

    test('should clean cache', async () => {
        // Create some data
        await fs.promises.writeFile(path.join(conversationsDir, '1.json'), 'data');
        const taskDir = path.join(brainDir, 'task-1');
        await fs.promises.mkdir(taskDir);
        await fs.promises.writeFile(path.join(taskDir, 'file'), 'data');

        // Verify data exists
        let info = await cacheManager.getCacheInfo();
        assert.ok(info.totalSize > 0);

        // Clean
        await cacheManager.clean();

        // Verify empty
        info = await cacheManager.getCacheInfo();
        assert.strictEqual(info.totalSize, 0);
        assert.strictEqual(info.brainCount, 0);
        assert.strictEqual(info.conversationsCount, 0);
        
        // Verify directories still exist (optional, but clean usually keeps the root dirs or they are recreated)
        // cleanDirectory implementation: removes children, not the dir itself unless 'rm' is on parent.
        // Implementation check:
        // for (const entry of entries) { await fs.promises.rm(fullPath, ...); }
        // So root dirs should stay.
        assert.strictEqual(fs.existsSync(brainDir), true);
        assert.strictEqual(fs.existsSync(conversationsDir), true);
    });
});
