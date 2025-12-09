/**
 * Scheduler: Generic task scheduler
 * Manages polling tasks, completely decoupled from business logic
 */

export interface SchedulerTask {
  /** Task name (for logging and debugging) */
  name: string;
  /** Execution interval (milliseconds) */
  interval: number;
  /** Task execution function */
  execute: () => void | Promise<void>;
  /** Whether to execute immediately once */
  immediate?: boolean;
}

export interface SchedulerOptions {
  /** Error handling callback */
  onError?: (taskName: string, error: Error) => void;
}

/**
 * Task scheduler
 *
 * @example
 * const scheduler = new Scheduler();
 *
 * scheduler.register({
 *   name: 'quota',
 *   interval: 60000,
 *   execute: () => quotaManager.fetchQuota(),
 *   immediate: true,
 * });
 *
 * scheduler.register({
 *   name: 'cache',
 *   interval: 300000,
 *   execute: () => cacheManager.scan(),
 * });
 *
 * scheduler.startAll();
 * // or
 * scheduler.start('quota');
 */
export class Scheduler {
  private tasks: Map<string, SchedulerTask> = new Map();
  private timers: Map<string, ReturnType<typeof setInterval>> = new Map();
  private options: SchedulerOptions;

  constructor(options: SchedulerOptions = {}) {
    this.options = options;
  }

  /**
   * Register a scheduled task
   */
  register(task: SchedulerTask): void {
    if (this.tasks.has(task.name)) {
      this.stop(task.name);
    }
    this.tasks.set(task.name, task);
  }

  /**
   * Unregister a scheduled task
   */
  unregister(name: string): void {
    this.stop(name);
    this.tasks.delete(name);
  }

  /**
   * Start specified task
   */
  start(name: string): boolean {
    const task = this.tasks.get(name);
    if (!task) return false;

    // If already running, stop first
    this.stop(name);

    // Execute immediately once
    if (task.immediate) {
      this.executeTask(task);
    }

    // Set timer
    const timer = setInterval(() => this.executeTask(task), task.interval);
    this.timers.set(name, timer);

    return true;
  }

  /**
   * Stop specified task
   */
  stop(name: string): boolean {
    const timer = this.timers.get(name);
    if (timer) {
      clearInterval(timer);
      this.timers.delete(name);
      return true;
    }
    return false;
  }

  /**
   * Start all registered tasks
   */
  startAll(): void {
    for (const name of this.tasks.keys()) {
      this.start(name);
    }
  }

  /**
   * Stop all tasks
   */
  stopAll(): void {
    for (const name of this.timers.keys()) {
      this.stop(name);
    }
  }

  /**
   * Update task execution interval
   */
  updateInterval(name: string, interval: number): boolean {
    const task = this.tasks.get(name);
    if (!task) return false;

    task.interval = interval;

    // If running, restart to apply new interval
    if (this.timers.has(name)) {
      this.stop(name);
      this.start(name);
    }

    return true;
  }

  /**
   * Check if task is running
   */
  isRunning(name: string): boolean {
    return this.timers.has(name);
  }

  /**
   * Get all registered task names
   */
  getRegisteredTasks(): string[] {
    return Array.from(this.tasks.keys());
  }

  /**
   * Get all running task names
   */
  getRunningTasks(): string[] {
    return Array.from(this.timers.keys());
  }

  /**
   * Manually trigger task execution once
   */
  async trigger(name: string): Promise<boolean> {
    const task = this.tasks.get(name);
    if (!task) return false;

    await this.executeTask(task);
    return true;
  }

  /**
   * Execute task (internal method)
   */
  private async executeTask(task: SchedulerTask): Promise<void> {
    try {
      await task.execute();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.options.onError?.(task.name, err);
    }
  }

  /**
   * Dispose scheduler, stop all tasks and clean up resources
   */
  dispose(): void {
    this.stopAll();
    this.tasks.clear();
  }
}
