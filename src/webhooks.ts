import { createHmac, timingSafeEqual } from "node:crypto";
import { TokolakuWebhookSignatureError } from "./errors.js";

/** Verifikasi header `x-tokolaku-signature` (format `sha256=<hex>`,
 *  HMAC-SHA256(secret, rawBody)) — compare timing-safe. rawBody HARUS
 *  string mentah persis seperti diterima (bukan hasil re-serialize). */
export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | undefined,
  secret: string,
): boolean {
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  let given: Buffer;
  try {
    given = Buffer.from(signatureHeader.slice("sha256=".length), "hex");
  } catch {
    return false;
  }
  if (given.length !== expected.length) return false;
  return timingSafeEqual(given, expected);
}

/** Verify + parse. Signature invalid → throw TokolakuWebhookSignatureError. */
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
