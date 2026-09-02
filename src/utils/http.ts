import { safeError } from "./security.js";

export interface ZCodeFetchOptions extends RequestInit {
  timeoutMs?: number;
}

/**
 * Robust fetch with timeout and error handling.
 */
export async function zcodeFetch(
  url: string | URL,
  options: ZCodeFetchOptions = {},
): Promise<Response> {
  const { timeoutMs = 30_000, signal, ...init } = options,
    controller = new AbortController();
  let timedOut = false;
  const timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs),
    abortListener = () => controller.abort();
  signal?.addEventListener("abort", abortListener);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (timedOut) {
      throw new Error(`Request timeout after ${timeoutMs}ms: ${url.toString()}`);
    }
    throw new Error(safeError(error));
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener("abort", abortListener);
  }
}
