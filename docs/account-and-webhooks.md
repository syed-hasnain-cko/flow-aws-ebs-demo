# Account Settings (BYO account) + Webhooks tab

> Moved verbatim from CLAUDE.md. Update this page (not CLAUDE.md) when you change this area.

## Session Summary (2026-11-05) — Account Settings (bring your own Checkout.com account)

### What was built
A **Settings** page (bottom of the side nav, ⚙️) + header badge ("Default account" / "🔑 Custom account · …9999") that lets a visitor test THEIR OWN Checkout.com sandbox account: secret key, public key, processing channel, currency account, API base URL (may carry an account prefix), access key id/secret, access URL, webhook secret. Per field: custom value if set, otherwise the server's env default. The page shows the env defaults **masked** (prefix + last 4), per-field "↺ use default", "Reset everything to defaults", "Test credentials" (real 401/404 probe for the secret key, token request for the access key), and a keep-for (1h/8h/24h/7d) selector.

### How it works (read before touching credentials anywhere)
- `POST /account/seal` validates the values and returns an **AES-256-GCM sealed token** (key = env `CONFIG_SEAL_KEY`, server-side only). The server stores nothing. The browser keeps only the token + masked display values in `localStorage['cko-account-config']`; `modules/account-config.js` (loaded right after `frontend-config.js` on index/success/failure) wraps `fetch` to add `Authorization: Bearer acct.<token>` to calls to `APP_CONFIG.apiBaseUrl`, and overrides `APP_CONFIG.publicKey/processingChannelId/currencyAccountId`. `Authorization` is used (not a custom header) because API Gateway's MOCK OPTIONS only allows Content-Type, Authorization, X-Amz-*, X-Api-Key.
- Backend `account-config.js`: `middleware` (mounted at the top of `api-route-controller.js`, with `/account` routes) opens the token for ONE request via AsyncLocalStorage. `install(config)` turns `config.sk/pk/processingChannelId/currencyAccountId/ckoAccess*` into request-aware getters, so existing code keeps reading `config.sk`. **Use `config.sk` (never a module-level copy), `accountConfig.gwUrl()` (never `process.env.GW_URL`) and `accountConfig.getCko(config)` / the `cko` Proxy (never `new Checkout(...)`) in any new route** or custom accounts silently won't work there. `x-account-config: active|expired|invalid` response header tells the browser to drop a bad token.
- Safety: URLs must be `https://[prefix.]api[.sandbox].checkout.com` / `…access[.sandbox].checkout.com/connect/token` (else the visitor's key could be sent to any host); formats validated per field; raw secrets are never returned (only masks) or logged; no `CONFIG_SEAL_KEY` → sealing refused (503), defaults only. OAuth token cache in `standalone-routes.js` is keyed by client id + URL + scope.
- Webhooks: `/webhook` accepts the default `WEBHOOK_SECRET` plus secrets of currently-active custom accounts (in-memory registry, per warm Lambda container, filled on seal and on every request that carries the token — best-effort).

### Limits (by design)
A token can't be revoked before it expires (stateless) — keep durations short, sandbox keys only. Forward API, Stripe and Adyen tabs keep their own credentials (the Forward routes still use `process.env.GW_URL`). A tracked `ngrokToken` literal sits in `amplify/.../src/config.js` — should be moved to env/removed.

### Deploy notes
`/release` handles it: creates the `/account` + `/account/{proxy+}` API Gateway resources and adds `CONFIG_SEAL_KEY` (generated into local `.env`, `copy-local` in `env.manifest.json`) to the Lambda. Verified locally (no AWS): masked defaults, seal/test/reset, URL allowlist, tampered token → defaults, per-field fallback, webhook registry, 23 Playwright checks on the Settings flow.

---

## Session Summary (2026-11-05) — Webhooks tab (Workflows API) + webhook auth with custom accounts

- **Webhook auth**: while any custom account is active (sealed/used; in-memory per container, `accountConfig.customAccountActive()`), `POST /webhook` accepts events WITHOUT checking the secret (it belongs to the visitor's own processing channel). Default account: secret still required.
- **Webhooks nav item** (📡, Tools group): `tabs/webhooks.html`, `modules/webhooks.js`. Two views: **Manage** (list/create/edit/enable-disable/test/delete workflows, event picker from `GET /workflows/event-types`, "Send events to this app" = workflow → `<apiBase>/webhook`) and **Inspector** (events by subject id, per-event delivery status/attempts, replay by event / event+workflow / subject). Events come from Checkout.com, so they survive Lambda container changes. A collapsed "live feed" still shows this container's buffer.
- **No new API Gateway route**: `POST /standalone/vault` allowlist now passes the `/workflows/*` calls (`WF_RE` in `standalone-routes.js`, incl. PUT). **Redeploy the Lambda.** Key needs scopes `flow`, `flow:workflows`, `flow:events`, `flow:reflow`.
- After **Save** in Settings with a custom account, `localStorage['cko-webhook-offer']` makes the next load show a dialog offering to create the workflow (yes / choose events / not now).
- Not verified against the live API: response shapes of `event-types` and subject events are parsed defensively.

---

## Shared webhook event store (2026-11-05)

**Problem**: every Lambda container kept webhooks in its own memory, so an event delivered to container A was invisible to a poll answered by container B (measured on the live API: 22 of 30 simultaneous reads missed an event that Checkout.com had delivered successfully). Affected every tab that waits for a webhook.

**Now**: all webhook endpoints read and write one DynamoDB table, `flowDemoWebhookEvents-staging` (on-demand, TTL attribute `ttl`, 15 min default; Adyen queue 5 min / history 1 h). Code: `amplify/.../src/webhook-store.js` (`put`, `take('latest'|'oldest')`, `all`, `recent`). Table keys: `pk` = `<namespace>#<id>` (or `<namespace>#__ALL` for the ring buffer), `sk` = `<receivedAt ms>#<event id>`. Redelivered events (same event id) collapse into one and a consume removes every copy.

| Endpoint | Namespace | Behaviour (unchanged for callers) |
|---|---|---|
| `POST /webhook` → `GET /webhook-event?paymentId=` | `cko` (slot) | one slot per id, last arrival wins, consumed on read (success/failure pages, Payment Setup, Payouts, Wallets, Auth Types, Disputes) |
| `GET /standalone/webhook-events` | `cko` ring (`__ALL`, newest 200) | non-consuming; `seq` is now the receive time in ms (comparable across containers) |
| Stripe `/webhook` → `/webhook-event?id=` | `stripe` (slot) | one slot per id, consumed |
| Adyen `/webhook` → `/webhook-event?id=` (+ `peek=1`) | `adyen` (queue, oldest first) / `adyen-hist` | queue consumed one per call; peek is non-consuming |

**Safety net**: if a DynamoDB write fails (outage, missing permission, SDK absent) the event is kept in that container's memory and reads merge both — worst case is the old per-container behaviour, never a dropped event or a failed 200 to Checkout.com. While DynamoDB is healthy nothing is mirrored in memory (otherwise one container could re-serve an event another already consumed). Reads use `ConsistentRead`; expired items are filtered on read because DynamoDB TTL deletes lazily.

**AWS resources**: `npm run webhook:store` (dry run) / `-- --apply` creates the table, enables TTL and adds the inline policy `flowDemoWebhookEventsAccess` (PutItem/GetItem/Query/DeleteItem/BatchWriteItem on that one table) to the Lambda's execution role. Idempotent. Created 2026-11-05. The Lambda uses the AWS SDK v3 provided by the Node.js runtime (not bundled in the zip). `WEBHOOK_TABLE` env var overrides the table name (has a default, so `lambda:env` does not require it).

**Consume is atomic, and the one-slot stores really are one slot** (found by live burst tests): with "read, then delete", 12 of 20 simultaneous `/webhook-event` reads were each handed the same event; after switching to an atomic claim (`DeleteItem … ReturnValues: ALL_OLD`) it was still 2 of 20, because a payment has several events under one id (`payment_captured` + `payment_approved`) and a late racer could claim the older one after the winner took the newest. Fix: the Checkout.com and Stripe one-slot stores use `put(…, { slot: true })` — ONE item per id (`sk = "slot"`) that each new event overwrites, exactly like the old `Map.set` — so consuming is a single atomic delete and only one caller can win. The Adyen queue keeps one item per event (each claimed atomically; a caller that loses moves on to the next). As before, the last event to ARRIVE wins the slot (events can arrive out of order: `payment_captured` was received before `payment_approved` for the same payment). The unit test (`store-test`) cannot reproduce the race — it needs real network latency — so the live check below is the real verification.

**Verify after a deploy**: make a payment, wait ~10 s, then fire 30 simultaneous `GET /standalone/webhook-events?match=<pay_id>&cb=<n>` reads — every read should see the event (before: 8/30, then 0/30; after the first release: 30/30 twice). Then fire 20 simultaneous `GET /webhook-event?paymentId=<pay_id>` reads — exactly ONE must return `found: true`.
