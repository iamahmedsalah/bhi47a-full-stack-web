const MAX_AUTOMATIC_RETRY_MS = 5 * 60_000;

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' ? value as Record<string, unknown> : undefined;
}

export function queryErrorStatus(error: unknown): number | undefined {
  const item = record(error);
  const status = record(item?.response)?.status ?? item?.statusCode ?? item?.status;
  return typeof status === 'number' ? status : undefined;
}

/** A retry deadline is transport metadata, not a cached authorization decision. */
export function retryAfterDeadline(value: unknown, now = Date.now()): number | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const text = String(value).trim();
  if (!text) return undefined;
  const seconds = Number(text);
  if (Number.isFinite(seconds)) {
    const deadline = now + seconds * 1000;
    return seconds >= 0 && Number.isFinite(deadline) ? deadline : undefined;
  }
  const date = Date.parse(text);
  return Number.isFinite(date) ? Math.max(now, date) : undefined;
}

export function queryRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 1) return false;
  const status = queryErrorStatus(error);
  const deadline = record(error)?.retryAfterAt;
  if (typeof deadline === 'number' && deadline - Date.now() > MAX_AUTOMATIC_RETRY_MS) return false;
  if (status === 429) {
    return typeof deadline === 'number' && deadline - Date.now() <= MAX_AUTOMATIC_RETRY_MS;
  }
  // Permanent client/auth errors are not repaired by immediately repeating them.
  return status === undefined || status >= 500;
}

export function queryRetryDelay(attempt: number, error: unknown): number {
  const deadline = record(error)?.retryAfterAt;
  if (typeof deadline === 'number') return Math.max(0, deadline - Date.now());
  return Math.min(1000 * 2 ** Math.min(attempt, 4), 10_000);
}
