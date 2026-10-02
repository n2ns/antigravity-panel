import * as assert from 'assert';
import {
    ConnectionService,
    type ConnectionDeps,
    type ConnectionFailureReason,
    type ConnectionState,
    type ConnectionTimers,
    type QuotaRefreshResult,
    type ServerDetector,
} from '../../model/services/connection.service';
import type { LanguageServerInfo } from '../../model/types/entities';

const SERVER_A: LanguageServerInfo = { port: 1001, csrfToken: 'token-a' };
const SERVER_B: LanguageServerInfo = { port: 1002, csrfToken: 'token-b' };

/** Manually driven timers: nothing fires until a test asks for it */
class FakeTimers implements ConnectionTimers {
    private nextId = 1;
    pending = new Map<number, { callback: () => void; ms: number }>();
    scheduled: number[] = [];

    setTimeout(callback: () => void, ms: number): unknown {
        const id = this.nextId++;
        this.pending.set(id, { callback, ms });
        this.scheduled.push(ms);
        return id;
    }

    clearTimeout(handle: unknown): void {
        this.pending.delete(handle as number);
    }

    /** Fire the oldest pending timer and return its delay */
    fireNext(): number {
        const first = this.pending.entries().next();
        assert.ok(!first.done, 'Expected a pending timer');
        const [id, timer] = first.value;
        this.pending.delete(id);
        timer.callback();
        return timer.ms;
    }
}

class FakeDetector implements ServerDetector {
    failureReason: ConnectionFailureReason = null;
    constructor(private readonly run: (d: FakeDetector) => Promise<LanguageServerInfo | null>) { }
    detect(): Promise<LanguageServerInfo | null> {
        return this.run(this);
    }
}

async function flush(): Promise<void> {
    for (let i = 0; i < 10; i++) await new Promise(resolve => setImmediate(resolve));
}

