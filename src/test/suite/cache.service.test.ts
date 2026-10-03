import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as sinon from 'sinon';
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
        // Production layout: code contexts live in the conversations directory
        contextsDir = conversationsDir;

        await fs.promises.mkdir(brainDir);
        await fs.promises.mkdir(conversationsDir);

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
        assert.deepStrictEqual(info.brainTasks, []);
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

        assert.strictEqual(info.brainTasks.length, 1);

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
        assert.strictEqual(info.brainTasks.length, 7);

        // Clean to keep 5
        const result = await cacheService.cleanCache(5);

        info = await cacheService.getCacheInfo();
        assert.strictEqual(result.deletedCount, 2);
        assert.ok(result.freedBytes > 0); // Should have freed some bytes
        const keptTasks = ['task-3', 'task-4', 'task-5', 'task-6', 'task-7'];
        assert.deepStrictEqual(info.brainTasks.map(task => task.id).sort(), keptTasks);
        assert.deepStrictEqual((await fs.promises.readdir(conversationsDir)).sort(), keptTasks.map(id => `${id}.pb`));
    });

    test('deleteContext should only delete exact context basename matches', async () => {
        await fs.promises.writeFile(path.join(contextsDir, 'abc.db'), 'abc-db');
        await fs.promises.writeFile(path.join(contextsDir, 'abc.db-wal'), 'abc-wal');
        await fs.promises.writeFile(path.join(contextsDir, 'abc2.db'), 'abc2-db');
        await fs.promises.writeFile(path.join(contextsDir, 'abc-extra.pb'), 'abc-extra');

        await cacheService.deleteContext('abc');

        await assert.rejects(fs.promises.access(path.join(contextsDir, 'abc.db')));
        await assert.rejects(fs.promises.access(path.join(contextsDir, 'abc.db-wal')));
        await assert.doesNotReject(fs.promises.access(path.join(contextsDir, 'abc2.db')));
        await assert.doesNotReject(fs.promises.access(path.join(contextsDir, 'abc-extra.pb')));
    });

    suite('cleanCache selection', () => {
        // Fixed past base time (seconds) so mtimes are fully controlled by the tests
        const base = Math.floor(Date.now() / 1000) - 100000;

        async function setMtime(p: string, offsetSec: number): Promise<void> {
            await fs.promises.utimes(p, base + offsetSec, base + offsetSec);
        }

        /** Brain task with a top-level and a nested file, both at the given activity time */
        async function makeTask(id: string, activitySec: number): Promise<void> {
            const taskDir = path.join(brainDir, id);
            await fs.promises.mkdir(path.join(taskDir, 'nested'), { recursive: true });
            await fs.promises.writeFile(path.join(taskDir, 'task.md'), `# ${id}`);
            await fs.promises.writeFile(path.join(taskDir, 'nested', 'notes.md'), `notes-${id}`);
            await setMtime(path.join(taskDir, 'task.md'), activitySec - 10);
            await setMtime(path.join(taskDir, 'nested', 'notes.md'), activitySec);
        }

        async function makePb(id: string, mtimeSec: number): Promise<void> {
            const pbPath = path.join(conversationsDir, `${id}.pb`);
            await fs.promises.writeFile(pbPath, `conv-${id}`);
            await setMtime(pbPath, mtimeSec);
        }

        async function exists(p: string): Promise<boolean> {
            return fs.promises.access(p).then(() => true, () => false);
        }

        async function listAll(dir: string): Promise<string[]> {
            const out: string[] = [];
            for (const entry of await fs.promises.readdir(dir, { withFileTypes: true })) {
                const full = path.join(dir, entry.name);
                out.push(full);
                if (entry.isDirectory()) out.push(...await listAll(full));
            }
            return out;
        }

        test('keeps a recent conversation-only .pb within keepCount orphans', async () => {
            await makeTask('task-a', 1000);
            await makePb('task-a', 1000);
            await makeTask('task-b', 1100);
            await makePb('task-b', 1100);
            // Orphans: older than both task .pb files
            await makePb('orphan-recent', 900);
            await makePb('orphan-mid', 800);
            await makePb('orphan-old', 700);
            // Non-.pb context files are never touched
            await fs.promises.writeFile(path.join(conversationsDir, 'orphan-old.db'), 'db');

            const result = await cacheService.cleanCache(2);

            assert.strictEqual(result.deletedCount, 0);
            assert.strictEqual(result.deletedConversationCount, 1);
            assert.ok(await exists(path.join(conversationsDir, 'orphan-recent.pb')));
            assert.ok(await exists(path.join(conversationsDir, 'orphan-mid.pb')));
            assert.ok(!await exists(path.join(conversationsDir, 'orphan-old.pb')));
            assert.ok(await exists(path.join(conversationsDir, 'orphan-old.db')));
            assert.ok(await exists(path.join(conversationsDir, 'task-a.pb')));
            assert.ok(await exists(path.join(conversationsDir, 'task-b.pb')));
        });

        test('never deletes the .pb of a kept task even if older than many orphans', async () => {
            await makeTask('task-a', 5000);
            await makePb('task-a', 10);
            await makeTask('task-b', 5100);
            await makePb('task-b', 20);
            for (let i = 1; i <= 5; i++) {
                await makePb(`orphan-${i}`, 1000 + i);
            }

            const result = await cacheService.cleanCache(2);

            assert.strictEqual(result.deletedCount, 0);
            assert.strictEqual(result.failedCount, 0);
            assert.ok(await exists(path.join(conversationsDir, 'task-a.pb')));
            assert.ok(await exists(path.join(conversationsDir, 'task-b.pb')));
            const remainingOrphans = (await fs.promises.readdir(conversationsDir)).filter(n => n.startsWith('orphan-')).sort();
            assert.deepStrictEqual(remainingOrphans, ['orphan-4.pb', 'orphan-5.pb']);
            assert.strictEqual(result.deletedConversationCount, 3);
        });

        test('keeps the most recently active tasks, not the most recently created', async () => {
            // Created in order a, b, c, d; activity order is the reverse
            const activity: Record<string, number> = { 'task-a': 4000, 'task-b': 3000, 'task-c': 200, 'task-d': 100 };
            for (const id of Object.keys(activity)) {
                await makeTask(id, activity[id]);
                await new Promise(r => setTimeout(r, 15));
            }
            // task-d's .pb is old too; task-c only shows activity through its .pb
            await makePb('task-c', 300);
            await makePb('task-d', 150);

            const displayOrder = (await cacheService.getBrainTasks()).map(t => t.id);
            assert.deepStrictEqual(displayOrder, ['task-d', 'task-c', 'task-b', 'task-a'], 'display order stays newest-created first');

            const result = await cacheService.cleanCache(2);

            assert.strictEqual(result.deletedCount, 2);
            assert.deepStrictEqual((await fs.promises.readdir(brainDir)).sort(), ['task-a', 'task-b']);
            assert.deepStrictEqual(await fs.promises.readdir(conversationsDir), []);
            assert.deepStrictEqual((await cacheService.getBrainTasks()).map(t => t.id), ['task-b', 'task-a']);
        });

        test('task activity counts its conversation .pb', async () => {
            await makeTask('task-a', 100);
            await makePb('task-a', 9000); // recently used conversation, stale brain files
            await makeTask('task-b', 500);
            await makeTask('task-c', 400);

            const plan = await cacheService.getCleanPlan(2);

            assert.deepStrictEqual(plan.tasks.map(t => t.id), ['task-c']);
        });

        test('task activity counts its conversation .db / .db-wal', async () => {
            await makeTask('task-a', 100); // oldest brain files
            const dbPath = path.join(conversationsDir, 'task-a.db');
            const walPath = path.join(conversationsDir, 'task-a.db-wal');
            await fs.promises.writeFile(dbPath, 'db');
            await setMtime(dbPath, 100);
            await fs.promises.writeFile(walPath, 'wal');
            await setMtime(walPath, 9000); // newest: the conversation is in use
            await makeTask('task-b', 500);
            await makeTask('task-c', 400);
            await makeTask('task-d', 300);

            const plan = await cacheService.getCleanPlan(2);

            assert.ok(!plan.tasks.some(t => t.id === 'task-a'));
            assert.deepStrictEqual(plan.tasks.map(t => t.id), ['task-c', 'task-d']);
            const plannedFiles = [...plan.tasks.flatMap(t => t.conversation ? [t.conversation.path] : []), ...plan.orphanConversations.map(f => f.path)];
            assert.ok(!plannedFiles.includes(dbPath) && !plannedFiles.includes(walPath));

            await cacheService.executeCleanPlan(plan);

            assert.ok(await exists(dbPath));
            assert.ok(await exists(walPath));
        });

        test('plan matches actual deletion exactly', async () => {
            await makeTask('task-a', 1000);
            await makePb('task-a', 1000);
            await makeTask('task-b', 900);
            await makeTask('task-c', 800);
            await makePb('task-c', 800);
            await makeTask('task-d', 700);
            await makePb('task-d', 700);
            await makePb('orphan-1', 600);
            await makePb('orphan-2', 500);
            await makePb('orphan-3', 400);
            await fs.promises.writeFile(path.join(conversationsDir, 'task-d.db'), 'db');
            await setMtime(path.join(conversationsDir, 'task-d.db'), 700); // .db counts as activity

            const plan = await cacheService.getCleanPlan(2);
            assert.deepStrictEqual(plan.tasks.map(t => t.id), ['task-c', 'task-d']);
            assert.deepStrictEqual(plan.orphanConversations.map(f => path.basename(f.path)), ['orphan-3.pb']);
            assert.strictEqual(plan.conversationFileCount, 3);

            const planned = new Set<string>([
                ...plan.tasks.map(t => path.join(brainDir, t.id)),
                ...plan.tasks.flatMap(t => t.conversation ? [t.conversation.path] : []),
                ...plan.orphanConversations.map(f => f.path),
            ]);
            const before = [...await listAll(brainDir), ...await listAll(conversationsDir)];

            const result = await cacheService.executeCleanPlan(plan);

            const after = new Set([...await listAll(brainDir), ...await listAll(conversationsDir)]);
            const deletedTopLevel = before.filter(p => !after.has(p) && !planned.has(path.dirname(p)) && !planned.has(path.dirname(path.dirname(p))));
            assert.deepStrictEqual(new Set(deletedTopLevel), planned);
            assert.strictEqual(result.deletedCount, plan.tasks.length);
            assert.strictEqual(result.deletedConversationCount, plan.conversationFileCount);
            assert.strictEqual(result.freedBytes, plan.totalBytes);
            assert.strictEqual(result.failedCount, 0);
        });

        test('executeCleanPlan deletes only the plan it is given even if the state changed', async () => {
            await makeTask('task-a', 1000);
            await makePb('task-a', 1000);
            await makeTask('task-b', 900);
            await makeTask('task-c', 800);
            await makePb('task-c', 800);
            await makePb('orphan-1', 600);
            await makePb('orphan-2', 500);
            await makePb('orphan-3', 400);

            const plan = await cacheService.getCleanPlan(2);
            assert.deepStrictEqual(plan.tasks.map(t => t.id), ['task-c']);
            assert.deepStrictEqual(plan.orphanConversations.map(f => path.basename(f.path)), ['orphan-3.pb']);

            // State changes after the plan was confirmed: older entries that a fresh plan would select
            await makeTask('task-e', 10);
            await makePb('task-e', 10);
            await makePb('orphan-old', 5);

            const planned = new Set<string>([
                ...plan.tasks.map(t => path.join(brainDir, t.id)),
                ...plan.tasks.flatMap(t => t.conversation ? [t.conversation.path] : []),
                ...plan.orphanConversations.map(f => f.path),
            ]);
            const before = [...await listAll(brainDir), ...await listAll(conversationsDir)];

            const result = await cacheService.executeCleanPlan(plan);

            const after = new Set([...await listAll(brainDir), ...await listAll(conversationsDir)]);
            const deletedTopLevel = before.filter(p => !after.has(p) && !planned.has(path.dirname(p)) && !planned.has(path.dirname(path.dirname(p))));
            assert.deepStrictEqual(new Set(deletedTopLevel), planned);
            assert.ok(await exists(path.join(brainDir, 'task-e')));
            assert.ok(await exists(path.join(conversationsDir, 'task-e.pb')));
            assert.ok(await exists(path.join(conversationsDir, 'orphan-old.pb')));
            assert.strictEqual(result.deletedCount, plan.tasks.length);
            assert.strictEqual(result.deletedConversationCount, plan.conversationFileCount);
            assert.strictEqual(result.failedCount, 0);
        });

        test('directories with invalid ids are never planned', async () => {
            await makeTask('task-a', 1000);
            await makeTask('task-b', 900);
            await makeTask('bad id', 5000); // space: fails isValidId; the most recently active
            await makeTask('task-c', 5);

            // The invalid directory takes no keep slot
            const planKeepOne = await cacheService.getCleanPlan(1);
            assert.deepStrictEqual(planKeepOne.tasks.map(t => t.id), ['task-b', 'task-c']);

            const plan = await cacheService.getCleanPlan(2);

            assert.deepStrictEqual(plan.tasks.map(t => t.id), ['task-c']);
            const result = await cacheService.executeCleanPlan(plan);
            assert.strictEqual(result.deletedCount, plan.tasks.length);
            assert.strictEqual(result.failedCount, 0);
            assert.ok(await exists(path.join(brainDir, 'bad id')));
        });

        test('executeCleanPlan reports an invalid plan entry as failed', async () => {
            await makeTask('bad id', 10);
            await makeTask('task-a', 10);
            const plan = {
                keepCount: 0,
                tasks: [{ id: 'bad id', size: 1 }, { id: '..', size: 1 }, { id: 'task-a', size: 1 }],
                orphanConversations: [],
                conversationFileCount: 0,
                totalBytes: 3,
            };

            const result = await cacheService.executeCleanPlan(plan);

            assert.strictEqual(result.failedCount, 2);
            assert.strictEqual(result.deletedCount, 1);
            assert.strictEqual(result.freedBytes, 1);
            assert.ok(await exists(path.join(brainDir, 'bad id')));
            assert.ok(await exists(brainDir));
            assert.ok(!await exists(path.join(brainDir, 'task-a')));
        });

        test('executeCleanPlan never deletes an out-of-bounds conversation path', async () => {
            const outside = path.join(brainDir, 'x.pb');
            await fs.promises.writeFile(outside, 'x');
            await makePb('orphan-1', 10);
            const plan = {
                keepCount: 0,
                tasks: [],
                orphanConversations: [
                    { path: `${conversationsDir}${path.sep}..${path.sep}brain${path.sep}x.pb`, size: 1 },
                    { path: path.join(conversationsDir, 'orphan-1.pb'), size: 2 },
                ],
                conversationFileCount: 2,
                totalBytes: 3,
            };

            const result = await cacheService.executeCleanPlan(plan);

            assert.ok(await exists(outside));
            assert.ok(!await exists(path.join(conversationsDir, 'orphan-1.pb')));
            assert.strictEqual(result.failedCount, 1);
            assert.strictEqual(result.deletedConversationCount, 1);
            assert.strictEqual(result.freedBytes, 2);
        });

        test('a task directory already gone is not counted, but its planned .pb is still deleted', async () => {
            await makeTask('task-keep', 1000);
            for (const [id, t] of [['task-x', 300], ['task-y', 200], ['task-z', 100]] as const) {
                await makeTask(id, t);
                await makePb(id, t);
            }
            const plan = await cacheService.getCleanPlan(1);
            assert.deepStrictEqual(plan.tasks.map(t => t.id), ['task-x', 'task-y', 'task-z']);

            await fs.promises.rm(path.join(brainDir, 'task-y'), { recursive: true });
            const result = await cacheService.executeCleanPlan(plan);

            assert.strictEqual(result.deletedCount, plan.tasks.length - 1);
            assert.ok(!await exists(path.join(conversationsDir, 'task-y.pb')));
            assert.strictEqual(result.deletedConversationCount, plan.conversationFileCount);
            assert.strictEqual(result.failedCount, 0);
            const taskY = plan.tasks.find(t => t.id === 'task-y')!;
            assert.strictEqual(result.freedBytes, plan.totalBytes - taskY.size);
        });

        test('a failing task deletion does not stop the others and is reported truthfully', async () => {
            await makeTask('task-keep', 1000);
            for (const [id, t] of [['task-x', 300], ['task-busy', 200], ['task-z', 100]] as const) {
                await makeTask(id, t);
                await makePb(id, t);
            }
            const busyPath = path.join(brainDir, 'task-busy');
            const plan = await cacheService.getCleanPlan(1);
            const expectedFreed = plan.tasks
                .filter(t => t.id !== 'task-busy')
                .reduce((sum, t) => sum + t.size + (t.conversation?.size ?? 0), 0);

            const originalRm = fs.promises.rm;
            const rmStub = sinon.stub(fs.promises, 'rm').callsFake(async (p, options) => {
                if (p === busyPath) {
                    throw Object.assign(new Error('EBUSY: resource busy or locked'), { code: 'EBUSY' });
                }
                return originalRm(p, options);
            });
            let result;
            try {
                result = await cacheService.executeCleanPlan(plan);
            } finally {
                rmStub.restore();
            }

            assert.strictEqual(result.deletedCount, 2);
            assert.strictEqual(result.deletedConversationCount, 2);
            assert.strictEqual(result.failedCount, 1);
            assert.strictEqual(result.freedBytes, expectedFreed);
            assert.ok(await exists(busyPath));
            assert.ok(await exists(path.join(conversationsDir, 'task-busy.pb')), 'the .pb of an undeleted task is kept');
            assert.ok(!await exists(path.join(brainDir, 'task-x')));
            assert.ok(!await exists(path.join(brainDir, 'task-z')));
            assert.ok(await exists(path.join(brainDir, 'task-keep')));
        });

        test('reports an empty plan when there is nothing to delete', async () => {
            await makeTask('task-a', 100);
            await makePb('task-a', 100);
            await makePb('orphan-1', 50);

            const plan = await cacheService.getCleanPlan(5);

            assert.deepStrictEqual(plan.tasks, []);
            assert.deepStrictEqual(plan.orphanConversations, []);
            assert.strictEqual(plan.totalBytes, 0);
        });
    });

    suite('per-entry stat failures', () => {
        let statStub: sinon.SinonStub | undefined;

        teardown(() => {
            statStub?.restore();
            statStub = undefined;
        });

        function failStatFor(failingPath: string): void {
            const realStat = fs.promises.stat.bind(fs.promises);
            statStub = sinon.stub(fs.promises, 'stat').callsFake(((p: fs.PathLike, ...rest: unknown[]) => {
                if (path.resolve(String(p)) === path.resolve(failingPath)) {
                    const err: NodeJS.ErrnoException = new Error(`ENOENT: no such file or directory, stat '${String(p)}'`);
                    err.code = 'ENOENT';
                    return Promise.reject(err);
                }
                return (realStat as (...args: unknown[]) => Promise<fs.Stats>)(p, ...rest);
            }) as typeof fs.promises.stat);
        }

        test('should skip a brain task whose directory vanishes and keep the others', async () => {
            const keptDir = path.join(brainDir, 'task-kept');
            const goneDir = path.join(brainDir, 'task-gone');
            await fs.promises.mkdir(keptDir);
            await fs.promises.mkdir(goneDir);
            await fs.promises.writeFile(path.join(keptDir, 'task.md'), '# Kept');
            await fs.promises.writeFile(path.join(goneDir, 'task.md'), '# Gone');

            failStatFor(goneDir);
            const tasks = await cacheService.getBrainTasks();

            assert.deepStrictEqual(tasks.map(t => t.id), ['task-kept']);
            assert.strictEqual(tasks[0].label, 'Kept');
        });

        test('should skip a file whose stat fails instead of zeroing the directory size', async () => {
            await fs.promises.writeFile(path.join(conversationsDir, 'a.pb'), 'hello'); // 5 bytes
            await fs.promises.writeFile(path.join(conversationsDir, 'b.pb'), 'world!!'); // 7 bytes

            failStatFor(path.join(conversationsDir, 'b.pb'));
            const info = await cacheService.getCacheInfo();

            assert.strictEqual(info.conversationsSize, 5);
        });
    });
});
