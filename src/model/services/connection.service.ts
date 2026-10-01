/**
 * ConnectionService: keeps the Language Server connection recoverable.
 *
 * Owns one re-entrant reconnect loop (detect -> setServerInfo -> connected -> refresh),
 * the consecutive quota-fetch failure counter, and the background backoff retry
 * while the connection is failed. No vscode dependency: everything is injected.
 *
 * HTTP 401/403 from the server ('auth_failed') is not a connection failure: the server
 * answered, it rejected the session. It neither advances nor resets the failure counter,
 * never triggers a rescan, and polling continues; the status shows 'failed'/'auth_failed'
 * until a fetch succeeds.
 */

import type { LanguageServerInfo } from '../types/entities';

export type ConnectionFailureReason = 'no_process' | 'no_port' | 'auth_failed' | 'workspace_mismatch' | null;
export type ConnectionState = 'connected' | 'detecting' | 'failed';
/** Outcome of one quota refresh: 'auth_failed' means the server answered HTTP 401/403 */
export type QuotaRefreshResult = 'ok' | 'failed' | 'auth_failed';

/** Minimal detector contract (ProcessFinder satisfies it) */
export interface ServerDetector {
    detect(): Promise<LanguageServerInfo | null>;
    failureReason: ConnectionFailureReason;
}

export interface ConnectionTimers {
    setTimeout(callback: () => void, ms: number): unknown;
    clearTimeout(handle: unknown): void;
}

export interface ConnectionDeps<D extends ServerDetector> {
    /** A fresh detector per attempt */
    createDetector(): D;
    setServerInfo(info: LanguageServerInfo): void;
    setStatus(status: ConnectionState, reason: ConnectionFailureReason): void;
    refreshQuota(): Promise<QuotaRefreshResult>;
    /** Before each detection attempt (0-based attempt of `total`) */
    onAttempt?(attempt: number, total: number): void;
    /** After a detected server was applied and quota refreshed */
    onConnected?(detector: D, info: LanguageServerInfo): Promise<void> | void;
    /** After all attempts failed; `threw` is true when the last attempt threw */
    onFailed?(detector: D, threw: boolean): Promise<void> | void;
    /** When automatic fetches start answering HTTP 401/403 (once until a fetch succeeds or a server is applied) */
    onAuthFailed?(): void;
    onError?(error: unknown): void;
    timers?: ConnectionTimers;
}

export interface ConnectionOptions {
    /** Extra detection attempts per reconnect (default 7) */
    retries?: number;
    /** Delay between detection attempts (default 5s) */
    retryDelayMs?: number;
    /** Consecutive failed polls that trigger a reconnect (default 2) */
    failureThreshold?: number;
    /** First background retry delay while failed (default 30s, doubles) */
    backoffBaseMs?: number;
    /** Background retry delay cap (default 5 min) */
    backoffMaxMs?: number;
}

export interface ReconnectOptions {
    /** Override the configured retry count */
    retries?: number;
    /** Wait one retry delay before the first probe (server is restarting) */
    delayFirstAttempt?: boolean;
    /** Discard an in-flight attempt instead of joining it */
    supersede?: boolean;
    /** Keep the current status while probing (background retry) */
    background?: boolean;
}

