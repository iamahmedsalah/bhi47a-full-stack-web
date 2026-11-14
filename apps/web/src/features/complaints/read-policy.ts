/** Interactive reads have a bounded wait; writes retain their existing policy. */
export const COMPLAINT_READ_TIMEOUT_MS = 10_000;

export function complaintReadOptions(signal?: AbortSignal) {
  return { signal, timeout: COMPLAINT_READ_TIMEOUT_MS };
}
