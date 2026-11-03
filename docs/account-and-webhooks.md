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
