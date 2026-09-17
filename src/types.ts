// src/types.ts
export type TokolakuOptions = {
  apiKey: string;
  /** Default "https://api.tokolaku.id" */
  baseUrl?: string;
  /** Default 30_000 ms */
  timeoutMs?: number;
  /** Default 2 — lihat kebijakan retry per endpoint di README */
  maxRetries?: number;
  /** Default globalThis.fetch — untuk testing/runtime custom */
  fetchImpl?: typeof fetch;
};

export type BotReplyParams = {
  /** Pesan pelanggan, 1..4000 char */
  message: string;
  /** ID sesi percakapan (≤120 char) — jaga konteks multi-turn */
  session_id?: string;
  history?: { role: "user" | "assistant"; content: string }[];
};

export type BotReplyResponse = { reply: string; parts: string[] };

export type SendTextParams = { to: string; text: string; channel_id?: string };

export type SendTemplateParams = {
  to: string;
  template: {
    name: string;
    language: string;
    category: "marketing" | "utility" | "authentication";
    components?: unknown[];
  };
  channel_id?: string;
  /** ISO-2, default "ID" di server */
  country_code?: string;
};

export type SendMessageParams = SendTextParams | SendTemplateParams;

export type SendMessageResponse = {
  id: string;
  channel_id: string;
  to: string;
  type: "text" | "template";
  status: "sent";
  provider_message_id: string | null;
  charged_idr: number;
};
