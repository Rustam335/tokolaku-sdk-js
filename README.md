# tokolaku-sdk

Official TypeScript/JavaScript SDK for the Tokolaku Engine API — AI bot replies, omnichannel messaging (WhatsApp/Instagram/Messenger), and webhook verification.

## Install

```bash
npm install tokolaku-sdk
# or
yarn add tokolaku-sdk
```

## Quickstart

*Bahasa Indonesia ringkas: buat instance `Tokolaku` dengan API key, lalu panggil `botReply` untuk balasan AI atau `messages.send` untuk kirim pesan lewat channel resmi (WhatsApp/Instagram/Messenger) yang sudah terhubung.*

```ts
import { Tokolaku } from "tokolaku-sdk";
// CommonJS: const { Tokolaku } = require("tokolaku-sdk");

const tokolaku = new Tokolaku(process.env.TOKOLAKU_API_KEY!);
// or with options: new Tokolaku({ apiKey, baseUrl, timeoutMs, maxRetries })

// 1. AI bot reply for a single customer message
const { reply, parts } = await tokolaku.botReply({
  message: "Halo, apakah produk ini ready stock?",
  session_id: "wa:628123456789", // keeps multi-turn context
});
console.log(reply);

// 2. Send a text message through a connected channel
const sent = await tokolaku.messages.send({
  to: "628123456789",
  text: "Terima kasih sudah menghubungi kami!",
  channel_id: "ch_abc123",
});
console.log(sent.id, sent.status);
```

`messages.send` also accepts a business-initiated template message — pass `template` instead of `text` (exactly one of the two, never both):

```ts
await tokolaku.messages.send({
  to: "628123456789",
  template: { name: "order_update", language: "id", category: "utility" },
  channel_id: "ch_abc123",
});
```

## Error handling

Every failed request rejects with an instance of `TokolakuAPIError` (or one of its subclasses). `status` is `null` when the request never got an HTTP response (network error, timeout); `code` is the backend's machine-readable error code when available.

| Class | HTTP status | When it's thrown |
|---|---|---|
| `TokolakuValidationError` | 400, 422 | Invalid request params — also thrown client-side before any network call (e.g. `messages.send` with both `text` and `template`, or neither) |
| `TokolakuAuthenticationError` | 401 | Missing or invalid API key |
| `TokolakuInsufficientBalanceError` | 402 | Tenant balance too low to cover the charge |
| `TokolakuPermissionError` | 403 | API key lacks permission for this action |
| `TokolakuRateLimitError` | 429 | Rate limit exceeded |
| `TokolakuAPIError` | any other status, or `null` | Base class — also covers network errors, timeouts, and malformed responses not mapped above |
| `TokolakuWebhookSignatureError` | — | Webhook signature missing or invalid (does **not** extend `TokolakuAPIError`) |

```ts
import { Tokolaku, TokolakuAPIError, TokolakuInsufficientBalanceError, TokolakuRateLimitError } from "tokolaku-sdk";

try {
  await tokolaku.botReply({ message: "Halo" });
} catch (err) {
  if (err instanceof TokolakuInsufficientBalanceError) {
    // top up balance, notify the tenant
  } else if (err instanceof TokolakuRateLimitError) {
    // back off and retry later
  } else if (err instanceof TokolakuAPIError) {
    console.error(err.status, err.code, err.message);
  } else {
    throw err; // not an SDK error
  }
}
```

## Retry policy

The SDK retries automatically (`maxRetries`, default `2`) using exponential backoff with full jitter (base 250ms, capped at 1s; a `Retry-After` response header wins when present). The policy is **money-aware**: it only retries when a retry cannot cause a duplicate side effect.

| Condition | `botReply` | `messages.send` |
|---|---|---|
| `429 Too Many Requests` | Retried | Retried |
| Network error (`fetch` throws) | Retried | Retried |
| `5xx` server error | Retried | **Not** retried |
| Timeout (`code: "timeout"`) | **Not** retried | **Not** retried |
| `2xx` with malformed JSON body (`code: "invalid_response"`) | **Not** retried | **Not** retried |

- `botReply` has no side effect if it fails, so it retries on `429`, any `5xx`, and network errors.
- **`messages.send` TIDAK di-retry pada timeout/5xx karena pesan mungkin sudah terkirim** — the message may already have been sent and charged even though the client never saw a successful response, and the API does not yet expose an idempotency key. It only retries on `429` and network errors (no HTTP response was ever received, so nothing could have been sent).
- A timeout (`code: "timeout"`) is never retried on either endpoint, since it's ambiguous whether the server received/processed the request.
- A `2xx` response with a body that fails to parse as JSON (`code: "invalid_response"`, `status: 200`) is never retried on either endpoint — the request already reached the server and had its side effect (reply generated / message sent and charged); retrying would risk a double-send or burning AI quota for nothing.

## Webhooks

Verify the `x-tokolaku-signature` header (`sha256=<hex>`, HMAC-SHA256 of the **raw** request body) before trusting a webhook payload. Always use the raw, unmodified request body — a re-serialized JSON string will not match the signature.

```ts
import { verifyWebhookSignature, constructEvent, TokolakuWebhookSignatureError } from "tokolaku-sdk/webhooks";
```

### Express

```ts
import express from "express";
import { constructEvent, TokolakuWebhookSignatureError } from "tokolaku-sdk/webhooks";

const app = express();

app.post(
  "/webhooks/tokolaku",
  express.raw({ type: "application/json" }), // keep the raw Buffer — do NOT use express.json() on this route
  (req, res) => {
    const rawBody = req.body.toString("utf8");
    try {
      const { event } = constructEvent(rawBody, req.header("x-tokolaku-signature"), process.env.TOKOLAKU_WEBHOOK_SECRET!);
      // ... handle event
      res.json({ received: true });
    } catch (err) {
      if (err instanceof TokolakuWebhookSignatureError) {
        return res.status(401).json({ error: "invalid signature" });
      }
      throw err;
    }
  },
);
```

### Fastify

```ts
import Fastify from "fastify";
import { constructEvent, TokolakuWebhookSignatureError } from "tokolaku-sdk/webhooks";

const app = Fastify();

// Capture the raw body before Fastify's default JSON parser touches it.
app.addContentTypeParser("application/json", { parseAs: "string" }, (req, body, done) => {
  (req as any).rawBody = body;
  try {
    done(null, JSON.parse(body as string));
  } catch (err) {
    done(err as Error);
  }
});

app.post("/webhooks/tokolaku", async (req, reply) => {
  try {
    const { event } = constructEvent((req as any).rawBody, req.headers["x-tokolaku-signature"] as string, process.env.TOKOLAKU_WEBHOOK_SECRET!);
    // ... handle event
    return reply.send({ received: true });
  } catch (err) {
    if (err instanceof TokolakuWebhookSignatureError) {
      return reply.code(401).send({ error: "invalid signature" });
    }
    throw err;
  }
});
```

## Requirements

- Node.js ≥ 18

## License

MIT

## Docs

Full API reference: [https://tokolaku.id/api-docs](https://tokolaku.id/api-docs)
