export interface RetryOptions {
  attempts?: number;
  baseDelayMs?: number;
  signal?: AbortSignal;
  shouldRetry?: (error: unknown) => boolean;
}

const defaultRetryable = (error: unknown) => {
  const status = Number((error as { status?: number })?.status || 0);
  return !status || status === 408 || status === 429 || status >= 500;
};

/** Use somente com leituras ou operações que tenham chave de idempotência. */
export async function withSafeRetry<T>(operation: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const { attempts = 3, baseDelayMs = 300, signal, shouldRetry = defaultRetryable } = options;
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (signal?.aborted) throw new DOMException('Operação cancelada', 'AbortError');
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === attempts - 1 || !shouldRetry(error)) throw error;
      await new Promise<void>((resolve, reject) => {
        const timer = window.setTimeout(resolve, baseDelayMs * 2 ** attempt);
        signal?.addEventListener('abort', () => {
          window.clearTimeout(timer);
          reject(new DOMException('Operação cancelada', 'AbortError'));
        }, { once: true });
      });
    }
  }
  throw lastError;
}
