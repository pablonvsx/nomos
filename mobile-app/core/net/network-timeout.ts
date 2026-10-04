/**
 * Timeout helper for network calls. React Native's Android OkHttp client runs
 * with connect/read/write timeouts of 0 (no limit), so a stalled connection
 * would otherwise leave an operation - and the screen's lock - waiting
 * forever. Free of react/react-native imports so it runs under the node jest
 * setup.
 */

/** A network call did not finish within its limit. Subclassed per service so callers can catch precisely. */
export class NetworkTimeoutError extends Error {
  readonly timeoutMs: number;

  constructor(timeoutMs: number, message = `The network request timed out after ${timeoutMs} ms.`) {
    super(message);
    this.name = "NetworkTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

export function isNetworkTimeoutError(error: unknown): error is NetworkTimeoutError {
  return error instanceof NetworkTimeoutError;
}

/**
 * Runs `run` and rejects with `createError()` if it hasn't settled within
 * `timeoutMs`. The task receives an AbortSignal that is aborted on timeout
 * (pass it to fetch to actually cancel the request); tasks that can't be
 * cancelled may ignore it - the caller still stops waiting. The timer is
 * always cleared, and whatever the abandoned task later rejects with is
 * swallowed by the race, so it never surfaces as an unhandled rejection.
 */
export async function withTimeout<T>(
  run: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  createError: () => Error,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      // Reject BEFORE aborting: aborting makes a signal-aware task (fetch)
      // reject with its own AbortError, which would otherwise win the race
      // and hide that this was a timeout.
      reject(createError());
      controller.abort();
    }, timeoutMs);
  });

  try {
    return await Promise.race([run(controller.signal), timeout]);
  } finally {
    clearTimeout(timer);
  }
}
