/**
 * 通用重试工具函数
 * 支持多种退避策略，与业务逻辑解耦
 */

export type BackoffStrategy = "fixed" | "linear" | "exponential";

export interface RetryConfig<T> {
  /** 最大尝试次数 (包括首次) */
  attempts: number;
  /** 基础延迟时间 (ms) */
  baseDelay: number;
  /** 最大延迟时间 (ms)，仅对 exponential 有效 */
  maxDelay?: number;
  /** 退避策略: fixed=固定间隔, linear=线性增长, exponential=指数增长 */
  backoff?: BackoffStrategy;
  /** 自定义重试条件: 返回 true 表示需要重试 */
  shouldRetry?: (result: T | null, error?: Error) => boolean;
  /** 每次重试前的回调 (可用于日志) */
  onRetry?: (attempt: number, delay: number) => void;
}

/**
 * 计算下次重试的延迟时间
 */
function calculateDelay(
  attempt: number,
  baseDelay: number,
  strategy: BackoffStrategy,
  maxDelay: number
): number {
  let delay: number;

  switch (strategy) {
    case "linear":
      // 线性增长: baseDelay, 2*baseDelay, 3*baseDelay...
      delay = baseDelay * attempt;
      break;
    case "exponential":
      // 指数增长: baseDelay, 2*baseDelay, 4*baseDelay, 8*baseDelay...
      delay = baseDelay * Math.pow(2, attempt - 1);
      break;
    case "fixed":
    default:
      delay = baseDelay;
  }

  return Math.min(delay, maxDelay);
}

/**
 * 延迟执行
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 对异步函数执行重试
 *
 * @param fn 要重试的异步函数
 * @param config 重试配置
 * @returns 成功的结果，或在所有尝试失败后返回 null
 *
 * @example
 * // 基本用法
 * const result = await retry(() => fetchData(), { attempts: 3, baseDelay: 1000 });
 *
 * @example
 * // 指数退避
 * const result = await retry(() => detectServer(), {
 *   attempts: 4,
 *   baseDelay: 500,
 *   backoff: "exponential",
 *   maxDelay: 5000
 * });
 *
 * @example
 * // 自定义重试条件
 * const result = await retry(() => fetchQuota(), {
 *   attempts: 3,
 *   baseDelay: 1000,
 *   shouldRetry: (result) => result === null || result.models.length === 0
 * });
 */
export async function retry<T>(
  fn: () => Promise<T | null>,
  config: RetryConfig<T>
): Promise<T | null> {
  const {
    attempts,
    baseDelay,
    maxDelay = 30000,
    backoff = "fixed",
    shouldRetry = (result) => result === null,
    onRetry,
  } = config;

  let lastResult: T | null = null;
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      lastResult = await fn();
      lastError = undefined;

      // 检查是否需要重试
      if (!shouldRetry(lastResult, undefined)) {
        return lastResult;
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      lastResult = null;

      // 如果有自定义条件且明确不需要重试，则提前退出
      if (!shouldRetry(null, lastError)) {
        throw lastError;
      }
    }

    // 如果还有剩余尝试次数，等待后重试
    if (attempt < attempts) {
      const delay = calculateDelay(attempt, baseDelay, backoff, maxDelay);
      onRetry?.(attempt, delay);
      await sleep(delay);
    }
  }

  // 所有尝试都失败
  if (lastError) {
    throw lastError;
  }

  return lastResult;
}

/**
 * 创建一个预配置的重试函数
 *
 * @example
 * const retryWithBackoff = createRetry({ attempts: 3, baseDelay: 1000, backoff: "exponential" });
 * const result = await retryWithBackoff(() => fetchData());
 */
export function createRetry<T>(config: RetryConfig<T>) {
  return (fn: () => Promise<T | null>) => retry(fn, config);
}
