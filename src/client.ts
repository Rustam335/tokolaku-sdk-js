// src/client.ts
import { mapResponseError, TokolakuAPIError, TokolakuValidationError } from "./errors.js";
import type {
  BotReplyParams, BotReplyResponse, SendMessageParams, SendMessageResponse, TokolakuOptions,
} from "./types.js";

const DEFAULT_BASE_URL = "https://api.tokolaku.id";
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 2;

type RetryPolicy = "botReply" | "messages";

export class Tokolaku {
  readonly #apiKey: string;
  readonly #baseUrl: string;
  readonly #timeoutMs: number;
  readonly #maxRetries: number;
  readonly #fetch: typeof fetch;

  constructor(apiKeyOrOptions: string | TokolakuOptions) {
    const o: TokolakuOptions =
      typeof apiKeyOrOptions === "string" ? { apiKey: apiKeyOrOptions } : apiKeyOrOptions;
    if (!o.apiKey) throw new TokolakuValidationError("apiKey wajib diisi", { status: null, code: "missing_api_key" });
    this.#apiKey = o.apiKey;
    this.#baseUrl = (o.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.#timeoutMs = o.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.#maxRetries = o.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.#fetch = o.fetchImpl ?? globalThis.fetch;
  }

  /** Balasan AI bot tenant untuk satu pesan pelanggan (POST /api/v1/bot/reply). */
  async botReply(params: BotReplyParams): Promise<BotReplyResponse> {
    return this.#request<BotReplyResponse>("/api/v1/bot/reply", params, "botReply");
  }

  readonly messages = {
    /** Kirim pesan text/template via channel resmi (POST /api/v1/messages).
     *  `type` diinferensi: field `text` → "text", field `template` → "template". */
    send: async (params: SendMessageParams): Promise<SendMessageResponse> => {
      const hasText = "text" in params && params.text != null;
      const hasTemplate = "template" in params && (params as { template?: unknown }).template != null;
      if (hasText === hasTemplate) {
        throw new TokolakuValidationError(
          "Isi tepat satu: `text` (pesan sesi) ATAU `template` (business-initiated)",
          { status: null, code: "invalid_params" },
        );
      }
      const body = { ...params, type: hasText ? "text" : "template" };
      return this.#request<SendMessageResponse>("/api/v1/messages", body, "messages");
    },
  };

  async #request<T>(path: string, body: unknown, _policy: RetryPolicy): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.#timeoutMs);
    try {
      const res = await this.#fetch(`${this.#baseUrl}${path}`, {
        method: "POST",
        headers: {
          "authorization": `Bearer ${this.#apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const text = await res.text();
      if (!res.ok) throw mapResponseError(res.status, text);
      return JSON.parse(text) as T;
    } catch (e) {
      if (e instanceof TokolakuAPIError) throw e;
      if (e instanceof Error && e.name === "AbortError") {
        throw new TokolakuAPIError(`Timeout setelah ${this.#timeoutMs}ms`, { status: null, code: "timeout" });
      }
      const msg = e instanceof Error ? e.message : String(e);
      throw new TokolakuAPIError(`Network error: ${msg}`, { status: null, code: "network_error" });
    } finally {
      clearTimeout(timer);
    }
  }
}
