// test/client.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { Tokolaku } from "../src/client.ts";
import { TokolakuAuthenticationError, TokolakuValidationError } from "../src/errors.ts";

type Call = { url: string; init: RequestInit };
function mockFetch(responses: Array<{ status: number; body: unknown }>) {
  const calls: Call[] = [];
  const impl = (async (url: any, init: any) => {
    calls.push({ url: String(url), init });
    const r = responses[Math.min(calls.length - 1, responses.length - 1)]!;
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { impl, calls };
}

test("botReply: URL, header Bearer, body benar; response typed", async () => {
  const { impl, calls } = mockFetch([{ status: 200, body: { reply: "Halo!", parts: ["Halo!"] } }]);
  const tk = new Tokolaku({ apiKey: "tk_test_sk_abc", fetchImpl: impl });
  const res = await tk.botReply({ message: "halo", session_id: "s1" });
  assert.equal(res.reply, "Halo!");
  assert.equal(calls[0]!.url, "https://api.tokolaku.id/api/v1/bot/reply");
  const h = calls[0]!.init.headers as Record<string, string>;
  assert.equal(h["authorization"], "Bearer tk_test_sk_abc");
  assert.equal(h["content-type"], "application/json");
  assert.deepEqual(JSON.parse(String(calls[0]!.init.body)), { message: "halo", session_id: "s1" });
});

test("messages.send text: type diinferensi 'text'", async () => {
  const { impl, calls } = mockFetch([{ status: 200, body: { id: "m1", channel_id: "c1", to: "628", type: "text", status: "sent", provider_message_id: null, charged_idr: 0 } }]);
  const tk = new Tokolaku({ apiKey: "k", fetchImpl: impl });
  const res = await tk.messages.send({ to: "628", text: "hai" });
  assert.equal(res.status, "sent");
  assert.deepEqual(JSON.parse(String(calls[0]!.init.body)), { to: "628", type: "text", text: "hai" });
});

test("messages.send template: type 'template' + field diteruskan", async () => {
  const { impl, calls } = mockFetch([{ status: 200, body: { id: "m2", channel_id: "c1", to: "628", type: "template", status: "sent", provider_message_id: "wamid.x", charged_idr: 350 } }]);
  const tk = new Tokolaku({ apiKey: "k", fetchImpl: impl });
  await tk.messages.send({ to: "628", template: { name: "order_update", language: "id", category: "utility" }, channel_id: "ch1", country_code: "ID" });
  assert.deepEqual(JSON.parse(String(calls[0]!.init.body)), {
    to: "628", type: "template",
    template: { name: "order_update", language: "id", category: "utility" },
    channel_id: "ch1", country_code: "ID",
  });
});

test("messages.send: text+template bersamaan / kosong -> TokolakuValidationError SEBELUM fetch", async () => {
  const { impl, calls } = mockFetch([{ status: 200, body: {} }]);
  const tk = new Tokolaku({ apiKey: "k", fetchImpl: impl });
  await assert.rejects(() => tk.messages.send({ to: "628", text: "x", template: { name: "n", language: "id", category: "utility" } } as never), TokolakuValidationError);
  await assert.rejects(() => tk.messages.send({ to: "628" } as never), TokolakuValidationError);
  assert.equal(calls.length, 0);
});

test("error respons dipetakan ke class (401 -> AuthenticationError)", async () => {
  const { impl } = mockFetch([{ status: 401, body: { error: { code: "invalid_key", message: "API key tidak valid" } } }]);
  const tk = new Tokolaku({ apiKey: "salah", fetchImpl: impl });
  await assert.rejects(() => tk.botReply({ message: "hai" }), (e: unknown) => {
    assert.ok(e instanceof TokolakuAuthenticationError);
    assert.equal((e as TokolakuAuthenticationError).code, "invalid_key");
    return true;
  });
});

test("konstruktor string + baseUrl custom", async () => {
  const { impl, calls } = mockFetch([{ status: 200, body: { reply: "ok", parts: ["ok"] } }]);
  const tk = new Tokolaku("tk_live_sk_x");
  assert.ok(tk instanceof Tokolaku); // konstruktor string valid
  const tk2 = new Tokolaku({ apiKey: "k", baseUrl: "http://localhost:3011", fetchImpl: impl });
  await tk2.botReply({ message: "hai" });
  assert.equal(calls[0]!.url, "http://localhost:3011/api/v1/bot/reply");
});
