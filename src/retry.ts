import { TokolakuAPIError } from "./errors.js";

export type RetryPolicy = "botReply" | "messages";

/** Retry uang-sadar:
 *  - botReply: 429, 5xx, network error (tanpa efek samping bila gagal).
 *  - messages: HANYA 429 + network TypeError (pesan mungkin sudah terkirim
 *    & tercharge pada timeout/5xx — API belum punya idempotency key).
 *  - timeout (code "timeout") TIDAK pernah di-retry. */
export function shouldRetry(policy: RetryPolicy, error: TokolakuAPIError): boolean {
  if (error.code === "timeout") return false;
  if (error.status === 429) return true;
  // "invalid_response" (200 OK tapi body JSON rusak) dan "response_read_error" (header
  // respons sudah diterima tapi baca body gagal) SENGAJA tidak match rule apa pun di
  // bawah ini — efek samping server sudah terjadi, jadi non-retryable untuk kedua policy.
  if (error.code === "network_error") return true;
  if (policy === "botReply" && error.status !== null && error.status >= 500) return true;
  return false;
}

/** Exponential backoff + full jitter, base 250ms cap 1s; Retry-After menang. */
export function retryDelayMs(attempt: number, retryAfterSec: number | null): number {
  if (retryAfterSec != null && Number.isFinite(retryAfterSec)) return Math.max(0, retryAfterSec * 1000);
  const cap = Math.min(1000, 250 * 2 ** attempt);
  return Math.round(cap * (0.5 + Math.random() * 0.5));
}
