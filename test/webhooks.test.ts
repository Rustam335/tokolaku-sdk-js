import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verifyWebhookSignature, constructEvent } from "../src/webhooks.ts";
import { TokolakuWebhookSignatureError } from "../src/errors.ts";

const SECRET = "whsec_rahasia_123";
const BODY = JSON.stringify({ event: "message.received", data: { text: "halo kak" } });
const sign = (secret: string, body: string) => "sha256=" + createHmac("sha256", secret).update(body).digest("hex");

test("verify: signature valid -> true", () => {
  assert.equal(verifyWebhookSignature(BODY, sign(SECRET, BODY), SECRET), true);
});

test("verify: salah secret / body diubah / tanpa prefix / undefined -> false (tanpa throw)", () => {
  assert.equal(verifyWebhookSignature(BODY, sign("salah", BODY), SECRET), false);
  assert.equal(verifyWebhookSignature(BODY + "x", sign(SECRET, BODY), SECRET), false);
  assert.equal(verifyWebhookSignature(BODY, sign(SECRET, BODY).slice(7), SECRET), false);
  assert.equal(verifyWebhookSignature(BODY, undefined, SECRET), false);
  assert.equal(verifyWebhookSignature(BODY, "sha256=zzzz", SECRET), false); // panjang beda — tidak boleh throw
});

test("constructEvent: valid -> parse; invalid -> TokolakuWebhookSignatureError", () => {
  const { event } = constructEvent<{ event: string }>(BODY, sign(SECRET, BODY), SECRET);
  assert.equal(event.event, "message.received");
  assert.throws(() => constructEvent(BODY, "sha256=deadbeef", SECRET), TokolakuWebhookSignatureError);
  assert.throws(() => constructEvent(BODY, undefined, SECRET), TokolakuWebhookSignatureError);
});
