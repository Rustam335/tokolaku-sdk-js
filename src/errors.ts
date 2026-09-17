/** Base error semua kegagalan API. `status` null = kegagalan sebelum ada
 *  respons HTTP (network/timeout). `code` = kode envelope BE, mis.
 *  "insufficient_balance"; null bila body bukan JSON envelope. */
export class TokolakuAPIError extends Error {
  readonly status: number | null;
  readonly code: string | null;
  constructor(message: string, opts: { status: number | null; code: string | null }) {
    super(message);
    this.name = new.target.name;
    this.status = opts.status;
    this.code = opts.code;
  }
}

export class TokolakuAuthenticationError extends TokolakuAPIError {}      // 401
export class TokolakuInsufficientBalanceError extends TokolakuAPIError {} // 402
export class TokolakuPermissionError extends TokolakuAPIError {}          // 403
export class TokolakuRateLimitError extends TokolakuAPIError {}           // 429
export class TokolakuValidationError extends TokolakuAPIError {}          // 400/422 + validasi klien

export class TokolakuWebhookSignatureError extends Error {
  constructor(message = "Signature webhook tidak valid") {
    super(message);
    this.name = "TokolakuWebhookSignatureError";
  }
}

const STATUS_CLASS: Record<number, new (m: string, o: { status: number | null; code: string | null }) => TokolakuAPIError> = {
  400: TokolakuValidationError,
  401: TokolakuAuthenticationError,
  402: TokolakuInsufficientBalanceError,
  403: TokolakuPermissionError,
  422: TokolakuValidationError,
  429: TokolakuRateLimitError,
};

/** Terjemahkan respons non-2xx jadi error class. Envelope BE:
 *  `{ error: { code, message } }`. Body non-JSON dipotong 500 char. */
export function mapResponseError(status: number, bodyText: string): TokolakuAPIError {
  let code: string | null = null;
  let message = bodyText ? bodyText.slice(0, 500) : `HTTP ${status}`;
  try {
    const parsed = JSON.parse(bodyText) as { error?: { code?: string; message?: string } };
    if (parsed?.error) {
      code = parsed.error.code ?? null;
      message = parsed.error.message ?? message;
    }
  } catch {
    /* non-JSON — pakai default */
  }
  const Cls = STATUS_CLASS[status] ?? TokolakuAPIError;
  return new Cls(message, { status, code });
}
