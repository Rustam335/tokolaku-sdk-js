import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TokolakuAPIError, TokolakuAuthenticationError, TokolakuInsufficientBalanceError,
  TokolakuPermissionError, TokolakuRateLimitError, TokolakuValidationError,
  mapResponseError,
} from "../src/errors.ts";

const envelope = (code: string, message: string) => JSON.stringify({ error: { code, message } });

test("mapResponseError: 401 -> AuthenticationError dengan code dari envelope", () => {
  const e = mapResponseError(401, envelope("invalid_key", "API key tidak valid"));
  assert.ok(e instanceof TokolakuAuthenticationError);
  assert.ok(e instanceof TokolakuAPIError);
  assert.equal(e.status, 401);
  assert.equal(e.code, "invalid_key");
  assert.equal(e.message, "API key tidak valid");
});

test("mapResponseError: mapping kategori lengkap", () => {
  assert.ok(mapResponseError(400, envelope("invalid_body", "x")) instanceof TokolakuValidationError);
  assert.ok(mapResponseError(422, envelope("ai_not_configured", "x")) instanceof TokolakuValidationError);
  assert.ok(mapResponseError(402, envelope("insufficient_balance", "x")) instanceof TokolakuInsufficientBalanceError);
  assert.ok(mapResponseError(403, envelope("invalid_scope", "x")) instanceof TokolakuPermissionError);
  assert.ok(mapResponseError(429, envelope("quota_exceeded", "x")) instanceof TokolakuRateLimitError);
});

test("mapResponseError: 500 & 404 -> base TokolakuAPIError (bukan subclass)", () => {
  const e = mapResponseError(500, envelope("send_failed", "x"));
  assert.equal(Object.getPrototypeOf(e).constructor, TokolakuAPIError);
  assert.equal(mapResponseError(404, "").status, 404);
});

test("mapResponseError: body non-JSON -> code null, message dipotong 500 char", () => {
  const e = mapResponseError(502, "Bad Gateway " + "y".repeat(600));
  assert.equal(e.code, null);
  assert.ok(e.message.length <= 500);
});

test("mapResponseError: body kosong -> message 'HTTP <status>'", () => {
  assert.equal(mapResponseError(503, "").message, "HTTP 503");
});