const defaultTimers: ConnectionTimers = {
    setTimeout: (callback, ms) => setTimeout(callback, ms),
    clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export class ConnectionService<D extends ServerDetector = ServerDetector> {
    private readonly timers: ConnectionTimers;
    private readonly retries: number;
    private readonly retryDelayMs: number;
    private readonly failureThreshold: number;
    private readonly backoffBaseMs: number;
    private readonly backoffMaxMs: number;

    /** Bumped whenever an attempt is superseded; stale attempts compare against it */
    private generation = 0;
    private inFlight: Promise<boolean> | null = null;
    private connected = false;
    private consecutiveFailures = 0;
    /** The last fetch was answered with HTTP 401/403 and the status shows it */
    private authFailed = false;
    private backoffAttempts = 0;
    private backoffTimer: unknown = null;
    private pendingWait: { handle: unknown; resolve: () => void } | null = null;
    private disposed = false;

    constructor(private readonly deps: ConnectionDeps<D>, options: ConnectionOptions = {}) {
        this.timers = deps.timers ?? defaultTimers;
        this.retries = options.retries ?? 7;
        this.retryDelayMs = options.retryDelayMs ?? 5000;
        this.failureThreshold = options.failureThreshold ?? 2;
        this.backoffBaseMs = options.backoffBaseMs ?? 30_000;
        this.backoffMaxMs = options.backoffMaxMs ?? 5 * 60_000;
    }

    get isConnected(): boolean {
        return this.connected;
    }

    get isReconnecting(): boolean {
        return this.inFlight !== null;
    }

    /**
     * Detect the server and connect. Joins an in-flight attempt unless `supersede`
     * is set; results of a superseded attempt are discarded. No-op after dispose().
     */
    reconnect(options: ReconnectOptions = {}): Promise<boolean> {
        if (this.disposed) return Promise.resolve(false);
        if (this.inFlight && !options.supersede) return this.inFlight;

        const gen = this.beginGeneration();
        this.connected = false;
        if (!options.background) this.deps.setStatus('detecting', null);
        return this.track(gen, this.runAttempts(gen, options));
    }

    /** Apply a server found elsewhere (e.g. diagnostics), superseding any attempt */
    useServerInfo(info: LanguageServerInfo): Promise<boolean> {
        if (this.disposed) return Promise.resolve(false);
        const gen = this.beginGeneration();
        return this.track(gen, this.applyConnection(gen, info).then(() => true));
    }

    /** Scheduler tick: refresh while connected and count consecutive failures */
    async poll(): Promise<void> {
        if (this.disposed || this.inFlight || !this.connected) return;
        const gen = this.generation;
        const result = await this.deps.refreshQuota();
        this.recordFetchResult(gen, result, true);
    }

    /**
     * Manual refresh: a failure reconnects immediately; 401/403 does not reconnect and
     * leaves the user message to the caller (onAuthFailed is not called)
     */
    async refreshNow(): Promise<QuotaRefreshResult> {
        if (this.disposed) return 'failed';
        const gen = this.generation;
        const result = await this.deps.refreshQuota();
        if (result === 'failed') {
            void this.reconnect();
        } else {
            this.recordFetchResult(gen, result, false);
        }
        return result;
    }

    dispose(): void {
        this.disposed = true;
        this.generation++;
        this.cancelWait();
        this.cancelBackoff();
        this.inFlight = null;
    }

    private beginGeneration(): number {
        this.generation++;
        this.cancelWait();
        this.cancelBackoff();
        return this.generation;
    }

    private track(gen: number, attempt: Promise<boolean>): Promise<boolean> {
        const tracked = attempt.finally(() => {
            if (this.generation === gen) this.inFlight = null;
        });
        this.inFlight = tracked;
        return tracked;
    }

    private isStale(gen: number): boolean {
        return this.disposed || gen !== this.generation;
    }

    private async runAttempts(gen: number, options: ReconnectOptions): Promise<boolean> {
        const retries = options.retries ?? this.retries;
        let detector: D | undefined;
        let threw = false;

        for (let attempt = 0; attempt <= retries; attempt++) {
            if (attempt > 0 || options.delayFirstAttempt) {
                await this.wait(this.retryDelayMs);
                if (this.isStale(gen)) return false;
            }

            detector = this.deps.createDetector();
            this.deps.onAttempt?.(attempt, retries + 1);
            let info: LanguageServerInfo | null = null;
            threw = false;
            try {
                info = await detector.detect();
            } catch (e) {
                threw = true;
                this.deps.onError?.(e);
            }
            if (this.isStale(gen)) return false;

            if (info) {
                await this.applyConnection(gen, info, detector);
                return true;
            }
        }

        this.deps.setStatus('failed', threw ? null : detector?.failureReason ?? null);
        this.scheduleBackoff();
        if (detector) {
            try {
                await this.deps.onFailed?.(detector, threw);
            } catch (e) {
                this.deps.onError?.(e);
            }
        }
        return false;
    }

    private async applyConnection(gen: number, info: LanguageServerInfo, detector?: D): Promise<void> {
        this.deps.setServerInfo(info);
        this.connected = true;
        this.consecutiveFailures = 0;
        this.backoffAttempts = 0;
        this.authFailed = false;
        this.deps.setStatus('connected', null);

        const result = await this.deps.refreshQuota();
        if (this.isStale(gen)) return;
        if (result === 'failed') this.consecutiveFailures = 1;
        else if (result === 'auth_failed') this.recordAuthFailure(true);

        if (detector) {
            try {
                await this.deps.onConnected?.(detector, info);
            } catch (e) {
                this.deps.onError?.(e);
            }
        }
    }

    private recordFetchResult(gen: number, result: QuotaRefreshResult, notifyAuth: boolean): void {
        if (this.isStale(gen) || this.inFlight) return;
        if (result === 'auth_failed') {
            this.recordAuthFailure(notifyAuth);
            return;
        }
        if (result === 'ok') {
            this.consecutiveFailures = 0;
            this.markServerAnswered();
            if (this.authFailed) {
                this.authFailed = false;
                this.deps.setStatus('connected', null);
            }
            return;
        }
        if (++this.consecutiveFailures >= this.failureThreshold) {
            this.consecutiveFailures = 0;
            void this.reconnect();
        }
    }

    /** HTTP 401/403: the failure counter is left as it is and nothing is rescanned */
    private recordAuthFailure(notify: boolean): void {
        this.markServerAnswered();
        if (this.authFailed) return;
        this.authFailed = true;
        this.deps.setStatus('failed', 'auth_failed');
        if (notify) this.deps.onAuthFailed?.();
    }

    /** Server answered on the known port: stop background retries */
    private markServerAnswered(): void {
        if (this.connected) return;
        this.connected = true;
        this.backoffAttempts = 0;
        this.cancelBackoff();
    }

    private scheduleBackoff(): void {
        if (this.disposed) return;
        this.cancelBackoff();
        const delay = Math.min(this.backoffBaseMs * 2 ** this.backoffAttempts, this.backoffMaxMs);
        this.backoffAttempts++;
        this.backoffTimer = this.timers.setTimeout(() => {
            this.backoffTimer = null;
            void this.reconnect({ retries: 0, background: true });
        }, delay);
    }

    private cancelBackoff(): void {
        if (this.backoffTimer !== null) {
            this.timers.clearTimeout(this.backoffTimer);
            this.backoffTimer = null;
        }
    }

    private wait(ms: number): Promise<void> {
        return new Promise(resolve => {
            const handle = this.timers.setTimeout(() => {
                this.pendingWait = null;
                resolve();
            }, ms);
            this.pendingWait = { handle, resolve };
        });
    }

    private cancelWait(): void {
        const pending = this.pendingWait;
        if (!pending) return;
        this.pendingWait = null;
        this.timers.clearTimeout(pending.handle);
        pending.resolve();
    }
}
