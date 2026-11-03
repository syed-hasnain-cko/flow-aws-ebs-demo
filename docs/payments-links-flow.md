# Payments Explorer, Hosted Page & Links, Checkout Flow options

> Moved verbatim from CLAUDE.md. Update this page (not CLAUDE.md) when you change this area.

## Session Summary (2026-10-31) — API logger upgrade + Payments Explorer

### API logger upgrade (`frontend/modules/api-log.js`)
All UI is created from `api-log.js` itself (the sidebar markup is duplicated in `main.html`, `success.html`, `failure.html`), so it works on every page.
- **Sidebar**: search box (matches method, status, path, URL and request/response field values, e.g. a card number or `pay_` id), result filter (All / 2xx / 4xx-5xx / Pinned), `N of M calls` count, **Export** (downloads the log as JSON), per-entry time + duration.
- **Detail modal**: status · duration · `cko-request-id` · timestamp, full `METHOD url` (click to copy), **Copy as cURL** (uses `$CKO_SECRET_KEY` / `${CKO_BASE_URL}` — a secret is never embedded; disabled for WEBHOOK entries and entries with no known URL), Copy request, Copy response, **Pin**. Esc closes.
- **Pin**: pinned entries survive CLEAR and reload (sessionStorage); shift-click CLEAR wipes pinned too.
- `addToApiLog(method, endpoint, status, req, res, url, meta)` — new optional 7th arg `meta = { duration_ms, request_id }`. Standalone/Vault/Payments callers pass it. Older tabs still log without url/meta.

### Payments Explorer (new top-level "Payments" tab)
Files: `tabs/payments.html`, `modules/payments-explorer.js` (tab wiring in `main.html`, `loader.js`, `index.html`).
- Lists the account's recent payments straight from the **Payment Search API** (`POST /payments/search`, newest first, default last 90 days) — no local registry needed. Free-text box is mapped to a search field (`pay_…` → `id`, email → `email`, 4 digits → `last4`, anything with `:` = raw query, else `reference`); filters for status / currency / period / page size; the exact query sent is shown under the bar.
- Detail pane: amount + status, copyable `pay_` / reference / `src_` / `cus_` chips, source, response, 3DS, risk, balances, **action history** (`GET /payments/{id}/actions`), **webhook timeline** (from the existing non-consuming `/standalone/webhook-events?match=<pay_id>` buffer), raw JSON.
- **Capture / Void / Refund** with optional `amount` + `reference`; buttons are enabled only when the payment's `_links` (or `balances.available_to_*`) allow it. After an action it re-checks at 3 s / 8 s / 15 s.
- **Backend**: no new route — the `POST /standalone/vault` allowlist now also passes `POST /payments/search`, `GET /payments/{pay_…}` (+ `/actions`) and `POST /payments/{pay_…}/captures|voids|refunds`. **Redeploy `standalone-routes.js`** (the Gateway method already exists/is pending from the Vault tab).
- Sandbox facts: Payment Search needs the key to carry `payments:search` (it does here); a payment created seconds ago can take a few moments to be searchable by query (the unfiltered list shows it sooner; pasting its `pay_` id always works). This account declines Visa CIT with `43102`, so test captures/refunds with a Mastercard. One request runs at a time; a click during a running request is queued (not dropped).

---

## Session Summary (2026-11-03) — Hosted Page & Links (Accept payments)

New nav item **Hosted Page & Links** (🔗, under *Accept payments*) → `tabs/links.html`, `modules/links.js`, `modules/cko-proxy.js`; catalogue data in `modules/data.js` (`LINK_PAYMENT_METHODS`, `SEPA_COUNTRIES`, `KLARNA_COUNTRIES`, `LINK_LOCALES`).

