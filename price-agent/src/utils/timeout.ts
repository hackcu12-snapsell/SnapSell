const DEFAULT_TIMEOUT_MS = 12000;

/**
 * Wraps a promise with a timeout. Rejects with a descriptive error if
 * the promise does not resolve within `ms` milliseconds.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number = DEFAULT_TIMEOUT_MS,
  sourceName: string
): Promise<T> {
  const timeout = new Promise<never>((_, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${sourceName} timed out after ${ms}ms`));
    }, ms);

    // Ensure the timer doesn't prevent Node from exiting
    if (timer.unref) timer.unref();
  });

  return Promise.race([promise, timeout]);
}
