import * as assert from 'assert';
import * as sinon from 'sinon';
import { Scheduler } from '../../shared/utils/scheduler';

suite('Scheduler Test Suite', () => {
    let scheduler: Scheduler;

    setup(() => {
        scheduler = new Scheduler();
    });

    teardown(() => {
        scheduler.dispose();
    });

    test('should execute task immediately if configured', (done) => {
        const task = {
            name: 'immediate-task',
            interval: 1000,
            execute: () => {
                done();
            },
            immediate: true
        };
        scheduler.register(task);
        scheduler.start('immediate-task');
    });

    test('should execute task periodically', (done) => {
        let count = 0;
        const task = {
            name: 'periodic-task',
            interval: 10, // fast interval
            execute: () => {
                count++;
                if (count === 2) {
                    done();
                }
            }
        };
        scheduler.register(task);
        scheduler.start('periodic-task');
    });

    test('should stop task', (done) => {
        let count = 0;
        const task = {
            name: 'stop-task',
            interval: 20,
            execute: () => {
                count++;
            }
        };
        scheduler.register(task);
        scheduler.start('stop-task');

        setTimeout(() => {
            scheduler.stop('stop-task');
            const oldCount = count;

            setTimeout(() => {
                assert.strictEqual(count, oldCount);
                done();
            }, 50);
        }, 50);
    });

    test('should handle task errors', (done) => {
        scheduler = new Scheduler({
            onError: (name, error) => {
                assert.strictEqual(name, 'error-task');
                assert.strictEqual(error.message, 'Task Failed');
                done();
            }
        });

        const task = {
            name: 'error-task',
            interval: 10,
            execute: () => {
                throw new Error('Task Failed');
            },
            immediate: true
        };

        scheduler.register(task);
        scheduler.start('error-task');
    });

    test('should update interval', async () => {
        const clock = sinon.useFakeTimers();
        const timestamps: number[] = [];
        try {
            scheduler.register({
                name: 'update-interval-task',
                interval: 50,
                execute: () => { timestamps.push(Date.now()); }
            });
            scheduler.start('update-interval-task');
            await clock.tickAsync(50);
            assert.deepStrictEqual(timestamps, [50]);

            assert.strictEqual(scheduler.updateInterval('update-interval-task', 100), true);
            await clock.tickAsync(99);
            assert.deepStrictEqual(timestamps, [50]);
            await clock.tickAsync(1);
            assert.deepStrictEqual(timestamps, [50, 150]);
            await clock.tickAsync(100);
            assert.deepStrictEqual(timestamps, [50, 150, 250]);
        } finally {
            scheduler.dispose();
            clock.restore();
        }
    });
});
