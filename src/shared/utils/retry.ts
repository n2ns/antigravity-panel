/**
 * Generic retry utility function
 * Supports multiple backoff strategies, decoupled from business logic
 */

export type BackoffStrategy = "fixed" | "linear" | "exponential";

export interface RetryConfig<T> {
  /** Maximum number of attempts (including first) */
  attempts: number;
  /** Base delay time (ms) */
  baseDelay: number;
  /** Maximum delay time (ms), only effective for exponential */
  maxDelay?: number;
  /** Backoff strategy: fixed=fixed interval, linear=linear growth, exponential=exponential growth */
  backoff?: BackoffStrategy;
  /** Custom retry condition: return true to retry */
  shouldRetry?: (result: T | null, error?: Error) => boolean;
  /** Callback before each retry (can be used for logging) */
  onRetry?: (attempt: number, delay: number) => void;
}

/**
 * Calculate delay time for next retry
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
      // Linear growth: baseDelay, 2*baseDelay, 3*baseDelay...
      delay = baseDelay * attempt;
      break;
    case "exponential":
      // Exponential growth: baseDelay, 2*baseDelay, 4*baseDelay, 8*baseDelay...
      delay = baseDelay * Math.pow(2, attempt - 1);
      break;
    case "fixed":
    default:
      delay = baseDelay;
  }

  return Math.min(delay, maxDelay);
}

/**
 * Delay execution
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute retry on async function
 *
 * @param fn Async function to retry
 * @param config Retry configuration
 * @returns Successful result, or null after all attempts fail
 *
 * @example
 * // Basic usage
 * const result = await retry(() => fetchData(), { attempts: 3, baseDelay: 1000 });
 *
 * @example
 * // Exponential backoff
 * const result = await retry(() => detectServer(), {
 *   attempts: 4,
 *   baseDelay: 500,
 *   backoff: "exponential",
 *   maxDelay: 5000
 * });
 *
 * @example
 * // Custom retry condition
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

      // Check if retry is needed
      if (!shouldRetry(lastResult, undefined)) {
        return lastResult;
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      lastResult = null;

      // If custom condition explicitly says no retry, exit early
      if (!shouldRetry(null, lastError)) {
        throw lastError;
      }
    }

    // If there are remaining attempts, wait and retry
    if (attempt < attempts) {
      const delay = calculateDelay(attempt, baseDelay, backoff, maxDelay);
      onRetry?.(attempt, delay);
      await sleep(delay);
    }
  }

  // All attempts failed
  if (lastError) {
    throw lastError;
  }

  return lastResult;
}

/**
 * Create a pre-configured retry function
 *
 * @example
 * const retryWithBackoff = createRetry({ attempts: 3, baseDelay: 1000, backoff: "exponential" });
 * const result = await retryWithBackoff(() => fetchData());
 */
export function createRetry<T>(config: RetryConfig<T>) {
  return (fn: () => Promise<T | null>) => retry(fn, config);
}