- One page, two products (pill switch): **Payment Link** (`POST /payment-links`, status via `GET /payment-links/{pl_…}`: Active / Payment Received / Expired) and **Hosted Payments Page** (`POST /hosted-payments`, `GET /hosted-payments/{hpp_…}`: Payment Pending…). Both work in this sandbox without extra enablement.
- **Every request option is an input**: amount/currency/billing country/reference/description/display_name/locale/payment_type/authorization_type; **link expiry** (`expires_in`: number + unit + chips, 1 s–60 days, live "expires at"); `return_url` (PL) / `success|cancel|failure_url` (HPP); customer, billing + shipping address, products basket, capture / `capture_on`, 3DS (enabled, attempt_n3d, allow_upgrade, challenge_indicator, exemption), risk, `customer_retry`, `card.store_payment_details`, HPP `stored_card.customer_id`, recurring `payment_plan`, `billing_descriptor`, metadata, **Extra JSON deep-merged**; a live **Request preview** shows the exact body.
- **Payment-method picker**: modes *Show everything available* / *Only these* (`allow_payment_methods`) / *Everything except these* (`disabled_payment_methods`); tiles grouped Cards & wallets · Bank & local · Pay later · Asia wallets; clicking a tile in "everything" mode switches to "only these". Each tile shows its country/currency rule (from the docs' "Payment method field requirements"); unavailable ones for the current country+currency are hidden by default (toggle; selected ones stay visible). An **estimate** line lists what the customer will likely see and what each method still needs (products, customer name, reference…). Real API behaviour: no usable method → 422 `no_payment_methods_available`.
- Result card: link + Open/Copy, live status polling (5 s, up to 15 min), expiry countdown, payment id → **Open in Payments**; "Recent" list (`cko-links-history`) with refresh-all. Presets for common setups.
- **No new route**: `POST /standalone/vault` allowlist now also passes `POST /payment-links|/hosted-payments` and `GET /payment-links/{pl_…}|/hosted-payments/{hpp_…}` — **redeploy `standalone-routes.js`**. `CkoProxy.call(method, path, body)` (cko-proxy.js) is the shared helper for proxied calls: logs only the Checkout.com exchange to the API log.
- Not exercised: opening the hosted page and paying (needs a browser session on pay.sandbox.checkout.com); the request side, link creation, status and expiry were verified against the real sandbox.

- **No background polling in Payments Explorer / Hosted Page & Links (user preference, 2026-11-03).** Nothing is fetched on tab open; status is read only on an explicit action: Payments → *Search* (1 call), open a payment (details + actions), *↻ Refresh* (search + open payment); Links/HPP → create = 1 POST (no status GET; shows "created"), *↻ Refresh status* / *Refresh all* / opening a Recent item = GET. After capture/void/refund the Explorer reloads once; later changes need ↻ Refresh. Keep it this way when extending these pages (the only timer left is the local expiry countdown — no network). Standalone 3DS session polling and the Standalone webhook list are unchanged.

---

## Session Summary (2026-11-03) — Checkout Flow: advanced session options

The Checkout Flow tab keeps its existing controls and default payload; a collapsed **Advanced session options** panel (`tabs/flow.html`, logic in `modules/flow-config.js`) lets the user override any other `POST /payment-sessions` field before **Render Standard Flow**.

- **Defaults are untouched**: every control starts at "(default)" and only changes the request once set. With no changes, Standard Flow sends byte-for-byte the same payload as before (verified equal to Tokenize Only's). A counter in the header shows "N changes"; **Reset to defaults** clears everything; the **Preview** section shows the exact request + a list of changed paths.
- **Standard flow only**: `createAndInitializeFlowSession(false)` in `flow.js` calls `window.FlowConfig.apply(paymentSessionBody)` (clones the base — never mutates it) and sends the result; Tokenize Only never calls it. `flowEffectiveBody` records the request the current standard session was created with; `handleSubmit` reads session-time fields (`3ds`, `payment_type`, `capture`) from it, while `amount`/`items` stay live as before. Invalid options (e.g. "Only these" with nothing selected, bad JSON, expiry out of range) block creation with a toast.
- **Sections**: *Payment methods* (default / `enabled_payment_methods` / extra `disabled_payment_methods`, chips from `LINK_PAYMENT_METHODS` + `remember_me`, hidden-when-unavailable for the selected country/currency) · *Cards & wallets* (`payment_method_configuration.card.store_payment_details`, `applepay.store_payment_details` + `total_type`, `googlepay.store_payment_details` + `total_price_status`) · *Stored cards* (default customer / off / another `customer_id` / `instrument_ids` + `default_instrument_id`) · *3DS, capture & risk* (`3ds.challenge_indicator|exemption|attempt_n3d|allow_upgrade`, `authorization_type`, `capture_on`, `risk.enabled`, `customer_retry.max_attempts`) · *More* (`expires_on` as "expires in", `display_name`, `description`, `billing_descriptor`, `processing.pan_preference`, recurring `payment_plan`, shipping, metadata, Extra JSON deep-merged last).
- The main 3DS / Capture / Remember Me / Payment Type controls still drive `3ds.enabled`, `capture`, the `remember_me` entry in `disabled_payment_methods` and `payment_type`; the advanced options add to them. Account-holder objects (`payment_method_configuration.*.account_holder`) are available through Extra JSON.
- No backend change — `/payment-sessions` already forwards the body. Sandbox accepted every field above (201).
