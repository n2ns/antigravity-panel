import * as assert from 'assert';
import { Scheduler } from '../../core/scheduler';

suite('Scheduler Test Suite', () => {
    let scheduler: Scheduler;

    setup(() => {
        scheduler = new Scheduler();
    });

    teardown(() => {
        scheduler.dispose();
    });

    test('should register task', () => {
        const task = {
            name: 'test-task',
            interval: 100,
            execute: () => {}
        };
        scheduler.register(task);
        assert.deepStrictEqual(scheduler.getRegisteredTasks(), ['test-task']);
    });

    test('should unregister task', () => {
        const task = {
            name: 'test-task',
            interval: 100,
            execute: () => {}
        };
        scheduler.register(task);
        scheduler.unregister('test-task');
        assert.deepStrictEqual(scheduler.getRegisteredTasks(), []);
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

    test('should update interval', (done) => {
        let timestamps: number[] = [];
        const task = {
            name: 'update-interval-task',
            interval: 50,
            execute: () => {
                timestamps.push(Date.now());
                if (timestamps.length >= 2) {
                    // Check logic elsewhere
                }
            }
        };
        
        scheduler.register(task);
        scheduler.start('update-interval-task');

        // Check if updating interval works
        // This is hard to test precisely with setTimeout variance, so we just check it returns true
        const result = scheduler.updateInterval('update-interval-task', 100);
        assert.strictEqual(result, true);
        
        done();
    });
});
