import { createHmac, timingSafeEqual } from "node:crypto";
import { TokolakuWebhookSignatureError } from "./errors.js";

/** Verifikasi header `x-tokolaku-signature` (format `sha256=<hex>`,
 *  HMAC-SHA256(secret, rawBody)) — compare timing-safe. rawBody HARUS
 *  string mentah persis seperti diterima (bukan hasil re-serialize).
 *  Hex format strict: exactly 64 hex chars, case-insensitive. */
export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | undefined,
  secret: string,
): boolean {
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const hex = signatureHeader.slice("sha256=".length);
  if (!/^[0-9a-f]{64}$/i.test(hex)) return false; // strict: exactly 64 hex chars, reject trailing garbage
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  const given = Buffer.from(hex, "hex");
  return timingSafeEqual(given, expected);
}

/** Verify + parse. Signature invalid → throw TokolakuWebhookSignatureError.
 *  Signature VALID tapi rawBody bukan JSON valid → SyntaxError dari JSON.parse
 *  (sengaja tidak dibungkus — itu bug payload, bukan soal keamanan). */
export function constructEvent<T = unknown>(
  rawBody: string,
  signatureHeader: string | undefined,
  secret: string,
): { event: T } {
  if (!verifyWebhookSignature(rawBody, signatureHeader, secret)) {
    throw new TokolakuWebhookSignatureError();
  }
  return { event: JSON.parse(rawBody) as T };
}