suite('ConnectionService Test Suite', () => {
    let timers: FakeTimers;
    let statuses: Array<[ConnectionState, ConnectionFailureReason]>;
    let applied: LanguageServerInfo[];
    let detectResults: Array<LanguageServerInfo | null | Error>;
    let detectCalls: number;
    /** true = data, false = failed fetch, 'auth_failed' = HTTP 401/403, 'server_error' = answered without data */
    let refreshResults: Array<boolean | 'auth_failed' | 'server_error'>;
    let refreshCalls: number;
    let failedCalls: number;
    let connectedCalls: number;
    let authFailedCalls: number;
    let service: ConnectionService<FakeDetector>;

    function create(overrides: Partial<ConnectionDeps<FakeDetector>> = {}): ConnectionService<FakeDetector> {
        return new ConnectionService<FakeDetector>({
            createDetector: () => new FakeDetector(async d => {
                detectCalls++;
                const next = detectResults.shift() ?? null;
                if (next instanceof Error) throw next;
                if (!next) d.failureReason = 'no_process';
                return next;
            }),
            setServerInfo: info => { applied.push(info); },
            setStatus: (status, reason) => { statuses.push([status, reason]); },
            refreshQuota: async (): Promise<QuotaRefreshResult> => {
                refreshCalls++;
                const next = refreshResults.shift() ?? true;
                return next === true ? 'ok' : next === false ? 'failed' : next;
            },
            onConnected: () => { connectedCalls++; },
            onFailed: () => { failedCalls++; },
            onAuthFailed: () => { authFailedCalls++; },
            timers,
            ...overrides,
        }, { retries: 2, retryDelayMs: 5000, failureThreshold: 2, backoffBaseMs: 30_000, backoffMaxMs: 300_000 });
    }

    setup(() => {
        timers = new FakeTimers();
        statuses = [];
        applied = [];
        detectResults = [];
        detectCalls = 0;
        refreshResults = [];
        refreshCalls = 0;
        failedCalls = 0;
        connectedCalls = 0;
        authFailedCalls = 0;
        service = create();
    });

    teardown(() => service.dispose());

    test('successful reconnect applies server info, connects and refreshes', async () => {
        detectResults = [SERVER_A];
        assert.strictEqual(await service.reconnect(), true);
        assert.deepStrictEqual(applied, [SERVER_A]);
        assert.deepStrictEqual(statuses, [['detecting', null], ['connected', null]]);
        assert.strictEqual(refreshCalls, 1);
        assert.strictEqual(connectedCalls, 1);
        assert.strictEqual(service.isConnected, true);
        assert.strictEqual(service.isReconnecting, false);
    });

    test('bounded retries then failed with reason and failure hook', async () => {
        detectResults = [null, null, null];
        const result = service.reconnect();
        await flush();
        assert.strictEqual(timers.fireNext(), 5000);
        await flush();
        assert.strictEqual(timers.fireNext(), 5000);
        assert.strictEqual(await result, false);
        assert.strictEqual(detectCalls, 3, 'Initial attempt + 2 retries');
        assert.deepStrictEqual(statuses.at(-1), ['failed', 'no_process']);
        assert.strictEqual(failedCalls, 1);
        assert.strictEqual(applied.length, 0);
    });

    test('a thrown detection counts as a failed attempt with no reason', async () => {
        detectResults = [new Error('boom'), new Error('boom'), new Error('boom')];
        const result = service.reconnect();
        await flush();
        timers.fireNext();
        await flush();
        timers.fireNext();
        assert.strictEqual(await result, false);
        assert.deepStrictEqual(statuses.at(-1), ['failed', null]);
    });

    test('only one attempt is in flight at a time', async () => {
        let release: (info: LanguageServerInfo | null) => void = () => { };
        service.dispose();
        service = new ConnectionService<FakeDetector>({
            createDetector: () => new FakeDetector(() => {
                detectCalls++;
                return new Promise(resolve => { release = resolve; });
            }),
            setServerInfo: info => { applied.push(info); },
            setStatus: (status, reason) => { statuses.push([status, reason]); },
            refreshQuota: async () => 'ok',
            timers,
        }, { retries: 0 });

        const first = service.reconnect();
        const second = service.reconnect();
        assert.strictEqual(first, second, 'Second call joins the in-flight attempt');
        assert.strictEqual(service.isReconnecting, true);
        await flush();
        assert.strictEqual(detectCalls, 1);
        release(SERVER_A);
        assert.strictEqual(await first, true);
        assert.deepStrictEqual(applied, [SERVER_A]);
    });

    test('results of a superseded attempt are never applied', async () => {
        const releases: Array<(info: LanguageServerInfo | null) => void> = [];
        service.dispose();
        service = new ConnectionService<FakeDetector>({
            createDetector: () => new FakeDetector(() => new Promise(resolve => { releases.push(resolve); })),
            setServerInfo: info => { applied.push(info); },
            setStatus: (status, reason) => { statuses.push([status, reason]); },
            refreshQuota: async () => 'ok',
            timers,
        }, { retries: 0 });

        const stale = service.reconnect();
        await flush();
        const fresh = service.reconnect({ supersede: true });
        await flush();
        assert.strictEqual(releases.length, 2);

        releases[1](SERVER_B);
        assert.strictEqual(await fresh, true);
        releases[0](SERVER_A);
        assert.strictEqual(await stale, false);
        assert.deepStrictEqual(applied, [SERVER_B], 'Stale SERVER_A must be ignored');
        assert.strictEqual(service.isReconnecting, false);
    });

    test('useServerInfo applies an external result and supersedes an in-flight attempt', async () => {
        let release: (info: LanguageServerInfo | null) => void = () => { };
        service.dispose();
        service = new ConnectionService<FakeDetector>({
            createDetector: () => new FakeDetector(() => new Promise(resolve => { release = resolve; })),
            setServerInfo: info => { applied.push(info); },
            setStatus: (status, reason) => { statuses.push([status, reason]); },
            refreshQuota: async () => { refreshCalls++; return 'ok'; },
            timers,
        }, { retries: 0 });

        const pending = service.reconnect();
        await flush();
        assert.strictEqual(await service.useServerInfo(SERVER_B), true);
        assert.deepStrictEqual(statuses.at(-1), ['connected', null]);
        release(SERVER_A);
        assert.strictEqual(await pending, false);
        assert.deepStrictEqual(applied, [SERVER_B]);
        assert.strictEqual(refreshCalls, 1);
    });

    test('delayFirstAttempt waits one retry delay before probing', async () => {
        detectResults = [SERVER_A];
        const result = service.reconnect({ delayFirstAttempt: true });
        await flush();
        assert.strictEqual(detectCalls, 0, 'No immediate probe');
        assert.strictEqual(timers.fireNext(), 5000);
        assert.strictEqual(await result, true);
        assert.strictEqual(detectCalls, 1);
    });

    test('two consecutive failed polls set detecting and reconnect', async () => {
        detectResults = [SERVER_A];
        await service.reconnect();
        statuses = [];

        refreshResults = [false];
        await service.poll();
        assert.strictEqual(detectCalls, 1, 'One failure is below the threshold');
        assert.deepStrictEqual(statuses, []);

        detectResults = [SERVER_B];
        refreshResults = [false, true];
        await service.poll();
        await flush();
        assert.strictEqual(detectCalls, 2, 'Second consecutive failure reconnects');
        assert.deepStrictEqual(statuses, [['detecting', null], ['connected', null]]);
        assert.deepStrictEqual(applied, [SERVER_A, SERVER_B]);
    });

    test('a successful poll resets the failure counter', async () => {
        detectResults = [SERVER_A];
        await service.reconnect();

        refreshResults = [false, true, false];
        await service.poll();
        await service.poll();
        await service.poll();
        await flush();
        assert.strictEqual(detectCalls, 1, 'Failures were not consecutive');
    });

    test('a failed refresh right after connecting counts toward the threshold', async () => {
        detectResults = [SERVER_A, SERVER_B];
        refreshResults = [false, false, true];
        await service.reconnect();
        await service.poll();
        await flush();
        assert.strictEqual(detectCalls, 2);
    });

    test('poll is idle while not connected or reconnecting', async () => {
        await service.poll();
        assert.strictEqual(refreshCalls, 0);
    });

    test('failed state retries in the background with capped exponential backoff', async () => {
        service.dispose();
        service = create();
        detectResults = [null, null, null];
        const result = service.reconnect();
        await flush();
        timers.fireNext();
        await flush();
        timers.fireNext();
        await result;
        statuses = [];

        // Background attempts are single probes that keep the 'failed' status
        const delays: number[] = [];
        for (let i = 0; i < 6; i++) {
            delays.push(timers.fireNext());
            await flush();
        }
        assert.deepStrictEqual(delays, [30_000, 60_000, 120_000, 240_000, 300_000, 300_000]);
        assert.strictEqual(detectCalls, 3 + 6);
        assert.ok(statuses.every(([s]) => s === 'failed'), 'No detecting flicker during background retries');

        detectResults = [SERVER_A];
        timers.fireNext();
        await flush();
        assert.deepStrictEqual(statuses.at(-1), ['connected', null]);
        assert.strictEqual(timers.pending.size, 0, 'Backoff stops after success');
    });

    test('backoff restarts from the base delay after a successful connection', async () => {
        detectResults = [null, null, null];
        const first = service.reconnect();
        await flush();
        timers.fireNext();
        await flush();
        timers.fireNext();
        await first;
        detectResults = [null];
        assert.strictEqual(timers.fireNext(), 30_000);
        await flush();
        detectResults = [SERVER_A];
        assert.strictEqual(timers.fireNext(), 60_000);
        await flush();
        assert.strictEqual(service.isConnected, true);

        timers.scheduled = [];
        detectResults = [null, null, null];
        const second = service.reconnect();
        await flush();
        timers.fireNext();
        await flush();
        timers.fireNext();
        await second;
        assert.strictEqual(timers.scheduled.at(-1), 30_000);
    });

    test('refreshNow reports the result and reconnects on failure', async () => {
        detectResults = [SERVER_A];
        await service.reconnect();
        refreshResults = [true];
        assert.strictEqual(await service.refreshNow(), 'ok');
        assert.strictEqual(detectCalls, 1);

        detectResults = [SERVER_B];
        refreshResults = [false, true];
        assert.strictEqual(await service.refreshNow(), 'failed');
        await flush();
        assert.strictEqual(detectCalls, 2, 'A failed manual refresh reconnects immediately');
        assert.deepStrictEqual(applied, [SERVER_A, SERVER_B]);
    });

    test('a successful manual refresh while failed stops background retries', async () => {
        detectResults = [null, null, null];
        const result = service.reconnect();
        await flush();
        timers.fireNext();
        await flush();
        timers.fireNext();
        await result;
        assert.strictEqual(timers.pending.size, 1);

        refreshResults = [true];
        assert.strictEqual(await service.refreshNow(), 'ok');
        assert.strictEqual(service.isConnected, true);
        assert.strictEqual(timers.pending.size, 0);
    });

    test('a failed manual refresh joins a foreground reconnect but supersedes a background probe', async () => {
        const releases: Array<(info: LanguageServerInfo | null) => void> = [];
        service.dispose();
        service = create({
            createDetector: () => new FakeDetector(d => {
                detectCalls++;
                d.failureReason = 'no_process';
                return new Promise(resolve => { releases.push(resolve); });
            }),
        });

        // Boot reconnect in flight: the manual refresh joins it
        const boot = service.reconnect();
        await flush();
        refreshResults = [false];
        assert.strictEqual(await service.refreshNow(), 'failed');
        await flush();
        assert.strictEqual(detectCalls, 1, 'No second attempt next to the foreground one');
        assert.deepStrictEqual(statuses, [['detecting', null]], 'No second detecting');

        releases[0](null);
        await flush();
        timers.fireNext();
        await flush();
        releases[1](null);
        await flush();
        timers.fireNext();
        await flush();
        releases[2](null);
        assert.strictEqual(await boot, false);
        assert.deepStrictEqual(statuses.at(-1), ['failed', 'no_process']);
        statuses = [];

        // Background probe in flight: the manual refresh supersedes it with a full foreground reconnect
        assert.strictEqual(timers.fireNext(), 30_000);
        await flush();
        assert.strictEqual(detectCalls, 4);
        assert.strictEqual(service.isReconnecting, true);
        refreshResults = [false];
        assert.strictEqual(await service.refreshNow(), 'failed');
        await flush();
        assert.strictEqual(detectCalls, 5, 'A fresh foreground attempt started');
        assert.deepStrictEqual(statuses, [['detecting', null]]);

        releases[4](SERVER_A);
        await flush();
        assert.deepStrictEqual(statuses.at(-1), ['connected', null]);
        releases[3](SERVER_B);
        await flush();
        assert.deepStrictEqual(applied, [SERVER_A], 'The superseded probe result is discarded');
        assert.strictEqual(service.isReconnecting, false);
    });

    // HTTP 401/403: only connection-type errors count toward the rescan
    // threshold; an auth error neither advances nor resets the counter, never rescans,
    // and polling continues.

    test('repeated 401/403 polls never rescan and keep polling', async () => {
        detectResults = [SERVER_A];
        await service.reconnect();
        statuses = [];

        refreshResults = ['auth_failed', 'auth_failed', 'auth_failed', 'auth_failed', 'auth_failed'];
        for (let i = 0; i < 5; i++) await service.poll();
        await flush();
        assert.strictEqual(detectCalls, 1, 'No rescan on 401/403');
        assert.strictEqual(refreshCalls, 1 + 5, 'Every poll still fetches');
        assert.strictEqual(service.isConnected, true);
        assert.strictEqual(service.isReconnecting, false);
        assert.strictEqual(timers.pending.size, 0, 'No backoff armed');
        assert.ok(statuses.every(([s, r]) => s === 'failed' && r === 'auth_failed'), 'Status stays auth_failed');
        assert.strictEqual(authFailedCalls, 1, 'User notified once per streak');
    });

    test('repeated 401/403 re-asserts the auth_failed status but notifies once', async () => {
        detectResults = [SERVER_A];
        await service.reconnect();
        statuses = [];

        refreshResults = ['auth_failed', 'auth_failed', 'auth_failed'];
        await service.poll();
        await service.poll();
        assert.strictEqual(await service.refreshNow(), 'auth_failed');
        assert.deepStrictEqual(statuses, [
            ['failed', 'auth_failed'],
            ['failed', 'auth_failed'],
            ['failed', 'auth_failed'],
        ], 'Every 401/403 writes the status again');
        assert.strictEqual(authFailedCalls, 1, 'One notification per streak');
    });

    test('401/403 does not advance the failure counter', async () => {
        detectResults = [SERVER_A];
        await service.reconnect();

        refreshResults = [false, 'auth_failed'];
        await service.poll();
        await service.poll();
        await flush();
        assert.strictEqual(detectCalls, 1, 'One failure plus an auth error stays below the threshold of 2');
    });

    test('401/403 between two connection failures does not reset the counter', async () => {
        detectResults = [SERVER_A];
        await service.reconnect();

        detectResults = [SERVER_B];
        refreshResults = [false, 'auth_failed', false, true];
        await service.poll();
        await service.poll();
        await flush();
        assert.strictEqual(detectCalls, 1, 'failed, 401 = still one counted failure');
        await service.poll();
        await flush();
        assert.strictEqual(detectCalls, 2, 'failed, 401, failed = two consecutive failures: reconnect');
        assert.deepStrictEqual(applied, [SERVER_A, SERVER_B]);
    });

    test('a successful fetch after 401/403 restores the connected status and re-arms the notification', async () => {
        detectResults = [SERVER_A];
        await service.reconnect();
        statuses = [];

        refreshResults = ['auth_failed', true, 'auth_failed'];
        await service.poll();
        await service.poll();
        await service.poll();
        assert.deepStrictEqual(statuses, [
            ['failed', 'auth_failed'],
            ['connected', null],
            ['failed', 'auth_failed'],
        ]);
        assert.strictEqual(authFailedCalls, 2);
        assert.strictEqual(detectCalls, 1);
    });

    test('401/403 right after connecting shows auth_failed and does not count toward the threshold', async () => {
        detectResults = [SERVER_A, SERVER_B];
        refreshResults = ['auth_failed', false];
        await service.reconnect();
        assert.deepStrictEqual(statuses, [['detecting', null], ['connected', null], ['failed', 'auth_failed']]);
        assert.strictEqual(authFailedCalls, 1);
        assert.strictEqual(connectedCalls, 1);

        await service.poll();
        await flush();
        assert.strictEqual(detectCalls, 1, 'Only one connection failure so far');
    });

    test('manual refresh with 401/403 neither reconnects nor fires the auth hook', async () => {
        detectResults = [SERVER_A];
        await service.reconnect();
        statuses = [];

        refreshResults = ['auth_failed', 'auth_failed'];
        assert.strictEqual(await service.refreshNow(), 'auth_failed');
        await flush();
        assert.strictEqual(detectCalls, 1, 'No reconnect on 401/403');
        assert.deepStrictEqual(statuses, [['failed', 'auth_failed']]);
        assert.strictEqual(authFailedCalls, 0, 'The caller reports a manual refresh itself');

        await service.poll();
        assert.strictEqual(authFailedCalls, 0, 'Same streak: no second notification');
    });

    test('401/403 on a manual refresh while failed stops background retries', async () => {
        detectResults = [null, null, null];
        const result = service.reconnect();
        await flush();
        timers.fireNext();
        await flush();
        timers.fireNext();
        await result;
        assert.strictEqual(timers.pending.size, 1, 'Backoff armed');

        refreshResults = ['auth_failed'];
        assert.strictEqual(await service.refreshNow(), 'auth_failed');
        await flush();
        assert.strictEqual(timers.pending.size, 0, 'The server answered: no background rescan');
        assert.strictEqual(service.isConnected, true, 'Polling resumes');
        assert.strictEqual(detectCalls, 3);
        assert.deepStrictEqual(statuses.at(-1), ['failed', 'auth_failed']);
    });

    // 'server_error' (the server answered 5xx or without usable data) is handled like
    // 401/403 for the counter and the rescan, but leaves the status alone.

    test('a server error right after connecting keeps the status and the polling', async () => {
        detectResults = [SERVER_A];
        refreshResults = ['server_error', 'server_error', 'server_error', true];
        await service.reconnect();
        assert.deepStrictEqual(statuses, [['detecting', null], ['connected', null]], 'Status untouched');

        for (let i = 0; i < 3; i++) await service.poll();
        await flush();
        assert.strictEqual(refreshCalls, 1 + 3, 'Every poll still fetches');
        assert.strictEqual(detectCalls, 1, 'No rescan on a server error');
        assert.deepStrictEqual(statuses, [['detecting', null], ['connected', null]], 'Status still untouched');
        assert.strictEqual(service.isConnected, true);
        assert.strictEqual(service.isReconnecting, false);
        assert.strictEqual(timers.pending.size, 0, 'No backoff armed');
    });

    test('server errors neither advance nor reset the failure counter', async () => {
        detectResults = [SERVER_A];
        await service.reconnect();

        detectResults = [SERVER_B];
        refreshResults = [false, 'server_error', 'server_error', true, 'server_error', false, 'server_error', false, true];
        await service.poll();
        await service.poll();
        await service.poll();
        await flush();
        assert.strictEqual(detectCalls, 1, 'failed, server_error, server_error: still one counted failure');

        await service.poll();
        await service.poll();
        await service.poll();
        await flush();
        assert.strictEqual(detectCalls, 1, 'ok, server_error, failed: the success reset the counter');

        await service.poll();
        await service.poll();
        await flush();
        assert.strictEqual(detectCalls, 2, 'failed, server_error, failed: two consecutive connection failures reconnect');
        assert.deepStrictEqual(applied, [SERVER_A, SERVER_B]);
    });

    // Hooks may wait for the user (notification buttons) and must not hold up the
    // reconnect loop, the backoff or polling; dependency failures end the attempt.

    test('a pending onFailed hook does not stop the background backoff', async () => {
        let releaseHook: () => void = () => { };
        service.dispose();
        service = create({
            onFailed: () => { failedCalls++; return new Promise<void>(resolve => { releaseHook = resolve; }); },
        });
        detectResults = [null, null, null];
        const result = service.reconnect();
        await flush();
        timers.fireNext();
        await flush();
        timers.fireNext();
        assert.strictEqual(await result, false);
        assert.strictEqual(failedCalls, 1);
        assert.strictEqual(service.isReconnecting, false, 'The hook does not extend the attempt');

        detectResults = [null];
        assert.strictEqual(timers.fireNext(), 30_000);
        await flush();
        assert.strictEqual(detectCalls, 4, 'The background probe ran while the hook is pending');
        assert.strictEqual(timers.scheduled.at(-1), 60_000, 'Next backoff armed');
        releaseHook();
    });

    test('a pending onFailed hook does not swallow a failed manual refresh', async () => {
        service.dispose();
        service = create({ onFailed: () => new Promise<void>(() => { }) });
        detectResults = [null, null, null];
        const result = service.reconnect();
        await flush();
        timers.fireNext();
        await flush();
        timers.fireNext();
        assert.strictEqual(await result, false);

        detectResults = [SERVER_A];
        refreshResults = [false, true];
        assert.strictEqual(await service.refreshNow(), 'failed');
        await flush();
        assert.strictEqual(detectCalls, 4, 'The manual refresh started a new detection');
        assert.deepStrictEqual(statuses.at(-1), ['connected', null]);
    });

    test('a rejected onFailed hook is reported through onError', async () => {
        const errors: unknown[] = [];
        service.dispose();
        service = create({
            onFailed: () => Promise.reject(new Error('hook failed')),
            onError: e => { errors.push(e); },
        });
        detectResults = [null, null, null];
        const result = service.reconnect();
        await flush();
        timers.fireNext();
        await flush();
        timers.fireNext();
        assert.strictEqual(await result, false);
        await flush();
        assert.strictEqual((errors[0] as Error).message, 'hook failed');
        assert.strictEqual(errors.length, 1);
        assert.strictEqual(service.isReconnecting, false);
    });

    test('a pending onConnected hook does not stop polling', async () => {
        service.dispose();
        service = create({ onConnected: () => { connectedCalls++; return new Promise<void>(() => { }); } });
        detectResults = [SERVER_A, SERVER_B];
        refreshResults = [false, false, true];
        assert.strictEqual(await service.reconnect(), true);
        assert.strictEqual(connectedCalls, 1);
        assert.strictEqual(service.isReconnecting, false, 'The hook does not extend the attempt');

        await service.poll();
        await flush();
        assert.strictEqual(refreshCalls, 3, 'poll still fetches while the hook is pending');
        assert.strictEqual(detectCalls, 2, 'The failure threshold still reconnects');
        assert.deepStrictEqual(applied, [SERVER_A, SERVER_B]);
    });

    test('a throwing refreshQuota ends the attempt through onError', async () => {
        const errors: unknown[] = [];
        service.dispose();
        service = create({
            refreshQuota: async () => { throw new Error('fetch exploded'); },
            onError: e => { errors.push(e); },
        });
        detectResults = [SERVER_A];
        assert.strictEqual(await service.reconnect(), false);
        assert.strictEqual((errors[0] as Error).message, 'fetch exploded');
        assert.strictEqual(errors.length, 1);
        assert.strictEqual(service.isReconnecting, false, 'inFlight is cleared');
    });

    test('dispose stops timers and makes reconnect a no-op', async () => {
        detectResults = [null, null, null];
        const result = service.reconnect();
        await flush();
        assert.strictEqual(timers.pending.size, 1, 'Retry wait pending');
        service.dispose();
        assert.strictEqual(timers.pending.size, 0);
        assert.strictEqual(await result, false);
        assert.strictEqual(failedCalls, 0, 'Disposed attempt reports nothing');

        const callsBefore = detectCalls;
        assert.strictEqual(await service.reconnect(), false);
        assert.strictEqual(await service.useServerInfo(SERVER_A), false);
        assert.strictEqual(await service.refreshNow(), 'failed');
        await service.poll();
        assert.strictEqual(detectCalls, callsBefore);
        assert.strictEqual(timers.pending.size, 0);
    });

    test('dispose clears a pending background backoff timer', async () => {
        detectResults = [null, null, null];
        const result = service.reconnect();
        await flush();
        timers.fireNext();
        await flush();
        timers.fireNext();
        await result;
        assert.strictEqual(timers.pending.size, 1, 'Backoff armed');
        service.dispose();
        assert.strictEqual(timers.pending.size, 0);
    });
});
