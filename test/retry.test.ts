import { test } from "node:test";
import assert from "node:assert/strict";
import { Tokolaku } from "../src/client.ts";
import { TokolakuAPIError, TokolakuRateLimitError } from "../src/errors.ts";
import { retryDelayMs } from "../src/retry.ts";

function seqFetch(seq: Array<{ status: number; body: unknown; headers?: Record<string, string> } | { status: number; raw: string; headers?: Record<string, string> } | "network" | "abort">) {
  let i = 0;
  const impl = (async (_url: any, init: any) => {
    const step = seq[Math.min(i++, seq.length - 1)]!;
    if (step === "network") throw new TypeError("fetch failed");
    if (step === "abort") {
      const e = new Error("aborted"); e.name = "AbortError"; throw e;
    }
    if ("raw" in step) {
      return new Response(step.raw, { status: step.status, headers: step.headers });
    }
    return new Response(JSON.stringify(step.body), { status: step.status, headers: step.headers });
  }) as typeof fetch;
  return { impl, count: () => i };
}

const MALFORMED_JSON = { status: 200, raw: "{not valid json" };

const OK_REPLY = { status: 200, body: { reply: "ok", parts: ["ok"] } };
const OK_MSG = { status: 200, body: { id: "m", channel_id: "c", to: "628", type: "text", status: "sent", provider_message_id: null, charged_idr: 0 } };
const ERR_429 = { status: 429, body: { error: { code: "rate_limited", message: "pelan-pelan" } } };
const ERR_503 = { status: 503, body: { error: { code: "unavailable", message: "sebentar" } } };

test("botReply: 429 lalu sukses -> di-retry (2 panggilan)", async () => {
  const { impl, count } = seqFetch([ERR_429, OK_REPLY]);
  const tk = new Tokolaku({ apiKey: "k", fetchImpl: impl, maxRetries: 2 });
  const r = await tk.botReply({ message: "hai" });
  assert.equal(r.reply, "ok");
  assert.equal(count(), 2);
});

test("botReply: 503 dan network error di-retry", async () => {
  const { impl, count } = seqFetch([ERR_503, "network", OK_REPLY]);
  const tk = new Tokolaku({ apiKey: "k", fetchImpl: impl, maxRetries: 2 });
  await tk.botReply({ message: "hai" });
  assert.equal(count(), 3);
});

test("botReply: maxRetries dihormati (429 terus -> throw RateLimitError setelah 1+maxRetries panggilan)", async () => {
  const { impl, count } = seqFetch([ERR_429]);
  const tk = new Tokolaku({ apiKey: "k", fetchImpl: impl, maxRetries: 2 });
  await assert.rejects(() => tk.botReply({ message: "hai" }), TokolakuRateLimitError);
  assert.equal(count(), 3); // 1 asli + 2 retry
});

test("messages.send: 429 di-retry, network TypeError di-retry", async () => {
  const { impl, count } = seqFetch([ERR_429, "network", OK_MSG]);
  const tk = new Tokolaku({ apiKey: "k", fetchImpl: impl, maxRetries: 2 });
  await tk.messages.send({ to: "628", text: "hai" });
  assert.equal(count(), 3);
});

test("messages.send: 503 TIDAK di-retry (uang-sadar)", async () => {
  const { impl, count } = seqFetch([ERR_503, OK_MSG]);
  const tk = new Tokolaku({ apiKey: "k", fetchImpl: impl, maxRetries: 2 });
  await assert.rejects(() => tk.messages.send({ to: "628", text: "hai" }), TokolakuAPIError);
  assert.equal(count(), 1);
});

test("timeout (AbortError) TIDAK di-retry di kedua endpoint; code='timeout'", async () => {
  const a = seqFetch(["abort", OK_REPLY]);
  const tk1 = new Tokolaku({ apiKey: "k", fetchImpl: a.impl, maxRetries: 2 });
  await assert.rejects(() => tk1.botReply({ message: "x" }), (e: TokolakuAPIError) => e.code === "timeout");
  assert.equal(a.count(), 1);
  const b = seqFetch(["abort", OK_MSG]);
  const tk2 = new Tokolaku({ apiKey: "k", fetchImpl: b.impl, maxRetries: 2 });
  await assert.rejects(() => tk2.messages.send({ to: "628", text: "x" }), (e: TokolakuAPIError) => e.code === "timeout");
  assert.equal(b.count(), 1);
});

test("body 200 tapi JSON rusak: TIDAK di-retry (messages & botReply), code='invalid_response'", async () => {
  // messages.send: 1 panggilan saja, throw TokolakuAPIError code invalid_response status 200
  const a = seqFetch([MALFORMED_JSON, OK_MSG]);
  const tk1 = new Tokolaku({ apiKey: "k", fetchImpl: a.impl, maxRetries: 2 });
  await assert.rejects(
    () => tk1.messages.send({ to: "628", text: "hai" }),
    (e: TokolakuAPIError) => e.code === "invalid_response" && e.status === 200,
  );
  assert.equal(a.count(), 1);

  // botReply: sama — retry invalid_response juga membakar kuota, non-retryable untuk keduanya
  const b = seqFetch([MALFORMED_JSON, OK_REPLY]);
  const tk2 = new Tokolaku({ apiKey: "k", fetchImpl: b.impl, maxRetries: 2 });
  await assert.rejects(
    () => tk2.botReply({ message: "hai" }),
    (e: TokolakuAPIError) => e.code === "invalid_response" && e.status === 200,
  );
  assert.equal(b.count(), 1);
});

test("Retry-After dihormati oleh retryDelayMs", () => {
  assert.equal(retryDelayMs(0, 3), 3000);
  const d = retryDelayMs(1, null);
  assert.ok(d >= 250 && d <= 1000, `delay ${d} di luar [250,1000]`);
});
