# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

A Checkout.com payment integration testing suite app showcasing Flow (prebuilt UI) card payments, Google Pay, Apple Pay, and all payment methods like PayPal, Klarna tested via payment setup API and management operations (capture, void, refund) with a webhook endpoint polling for 2 mins until received. Deployed on AWS Amplify and API Gateway with a parallel Lambda/Amplify manual deployment path.

## Commands

```bash
npm start         # Local env runs on http://localhost:4244
```

App runs at `http://localhost:4244`.

No lint or test commands are configured.

## Architecture

### Deployment Modes

Frontend folder is deployed on AWS amplify and backend is deployed manually by making changes via AWS console to my lambda function directly and adding gateway API endpoints on AWS API Gateway:

| Mode | Entry Point | API Routes | Use |
|------|------------|------------|-----|
| AWS Lambda (Amplify) | `frontend/tabs/loader.js` | `amplify/backend/function/src/index.js` → `amplify/backend/function/function/src/api-route-controller.js` | Serverless deployment |

### Frontend → Backend Data Flow

```
frontend/tabs/*.html          # Tab HTML partials (flow, main, payment-setup, wallets)
frontend/modules/flow.js      # Checkout.com Flow (@checkout.com/checkout-web-components)
frontend/modules/payment-setup.js  # Direct API flows (cards (flow UI tokenization-mode only and payment via /payments endpoint), PayPal, Klarna, Bizum, Ideal via payment-setup API)
frontend/apple-pay.js / google-pay.js  # Wallet implementations
        ↓  fetch() calls
amplify/backend/function/flowDemoLambdaSyed/src/api-route-controller.js  # Express routes
        ↓  axios
Checkout.com API (sandbox: https://api.sandbox.checkout.com)
        ↓  webhooks → POST /webhook

```

### Key Files

- **`config.js`** — Checkout.com credentials (secret key, public key, processing channel ID, merchant IDs). Read by the backend routes.
- **`frontend/utils.js`** — Theme token definitions and `buildAppearance()` and all reusable functions defined in codebase used by all Checkout.com integration components.
- **`frontend/script.js`** — App init: loads tab HTML, populates dropdowns, handles tab switching.
- **`frontend/modules/data.js`** — Currency and country lists used by payment forms.
- **`frontend/modules/flow.js`** — All logic related to checkout.com flow UI integration.
- **`frontend/modules/payment-setup.js`** — All logic related to checkout.com payment setup API integration.
- **`frontend/modules/wallets.js`** — Centralized apple and google pay logic related to checkout.com integration.
- **`frontend/google-pay.js`** — All logic related to google's sdk functions integration for google pay.
- **`frontend/apple-pay.js`** — All logic related to apple's sdk functions integration for apple pay.
- **`amplify/backend/function/flowDemoLambdaSyed/src/api-route-controller.js`** — All backend routes defined here that makes request to checkout.com integration.
- **`amplify/backend/function/flowDemoLambdaSyed/src/index.js`** — AWS lambda serverless init which is tied to AWS gateway API endpoints



### Environment Variables (`.env`)

```
SECRET_KEY                  # Checkout.com secret key (sk_sbox_...)
PROCESSING_CHANNEL_ID       # Checkout.com processing channel
GW_URL                      # Checkout.com API base URL
API_BASE_URL                # AWS API Gateway URL (for Lambda deployment)
WEBHOOK_SECRET              # Webhook signature validation
AWS_URL_WEBHOOK_SECRET      # Webhook secret for the Lambda endpoint
ENV                         # DEV or PROD
STRIPE_SECRET_KEY           # Competitor Testing → Stripe tab (rk_/sk_ sandbox key)
STRIPE_PUBLISHABLE_KEY      # Competitor Testing → Stripe tab (pk_ sandbox key)
STRIPE_WEBHOOK_SECRET       # Signing secret from the Stripe Dashboard webhook endpoint (whsec_...)
CKO_ACCESS_KEY_ID           # Standalone Suite → OAuth client id (ack_...) — Sessions API needs an access token
CKO_ACCESS_KEY_SECRET       # Standalone Suite → OAuth client secret
CKO_ACCESS_URL              # Full token endpoint, e.g. https://{prefix}.access.sandbox.checkout.com/connect/token
```

### API Endpoints

All routes defined in `amplify/backend/function/src/flowDemoSyedLambda/api-route-controller.js`:

- `POST /payment-sessions` — Create Flow payment session
- `POST /google-pay` — Process Google Pay token
- `POST /validate-apple-session` — Apple Pay merchant validation
- `POST /capture-payment`, `POST /void-payment`, `POST /refund-payment` — Payment management
- `GET /get-payment-details`, `GET /get-payment-actions` — Payment lookup
- `POST /payment-setups` — Create payment setup
- `PUT /update-payment-setups` — PATCH method config and fields onto a setup
- `POST /confirm-payment-setups` — Confirm and activate a setup
- `GET /get-payment-setup` — Retrieve setup details by ID
- `POST /submit-payment-session` — Submit a Flow tokenization session for payment
- `POST /payments` — Direct card payment via token
- `POST /apple-pay` — Apple Pay token → payment (SDK chain)
- `POST /webhook` — Receives Checkout.com webhook events, stores in-memory by payment ID
- `GET /webhook-event` — Poll for webhook event by paymentId (2-minute window)
- `GET /config` — Returns public key + processing channel ID to frontend
- `GET /.well-known/apple-developer-merchantid-domain-association.txt` — Apple Pay domain association
- `POST /payouts` — Create payout (proxies to CKO `/payments`, injects `source.type: currency_account`)
- `POST /card-metadata` — Proxy to CKO `POST /metadata/card`; used for payout eligibility pre-check (Beta API)

### Competitor Testing — Stripe Endpoints

Defined in `amplify/backend/function/flowDemoLambdaSyed/src/competitors/stripe-routes.js`, mounted at `/competitors/stripe/*` via `router.use()` in `api-route-controller.js`. Each future partner gets its own sibling route file under `competitors/`, mounted the same way — never inline.

- `GET /competitors/stripe/config` — Returns Stripe publishable key to frontend
- `POST /competitors/stripe/direct/payment-intent` — Direct API: create+confirm PaymentIntent with an attached PaymentMethod
- `GET /competitors/stripe/payment-intent/:id` — Fetch PaymentIntent status
- `POST /competitors/stripe/capture-payment-intent`, `POST /competitors/stripe/cancel-payment-intent`, `POST /competitors/stripe/refund` — Payment management (shared by every Stripe acceptance mode)
- `POST /competitors/stripe/checkout/session` — Create Checkout Session (hosted redirect or `ui_mode: 'embedded_page'`)
- `GET /competitors/stripe/checkout/session/:id` — Fetch Checkout Session (expands `payment_intent`)
- `POST /competitors/stripe/webhook` — Stripe webhook receiver (signature-verified via `req.rawBody`)
- `GET /competitors/stripe/webhook-event` — Poll for webhook event by PaymentIntent/object id (2-minute window, same pattern as CKO's `/webhook-event`)

---

## Session Summary (2026-04-01)

### Skills Created in `.claude/commands/`

Four project-specific skill files were created in this session. Invoke them with the slash command prefix:

| Skill File | Slash Command | Purpose |
|---|---|---|
| `checkout-developer-mcp-skill.md` | `/checkout-developer-mcp-skill` | 8-step guide for integrating any Checkout.com payment method end-to-end (cards, wallets, APMs, webhooks, security) |
| `add-payment-method.md` | `/add-payment-method` | Guided intake + code generation for adding a new APM to the Payment Setup tab (METHOD_REQUIREMENTS, METHOD_DISPLAY, METHOD_NOTES, SDK branches) |
| `add-backend-route.md` | `/add-backend-route` | Guided intake + code generation for a new Express route in `api-route-controller.js` with 7 boilerplate patterns |
| `add-new-feature.md` | `/add-new-feature` | Full end-to-end feature scaffold: MCP API research → tab HTML + JS module + backend route(s). Usage: `/add-new-feature "FeatureName - <UI/UX instructions>"` |
| `add-partner.md` | `/add-partner` | Scaffolds a new Competitor Testing partner (Adyen, Payrails, Primer, ...) end-to-end — MCP/docs research per mode, credential intake, backend routes + Lambda Layer guidance, frontend panels, shared success/failure page routing. Mirrors the Stripe integration's exact patterns (lazy SDK client, webhook poll-then-delete, `addToApiLog` everywhere). Strict about re-verifying current API method names before writing code — Stripe's build hit 5 breaking renames from stale cached knowledge. |

### Key Patterns to Know

**Payment Setup API flow (used by all APMs in the Payment Setup tab):**
1. `POST /payment-setups` → get `setup_id` + available methods list
2. `PUT /update-payment-setups?setupId=xxx` → PATCH method config fields onto the setup
3. `POST /confirm-payment-setups?setupId=xxx` → confirm; response contains redirect URL or SDK client token

**Adding a new APM always touches these locations in `frontend/modules/payment-setup.js`:**
- `METHOD_REQUIREMENTS` — fields to render under the method toggle (path mirrors exact CKO PATCH body field path)
- `METHOD_DISPLAY` — brand colour, abbreviation, logo URL for the method card UI
- `METHOD_NOTES` (optional) — warning string (e.g. "Requires CHF currency")
- `METHODS_WITH_ORDER_ITEMS` (optional) — add to Set if method needs `items[]` in PATCH body
- `handleFinalState` (SDK APMs only) — add `else if` branch to init the provider SDK

**Route boilerplate pattern selection (`add-backend-route` skill):**
| Situation | Pattern |
|---|---|
| GET with query param ID | A |
| POST forwarding body (no Content-Type override) | B |
| POST/PUT forwarding body + `Content-Type: application/json` | C |
| POST with query param ID + empty body `{}` (capture/void) | D |
| POST with query param ID + body forwarded | E |
| PUT with query param ID + body forwarded | F |
| Wallet: tokenize then pay (cko SDK chain) | G |

### Recommended Skills Not Yet Built

These were identified as high-value but not yet created — create them if the user asks:
- `/deploy-lambda` — Step-by-step zip → upload → API Gateway endpoint creation flow
- `/debug-payment` — Common failure patterns (missing Content-Type, wrong field path in PATCH, HMAC webhook mismatch)
- `/add-theme` — Adding a new CSS theme to `frontend/utils.js` `getThemeTokens()` + `buildAppearance()`

### AWS Deployment Reminder

Every new Express route in `api-route-controller.js` **must also be manually added in AWS API Gateway** (Method + Lambda proxy integration → `flowDemoLambdaSyed`) before it works in production. This is not automated.

---

## Session Summary (2026-04-01) — Architecture Improvements

### What Was Done

All 11 architecture improvement steps from the plan were applied to `main` branch (merged from `code-architecture-change`). The branch had the updated wallets tab UI, which was preserved throughout.

### New Files Created

| File | Purpose |
|---|---|
| `frontend/modules/api-log.js` | `apiLogHistory`, `addToApiLog()`, modal handlers — moved from `utils.js` |
| `frontend/modules/payment-actions.js` | `fetchPaymentDetails`, `voidPayment`, `capturePayment`, `refundPayment`, `updatePaymentDetailsData`, `getPaymentSetup`, `confirmPaymentSetup` — moved from `utils.js` |
| `frontend/modules/payment-setup-config.js` | `METHOD_REQUIREMENTS`, `METHODS_WITH_ORDER_ITEMS`, `METHOD_NOTES`, `METHOD_DISPLAY` — moved from `payment-setup.js` |

### Bugs Fixed

- **`frontend/websocket.js`** — De Morgan's law bug: changed all `||` → `&&` in the declined/failed event check (line 18). Was causing all failed payment events to show a success toast.
- **`frontend/modules/data.js`** — Five wrong ISO country codes fixed: Czech Republic `CK`→`CZ`, Estonia `ES`→`EE`, New Zealand `AZ`→`NZ` (also fixed name `'Newzealand'`→`'New Zealand'`), Hong Kong display name fixed, UAE `AU`→`AE`.
- **`frontend/apple-pay.js`** — Removed duplicate `CURRENCIES_APPLE` array; replaced with global `CURRENCIES`. Fixed `amountInput.value` → `amountInputApple.value` (was referencing a google-pay.js global that disappears after IIFE wrap). Added comment explaining shared `-google` element IDs are intentional.
- **`backend/api-route-controller.js`** — Fixed broken `res.sendStatus(500)(error)` → `res.status(500).send(...)`. Fixed `/validate-apple-session` silently swallowing errors.

### Structural Changes

- **`frontend/google-pay.js`** — Wrapped in IIFE; `window.onGooglePayLoaded` still on `window`.
- **`frontend/apple-pay.js`** — Wrapped in IIFE; `window.addApplePayButton` still on `window`.
- **`frontend/utils.js`** — `api-log` and `payment-actions` sections removed (moved to modules). Retains: theme helpers, `getFlowAppearance`, `mountCardTokenizer`, `formatJSON`, `showToast`, `showKlarnaToast`, Klarna item helpers, theme MutationObserver.
- **`frontend/modules/payment-setup.js`** — Data declarations removed (moved to `payment-setup-config.js`).
- **`frontend/index.html`** — Script load order: `utils.js` → `api-log.js` → `payment-actions.js` → `data.js` → `wallets.js` → `flow.js` → `payment-setup-config.js` → `payment-setup.js`.
- **`frontend/success.html`** and **`frontend/failure.html`** — Added `modules/api-log.js` and `modules/payment-actions.js` script tags (were missing, causing `ReferenceError`).
- **`backend/api-route-controller.js`** — Added structured `log()` helper (emits JSON). Added input validation `400` guards on `/payment-sessions`, `/capture-payment`, `/void-payment`, `/refund-payment`, `/google-pay`.

### Module Split Rule

`payment-actions.js` is NOT wrapped in an IIFE because `updatePaymentDetailsData` is called by `websocket.js` as a plain global. All three new modules must load before feature modules (flow, payment-setup, wallets).

### Current State

All changes committed to `main`. Git was clean after merge. Next step when resuming: `git push origin main` to trigger Amplify deployment (not done — user logged off before pushing).

---

## Session Summary (2026-04-02) — Payouts Tab

### What Was Built

Full **Payouts** tab added to the app — supports both Card Payouts and Bank Payouts via Checkout.com `/payments` API (payout mode).

### New Files Created

| File | Purpose |
|---|---|
| `frontend/tabs/payouts.html` | Full payouts tab UI — payout type selector, card payout form, bank payout form, result + webhook status display |
| `frontend/modules/payouts.js` | Payouts IIFE module — scheme selection, Flow card field mount, tokenize → /payouts submit, bank payout submit, webhook polling |

### Files Modified

| File | Change |
|---|---|
| `frontend/modules/data.js` | Added `PAYOUT_FUNDS_TRANSFER_TYPES` constant (Visa: AA/PP/FT/WT/TU/FD/PD, Mastercard: C55/C07/C52/C65) |
| `frontend/tabs/main.html` | Added Payouts tab button + `<div id="payouts-tab">` |
| `frontend/tabs/loader.js` | Added `payouts-tab` HTML injection |
| `frontend/script.js` | Added currency + country dropdown population for all payouts selects |
| `frontend/index.html` | Added `<script src="modules/payouts.js">` |
| `amplify/backend/function/flowDemoLambdaSyed/src/api-route-controller.js` | Added `POST /payouts` route (proxies to CKO `/payments`, injects `source.type: currency_account`) |
| `amplify/backend/function/flowDemoLambdaSyed/src/config.js` | Added `currencyAccountId: process.env.CURRENCY_ACCOUNT_ID` |
| `config.js` (root) | Added `currencyAccountId: process.env.CURRENCY_ACCOUNT_ID` |

### Key Design Decisions

- **Card Payouts**: Uses Flow tokenization-mode only. User picks Visa or Mastercard → card field mounts with `componentOptions.card.supportedSchemes: ['Visa']` or `['Mastercard']` to enforce scheme at input. Token passed to `/payouts` backend.
- **Payment session prerequisite**: `mountPayoutCardField()` creates a throwaway payment session (`POST /payment-sessions`) just to get a `paymentSession` object for mounting the Flow card component. Session body includes `billing.address.country` from the destination form field (required to avoid `billing_required` validation error) and `disabled_payment_methods: ['remember_me']`.
- **FTT dropdown**: Populated dynamically from `PAYOUT_FUNDS_TRANSFER_TYPES[scheme]` in `data.js` when scheme changes. User replaces placeholder values with actual scheme-assigned FTT codes.
- **Currency Account ID**: Read from `config.currencyAccountId` (env var `CURRENCY_ACCOUNT_ID`) — not a UI field.
- **Bank Payouts**: Renders IBAN, account_number, bank_code, swift_bic, account_holder fields. All labels use exact CKO API field paths (e.g. `destination.account_holder.billing_address.country`).
- **Sender section**: Collapsible optional section — toggle shows/hides sender fields.
- **Webhook polling**: After payout created, polls `GET /webhook-event?paymentId=` every 2s for 2 minutes. Handles: `payment_paid` (success), `payment_declined`/`payment_returned`/`payment_expired` (error).
- **Theme re-mount**: Listens to `themechange` DOM event and re-mounts Flow card field with updated appearance.

### Layout Patterns Established (reuse in future tabs)

- Long API path labels (e.g. `destination.account_holder.first_name`) overflow in auto-fit 4-column grids. **Fix**: use `grid-template-columns: repeat(2, 1fr)` for any section with long-path labels, and add `white-space:normal; overflow-wrap:anywhere; line-height:1.5` to labels.
- Always use `color: var(--text-secondary)` on labels — never `var(--text-muted)` or `opacity: 0.7` (too light on white background).
- Flow card form container needs `padding: 20px 20px 16px` for comfortable spacing.

### Bugs Fixed During Build

- `billing_required` error on payment session creation → fixed by injecting `billing.address.country` from the destination country field into the session body.
- Label overflow on all `account_holder` sections → fixed by switching to explicit 2-column grids.
- Labels invisible on light theme → fixed by replacing `var(--text-muted)` with `var(--text-secondary)` everywhere in payouts.html.

### Manual Steps Required Before Production Testing

- [x] Add `CURRENCY_ACCOUNT_ID=ca_...` to `.env` and to Lambda environment variables in AWS console *(done 2026-04-03)*
- [x] Add `POST /payouts` route in AWS API Gateway → Lambda proxy → `flowDemoLambdaSyed` *(done 2026-04-03)*
- [x] Deploy Lambda zip after route changes *(done 2026-04-03)*
- [x] Replace placeholder FTT codes in `data.js` `PAYOUT_FUNDS_TRANSFER_TYPES` with real scheme-assigned codes (already done by user for sandbox — Visa: AA/PP/FT/WT/TU/FD/PD, Mastercard: C55/C07/C52/C65) *(done 2026-04-03)*

---

## Session Summary (2026-04-03) — Payouts UX + Queue System

### What Was Built / Changed

- Fixed 502 on `POST /payouts` (missing `CURRENCY_ACCOUNT_ID` env var); hardened backend route with outer try/catch, `res.json()` throughout, and config-state logging via `console.log`.
- Replaced single-result payout panel with a **Payout History queue**: each submission gets a row with status badge, scheme, amount, webhook event, and expand/collapse JSON detail. Scheme dropdown + submit button lock while any payout is pending webhook.
- Added interactive **test cards panel** (Visa + Mastercard × 3 response codes × 4 countries) with one-click copy chips for card number, CVV, and expiry.

### Files Modified

| File | Change |
|---|---|
| `amplify/backend/function/flowDemoLambdaSyed/src/api-route-controller.js` | `/payouts` route fully rewrapped in try/catch; `res.send` → `res.json`; config state logged; `currencyAccountId` exposed via `GET /config` |
| `frontend/modules/payouts.js` | Queue system (`queuePayout`, `renderQueue`, `lockPayoutForm`, `unlockPayoutForm`, `startQueuePolling`); scheme mismatch validation after tokenize; FTT defaults (Visa→FD, MC→C55); full API log body (adds `source` + `processing_channel_id`); test card `renderTestCards()`; `clearPayoutResult` clears queue |
| `frontend/tabs/payouts.html` | Replaced result panel with `payout-queue-panel`; added `payout-lock-banner`; added `payout-test-cards` container + `.tc-chip` styles; `family_support` set as default `instruction.purpose` |
| `frontend/modules/data.js` | Added `PAYOUT_TEST_CARDS` constant (24 cards: Visa + MC × 3 response codes × 4 countries) |
| `.claude/commands/login.md` | Renamed from `start-of-day.md` (slash command: `/login`) |
| `.claude/commands/logout.md` | Renamed from `logging-off-the-day.md` (slash command: `/logout`) |

### Key Patterns Established

- **502 from API Gateway = Lambda returned no response** — caused by `unhandledRejection` swallowing errors before Express sends. Fix: wrap entire route in a single outer `try/catch` that guarantees `res.json()` is always called.
- **API Gateway 502 vs 500**: 502 = Lambda timed out or returned malformed response. 500 = Lambda ran but CKO rejected. Add `console.log('[route] config state:', ...)` at route entry to surface missing env vars without CloudWatch.
- **`currencyAccountId` is now exposed via `GET /config`** — `window.APP_CONFIG.currencyAccountId` is available on frontend. Use it for API log enrichment.
- **Payout queue pattern**: `_payoutQueue[]` array + `_pendingCardCount`/`_pendingBankCount` ints + single `setInterval` polling all pending entries. `queuePayout()` adds, `resolveQueueEntry()` updates. `updateLockState()` manages lock UI (card controls lock only for card payouts).
- **Test card chips**: store card data in `data.js` as `PAYOUT_TEST_CARDS`, render with `renderTestCards(scheme)` using `.tc-chip` CSS class + event delegation on container for copy-to-clipboard.

### Bugs Fixed

- 502 on `POST /payouts` → `unhandledRejection` in `app.js` swallowed errors before Express could respond → wrapped route in outer try/catch in `api-route-controller.js`.
- `source` and `processing_channel_id` appeared missing from CKO request → they were present but `CURRENCY_ACCOUNT_ID` env var was not set in Lambda → fixed by user + added explicit 400 guard.
- Visa card accepted when Mastercard scheme selected → Flow's `supportedSchemes` only restricts BIN at input but doesn't hard-block → added post-tokenize check on `tokenData.scheme` in `onCardPayoutSubmit`.

### Pending Manual Steps

- [x] Deploy updated Lambda zip — `api-route-controller.js` has new changes (config logging, `currencyAccountId` in `/config` response, `res.json` refactor) not yet uploaded to AWS Lambda. *(superseded — new changes added 2026-04-06, deploy together)*

### Resume Here Next Session

All frontend changes are committed and pushed (`bd855d2`) — Amplify build should be live. Open `amplify/backend/function/flowDemoLambdaSyed/src/api-route-controller.js` and zip + upload to Lambda (the `/config` endpoint now returns `currencyAccountId`, and the `/payouts` route has better error handling). After that, run end-to-end card payout test using the test cards panel (Visa 10000 happy flow first).

---

## Session Summary (2026-04-06) — Card Metadata Pre-check + Bank Payout UX

### What Was Built / Changed

- **Card metadata eligibility pre-check** on card payouts: after tokenize, calls `POST /card-metadata` (CKO Beta API), renders an inline panel showing scheme, card type, issuer, and per-transfer-type payout eligibility (colour-coded). Blocks payout submission if all `card_payouts` fields are `not_supported`. Logged to API sidebar.
- **Bank test accounts panel** added: success chips (GB happy-flow values), 3 declined scenarios (codes 50001/50021/50150 with IBANs + account number suffixes), and EU country IBAN+BIC examples (EE/FI/FR/DE/GR) — all copyable chips. Panel renders when user selects Bank payout type.
- **Bank payout form expanded**: full `billing_address` fields added (address_line1, address_line2, city, zip, state), German defaults pre-filled, German IBAN default (`DE89370400440532013000`). EU-only info banner added. `buildBankPayoutBody()` updated to include all new address fields.
- **Queue display fix**: payout queue rows with 4XX/failed status no longer show "polling…" — show "no webhook" in red instead.

### Files Modified

| File | Change |
|---|---|
| `amplify/backend/function/flowDemoLambdaSyed/src/api-route-controller.js` | Added `POST /card-metadata` route (Pattern C — POST + Bearer auth, proxies to CKO `/metadata/card`) |
| `frontend/modules/payouts.js` | Added `fetchCardMetadata()`, `isPayoutEligible()`, `renderMetadataPanel()`, `renderBankTestAccounts()`; wired metadata pre-check into `onCardPayoutSubmit`; updated `buildBankPayoutBody()` for full billing address; queue "polling…" fix |
| `frontend/tabs/payouts.html` | Added `payout-metadata-panel` div, EU info banner, German IBAN default, 5 new billing address input fields |
| `frontend/modules/data.js` | Added `BANK_PAYOUT_TEST_ACCOUNTS` constant (success, 3 declined scenarios, 5 EU country IBAN+BIC examples) |

### Key Patterns Established

- **Card metadata pre-check pattern**: tokenize → `POST /card-metadata` with `{ source: { type: "token", token }, format: "card_payouts" }` → `isPayoutEligible()` checks if all `card_payouts` values are `not_supported` → block or proceed. Log both request and response to API sidebar.
- **Eligibility colours**: `fast_funds` = `var(--success)` green, `standard` = `#f59e0b` amber, `not_supported` = `var(--error)` red, `unknown` = `var(--text-secondary)`.
- **EU bank payout constraint**: European entity — only EU bank accounts (IBAN) + EUR currency accepted. Non-EU destinations rejected at CKO level.
- **`payout-metadata-panel`** must be hidden in `onSchemeChange()` (empty scheme path), at top of `onSchemeChange()` (new scheme), and in `clearPayoutResult()` to prevent stale metadata showing.
- **Bank test accounts**: `BANK_PAYOUT_TEST_ACCOUNTS.euCountries` entries have `{ country, code, ibanExample, bicExample, ibanLength }` — use for rendering, not for guaranteed sandbox validity.

### Pending Manual Steps

- [x] Deploy updated Lambda zip — done 2026-04-10
- [x] Add `POST /card-metadata` route in AWS API Gateway → Lambda proxy → `flowDemoLambdaSyed` — done 2026-04-10

### Resume Here Next Session

Lambda zip has NOT been deployed yet — `api-route-controller.js` has `POST /card-metadata` plus prior-session hardening that is not yet live. Zip and upload to Lambda first, then add `POST /card-metadata` in API Gateway. After that, run end-to-end test: card payout with Visa 10000 happy-flow card → verify metadata panel appears with eligibility rows → verify payout proceeds to queue → verify webhook resolves. Then test an ineligible card scenario to confirm the block works.

---

## Session Summary (2026-04-10) — Payment Setup UI + SEPA Fields

### What Was Built / Changed

- Added iDEAL `description` field (string ≤ 35 chars, with live char counter) to `METHOD_REQUIREMENTS`
- Overhauled status banner CSS + rendering: `.status-ready/.status-action/.status-error` now have padding, border-radius, flex layout, and a circular icon badge (✓/!/✕). All 5 `statusArea` assignments replaced with new `setStatus(el, type, text)` helper.
- Fixed overlapping labels in requirements grid: labels now `text-overflow: ellipsis` + `title` tooltip for full path on hover.
- Added full `payment_methods.sepa.*` fields to SEPA in `METHOD_REQUIREMENTS`: account holder (type select → dynamic first/last name or company name), IBAN, country, currency, mandate (id, type select, date_of_signature date picker).
- Added `FORCED_CURRENCY` auto-set: patching with Twint auto-sets CHF, KakaoPay auto-sets KRW before building PATCH body.
- Updated renderer in `payment-setup.js` to support `type: 'select'`, `type: 'date'`, and `showIf` conditional field visibility (toggle + change listener wiring).

### Files Modified

| File | Change |
|---|---|
| `frontend/modules/payment-setup-config.js` | iDEAL `description` field added; SEPA expanded with 10 new `payment_methods.sepa.*` fields (select/date/showIf); METHOD_NOTES updated for twint/kakaopay (auto-currency) + sepa note added |
| `frontend/modules/payment-setup.js` | `setStatus()` helper added; renderer overhauled for select/date/showIf; `FORCED_CURRENCY` auto-set on patch; hidden conditional fields skipped in patch body builder |
| `frontend/style.css` | `.status-ready/.status-action/.status-error` given padding, border-radius, flex layout, circular icon badge via `::after` |

### Key Patterns Established

- **`showIf` conditional fields**: field definition takes `showIf: { id: 'controlling-field-id', value: 'trigger-value' }`. Renderer hides group on load if default doesn't match, then wires a `change` listener on the controlling `<select>`. Patch body builder skips any group with `style.display === 'none'`.
- **`type: 'select'` / `type: 'date'`** in `METHOD_REQUIREMENTS` field definitions: renderer branches on `field.type` — renders `<select class="select-input patch-field">` or `<input type="date">` accordingly. Patch body builder works unchanged since it reads `.value` from all `.patch-field` elements.
- **`FORCED_CURRENCY` pattern**: `{ kakaopay: 'KRW', twint: 'CHF' }` — add any future method here to auto-set the currency dropdown. Now fires on toggle change (immediate UI feedback) AND at patch time (safety net if user overrides manually).
- **Status banner pattern**: always use `setStatus(el, type, text)` (defined at top of `payment-setup.js`) — never set `className + innerText + style.display` inline.

### Resume Here Next Session

Backend is fully deployed and up to date as of 2026-04-10. Frontend pushed to main — Amplify build should be live. Good starting point: end-to-end test SEPA via Payment Setup tab (use `DE89370400440532013000` IBAN, EUR currency, individual account holder) and verify the dynamic first/last name fields toggle correctly. Then test iDEAL with the description field.

---

## Session Summary (2026-04-10) — API Log Persistence + Bug Fixes

### What Was Built / Changed

- **API log now persists across page navigations** — full payment-setup flow (create → patch → confirm) logs survive the redirect to success/failure pages and are restored on load. User-triggered CLEAR still wipes everything.
- **Currency auto-resets to EUR on method toggle change** — switching away from Twint/KakaoPay now immediately resets the currency dropdown to EUR instead of leaving CHF/KRW for the next method.
- **Fixed `confirmPaymentSetup` always logging 422** — missing `await` on `res.json()` made `response` a Promise, so `response.id` was always `undefined` → always hit the 422 branch. Redirect APMs (iDEAL, Bizum) now log green (200).

### Files Modified

| File | Change |
|---|---|
| `frontend/modules/api-log.js` | Rewrote to persist entries to `sessionStorage`; `DOMContentLoaded` restores prior entries; `clearApiLogs` also removes storage key |
| `frontend/modules/payment-setup.js` | Added currency auto-reset at top of `handleToggleChange` — sets FORCED_CURRENCY value or EUR on every method switch |
| `frontend/modules/payment-actions.js` | `confirmPaymentSetup`: added missing `await` on `res.json()`; changed status check to `res.ok ? (response.id ? 201 : 200) : res.status` |

### Key Patterns Established

- **API log sessionStorage key**: `cko-api-log` — stores array of `{ id, method, endpoint, status, request, response }` in insertion order. Restore iterates forward with `prepend` so newest ends up on top.
- **`confirmPaymentSetup` status logic**: use `res.ok` (HTTP 2xx from backend) as the green/red gate — not `response.id`, which is absent on redirect APM confirms.
- **`handleToggleChange` is the right place for currency side-effects** — fires on every method switch before the user can click patch. Patch-time FORCED_CURRENCY remains as a safety net.

### Bugs Fixed

- `confirmPaymentSetup` logging 422 for all APM redirects → `res.json()` missing `await` → `response` was a Promise → `response.id` always `undefined` → always 422 → fixed in `payment-actions.js:confirmPaymentSetup`
- API log empty on success/failure page → in-memory only, cleared on navigation → fixed by sessionStorage persistence in `api-log.js`
- Currency stuck at CHF/KRW after switching methods → FORCED_CURRENCY only applied at patch time → fixed by adding reset to `handleToggleChange` in `payment-setup.js`

### Resume Here Next Session

Frontend pushed to main (`ea62977`) — Amplify build should be live. End-to-end test: run an iDEAL payment via Payment Setup tab and verify (1) confirm step logs green in API sidebar, (2) after redirect back to success page the full log (create/patch/confirm) is visible, (3) switching from Twint to any other method resets currency to EUR immediately.

---

## Session Summary (2026-04-13) — Payment Setup Confirm Flow Config-Driven

### What Was Built / Changed

- Replaced all hardcoded method-name checks in `payment-setup.js` with a `confirmFlow` config property lookup — adding a new redirect APM now requires zero changes to the logic file.
- Added `confirmFlow` to every `METHOD_DISPLAY` entry in `payment-setup-config.js`; added missing `p24` and `alma` entries to `METHOD_DISPLAY`.
- Moved `FORCED_CURRENCY` constant to top-level in `payment-setup-config.js` (was duplicated inline twice in `payment-setup.js`).

### Files Modified

| File | Change |
|---|---|
| `frontend/modules/payment-setup-config.js` | Added `confirmFlow` to all `METHOD_DISPLAY` entries; added `p24` + `alma` entries; moved `FORCED_CURRENCY` to module top-level |
| `frontend/modules/payment-setup.js` | Replaced 4 hardcoded method-name checks with `METHOD_DISPLAY[methodName]?.confirmFlow` lookups; removed 2 inline `FORCED_CURRENCY` definitions |

### Key Patterns Established

- **`confirmFlow` property** in `METHOD_DISPLAY`: `'redirect'` | `'klarna'` | `'paypal'` | `'card'`. All dispatch logic reads this. To add any new redirect APM: add entry to `METHOD_REQUIREMENTS` + `METHOD_DISPLAY` with `confirmFlow: 'redirect'`. Zero changes to `payment-setup.js`.
- **`p24` and `alma` were missing from `METHOD_DISPLAY`** — any new method in `METHOD_REQUIREMENTS` must also have a `METHOD_DISPLAY` entry or `confirmFlow` lookup returns `undefined` (falls back to `'redirect'` via `?? 'redirect'`).

### Resume Here Next Session

Changes pushed to main — Amplify build live. No pending manual steps.

---

## Session Summary (2026-04-13) — Bank Payout Test UX + Payout Lock Separation

### What Was Built / Changed

- **Bank test accounts panel fully redesigned** — hover-highlighted clickable rows replace static copy chips. Click any scenario to auto-fill the destination form fields instantly.
- **Declined IBAN rows now fill destination fields** — clicking a declined IBAN fills `destination.iban`, `destination.country`, and `billing_address.country` (country extracted from IBAN prefix).
- **Card/bank payout lock state separated** — card form (scheme dropdown + submit) only locks when a card payout is pending webhook; bank payouts show an informational banner only.
- Replaced GB happy flow test account with DE (IBAN-based); default country selects changed to DE.

### Files Modified

| File | Change |
|---|---|
| `frontend/modules/data.js` | `BANK_PAYOUT_TEST_ACCOUNTS.success` replaced: GB domestic fields → DE IBAN (`DE89370400440532013000`) + BIC (`COBADEFFXXX`) |
| `frontend/modules/payouts.js` | Added `fillBankForm()` helper; full rewrite of `renderBankTestAccounts()` (hover CSS, click-to-fill for all 3 sections); country defaults changed GB → DE; `_pendingCount` split into `_pendingCardCount` + `_pendingBankCount`; `lockPayoutForm`/`unlockPayoutForm` replaced with `updateLockState()` |

### Key Patterns Established

- **`fillBankForm(fields)`** maps `{ label, value }` pairs to form input IDs via `FIELD_ID_MAP`. Labels follow the `destination.*` / `account_holder.*` / `billing_address.*` path convention already used in `BANK_PAYOUT_TEST_ACCOUNTS`.
- **Bank test panel interaction**: happy flow = `.btr-row[data-fill-success]` fills all 6 fields; declined rows = `.btr-row[data-fill-iban][data-fill-country]` fills IBAN + both country selects; EU rows = `.btr-row[data-fill-eu]` fills IBAN + BIC + both country selects. Hover state + `↗ load` hint injected via `<style>.btr-row:hover .btr-hint { opacity:1 }`.
- **Separate payout lock counters**: `_pendingCardCount` / `_pendingBankCount` — `updateLockState()` reads both; only locks card controls when `_pendingCardCount > 0`. Banner message reflects which type(s) are pending.
- **IBAN country extraction**: `iban.substring(0, 2)` gives the ISO country code from any standard IBAN. Used in declined row rendering to set `data-fill-country`.

### Known Issue — Not Fixed

- **Webhook `pid` param not read on success/failure pages**: `success.html:152` and `failure.html:128` fall back to `cko-session-id` instead of reading `pid` first. The redirect URL appends `?pid=payment_xxx&cko-session-id=sid_xxx` — the actual payment ID is in `pid`. Fix: add `urlParams.get('pid') ||` as the first check in both files. Webhook polling currently polls with the wrong ID for any payment method that uses the `pid` param.

### Resume Here Next Session

No pending manual steps — all frontend changes are uncommitted. Push to main to trigger Amplify deploy. Then fix the webhook `pid` bug: in `frontend/success.html` line 152 and `frontend/failure.html` line 128, add `urlParams.get('pid') ||` as the first item in the payment ID param lookup chain.

---

## Session Summary (2026-08-21) — Competitor Testing Section + Stripe (Direct API + Checkout)

### What Was Built / Changed

- New **Competitor Testing** top-level tab for testing non-CKO PSPs — partner selector (Stripe active; Adyen disabled placeholder; Payrails/Primer intentionally not shown per request) → per-partner "Payment Acceptance" mode selector.
- **Stripe Direct API** mode: PaymentMethod (Stripe.js multi-line split card fields: separate number/expiry/cvc) + PaymentIntent, schema-driven form (billing, shipping, capture mode, save-card, "Force 3DS" toggle).
- **Stripe Checkout** mode: hosted redirect + embedded (`ui_mode: 'embedded_page'`), same "Force 3DS" toggle.
- Both modes route through the app's **existing** `success.html`/`failure.html` pages (not back into the SPA) — same `#payment-details-response`/`#action-buttons`/`#webhook-status` elements every CKO payment method already uses.
- `amplify/` backend folder is now tracked in git (previously fully gitignored) — deliberate decision; secrets found inside were excluded (see Bugs/Security below).

### New Files Created

| File | Purpose |
|---|---|
| `amplify/backend/function/flowDemoLambdaSyed/src/competitors/stripe-routes.js` | All Stripe backend routes: Direct API, Checkout Sessions, capture/cancel/refund, webhook + webhook-event, config |
| `frontend/tabs/competitors/index.html` | Competitor Testing partner-selector shell |
| `frontend/tabs/competitors/stripe.html` | Stripe tab UI: mode selector, Direct API form, Checkout form, Refund/Actions panel, webhook log |
| `frontend/modules/competitors/stripe.js` | Stripe tab logic (card mount, PaymentIntent flow, Checkout session flow, refund/actions) |
| `frontend/modules/competitors/stripe-shared.js` | Shared helpers `success.html`/`failure.html` use to render Stripe PaymentIntent/session status, next-action buttons, webhook polling |

### Files Modified

| File | Change |
|---|---|
| `config.js` (root) + `amplify/.../src/config.js` | Added `stripeSecretKey`/`stripePublishableKey`/`stripeWebhookSecret` |
| `amplify/.../src/api-route-controller.js` | Mounted `router.use('/competitors/stripe', require('./competitors/stripe-routes'))` |
| `amplify/.../src/app.js` | `bodyParser.json({ verify })` added to capture `req.rawBody` for Stripe webhook signature verification |
| `amplify/.../src/package.json` | Added `stripe` npm dependency (delivered to Lambda via a Layer, not the zip — see pattern below) |
| `frontend/index.html` | Added Stripe.js SDK `<script>`, `modules/competitors/stripe.js`/`stripe-shared.js` |
| `frontend/tabs/main.html`, `frontend/tabs/loader.js` | Added Competitor Testing tab button/div + partner panel injection |
| `frontend/script.js` | Currency/country dropdown population for Stripe forms; stop Stripe webhook polling on tab switch |
| `frontend/style.css` | `.wallet-option.disabled`, `.stripe-split-field` |
| `frontend/success.html`, `frontend/failure.html` | Branch to `stripe-shared.js` rendering when Stripe return params are detected; added `#action-buttons` to `failure.html` (didn't exist before) |
| `.gitignore` | Removed `/amplify` exclusion (deliberate); added explicit excludes for `certificates/` and `team-provider-info.json` and `.DS_Store` |
| `.env` | Added `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` |

### Key Patterns Established

- **Competitor Testing shape**: tab → `#competitor-partner-selector` → `#partner-panel-<name>` → per-partner `#<partner>-mode-selector` → `#<partner>-mode-panel-<mode>`. New partners/modes follow this exact structure. An `/add-partner` scaffold command was discussed but not yet built — build it once this Stripe pattern is fully proven out.
- **Backend**: each partner gets its own file under `.../src/competitors/<partner>-routes.js`, mounted via `router.use('/competitors/<partner>', require(...))` — never inline in `api-route-controller.js`.
- **Lazy SDK client construction is mandatory**: `function stripe() {...}` with a cached singleton, never a top-level `new Stripe(...)`. A bad/missing `STRIPE_SECRET_KEY` throws synchronously at `require()` time otherwise, which crashes the ENTIRE Lambda (every route, not just Stripe's) since `api-route-controller.js` requires this file unconditionally at cold start.
- **Never pass `payment_method_types`** (per Stripe best practice) — for card-only own-UI flows use `automatic_payment_methods: { enabled: true, allow_redirects: 'never' }` instead, or Stripe demands a `return_url`.
- **`ui_mode: 'embedded'` was renamed to `'embedded_page'`** on recent Stripe API versions.
- Embedded Checkout doesn't auto-navigate on completion — wire `onComplete` to manually redirect to `success.html`.
- **Lambda npm dependencies must be delivered via a Lambda Layer** (console can't run `npm install`) — build the layer zip via a clean `npm install <pkg>` in an empty temp dir (`nodejs/node_modules/...` structure), never by copying just the package folder out of an existing project's `node_modules` (misses transitive dependencies).
- This project uses **explicit per-route API Gateway resources**, not a `{proxy+}` catch-all (proposed, declined) — every new backend route needs its own manually-created nested resource + method + Lambda proxy integration + redeploy.

### Bugs Fixed

- 502 on **every** route (even unrelated `/forward-config`) after first Stripe deploy → whole Lambda crashed at cold start on `require('qs')` → Layer zip only contained the bare `stripe` folder, missing its transitive dep `qs` → fixed by rebuilding the layer via clean `npm install stripe` in an empty dir (also fixed by moving Stripe client construction to be lazy, so a bad key alone can never repeat this failure mode).
- Stripe error *"must provide a return_url"* on Direct API → fixed by adding `automatic_payment_methods: { enabled: true, allow_redirects: 'never' }`.
- Stripe error *"ui_mode value `embedded` is no longer supported"* → fixed by using `'embedded_page'`.
- **Security**: found `amplify/team-provider-info.json` contained the live CKO sandbox secret key in plaintext, and `amplify/.../src/certificates/certificate_sandbox-syed.key` was a real Apple Pay private key — both excluded from git going forward (were never previously committed since `/amplify` was gitignored until this session).

### Pending Manual Steps

- [ ] Paste latest `stripe-routes.js` (force_3ds handling on both `/direct/payment-intent` and `/checkout/session`, new success/failure URLs) into the Lambda console and redeploy
- [ ] Add 2 new API Gateway routes: `POST /competitors/stripe/checkout/session`, `GET /competitors/stripe/checkout/session/{id}` — deploy to `staging`
- [ ] Full end-to-end test: Direct API with "Force 3DS" checked, Checkout hosted mode, Checkout embedded mode — confirm all three land correctly on `success.html`/`failure.html` with details/actions/webhook status

### Resume Here Next Session

Open `amplify/backend/function/flowDemoLambdaSyed/src/competitors/stripe-routes.js` (now tracked in git — diff it against what's actually live on Lambda before assuming they match) and finish the pending manual steps above. Next planned features per the original scope: **Payment Element (Custom UI)** and **Payment Links** modes — both currently disabled placeholders in `#stripe-mode-selector` in `frontend/tabs/competitors/stripe.html`. Remember: `amplify/` is now git-tracked, so every future backend edit needs both a commit AND a manual Lambda console paste — they do not sync automatically.

---

## Session Summary (2026-09-29) — Wallets: Flow Tokenize Mode, Direct SDK Data Exploration, Apple Pay Cross-Browser

### What Was Built

Three separate branches, each merged to `main` after e2e testing:

1. **`frontend/modules/wallets-flow.js`** (new) — Apple Pay / Google Pay via Flow's `mode: 'tokenize'` on the Wallets tab, fully independent of the direct SDK integration. Creates a Flow payment session, mounts `checkout.create('applepay'|'googlepay', { mode: 'tokenize', onAuthorized, onTokenized })`, renders the wallet-provided contact/billing/shipping data and the resulting CKO token inline, then forwards the token to the **existing** `/payments` route (`source.type: "token"`) rather than a new route. Polls `/webhook-event` same as the rest of the app.
2. **Direct Apple/Google Pay SDK data-collection config** — added UI toggles on the Wallets tab for Apple's `requiredBillingContactFields`/`requiredShippingContactFields` (chip groups: postalAddress/name/phone/email) and Google's `billingAddressRequired`/`Parameters`, `shippingAddressRequired`/`Parameters`, `emailRequired` — wired into `apple-pay.js`/`google-pay.js`'s existing request builders, all enabled by default. The existing wallet SDK debug panel (`#apple-pay-debugger` on the tab, mirrored to `#wallet-debug-container` on `success.html` via `wallet_debug_log` sessionStorage) now logs the requested config alongside what each wallet actually returned.
3. **Apple Pay cross-browser (QR code) support** — added Apple's official Apple Pay JS SDK script tag (`https://applepay.cdn-apple.com/jsapi/1.latest/apple-pay-sdk.js`) to `frontend/index.html`, loaded synchronously before `google-pay.js`/`apple-pay.js`. This is Apple's own drop-in polyfill: it defines `window.ApplePaySession` in non-Safari desktop browsers (Chrome, Firefox, Edge on macOS/Windows) with the *same* API surface, and shows Apple's own hosted QR code overlay on `session.begin()` — scanned with an iPhone (iOS 18+) camera to complete the transaction on-device. **No other code changes were needed** — `apple-pay.js`'s existing `ApplePaySession.canMakePayments()` check, `new ApplePaySession(3, request)`, `onvalidatemerchant`, `onpaymentauthorized`, and the `/validate-apple-session` backend merchant-validation route are all unchanged and reused as-is (same merchant ID, same domain association file, same session version). This project has no CSP configured, so no CSP allowlist changes were needed either — if one is added later, `applepay.cdn-apple.com` must be allowed in `script-src`/`frame-src`/`img-src`/`connect-src`.

### Key Patterns Established

- **Prefer forwarding to an existing route over adding a new one.** The Flow tokenize wallet flow reuses `/payments` (already used by Payment Setup's direct-card flow) rather than adding a dedicated route — `/payments` was extended to optionally forward `customer` (additive, doesn't affect existing callers).
- **The wallet SDK debug panel is the single place to inspect direct-SDK callback data.** Any future addition to what Apple/Google return (or what config triggers it) should extend the `sdkLogData` object built in `apple-pay.js`'s `onpaymentauthorized` / `google-pay.js`'s `loadPaymentData().then()`, not build a new panel — it already persists across the redirect to `success.html` via `wallet_debug_log` in sessionStorage.
- **Apple Pay cross-browser support is additive-only by design** — Apple's SDK is meant to be a transparent superset of the native Safari `ApplePaySession`, so it never requires changing existing session-handling code, only adding the script tag.

### Pending Manual Steps

- [ ] End-to-end test on an actual Chrome/Firefox/Edge desktop browser (not Safari) with an iPhone on iOS 18+ to confirm the QR code renders and the scan-to-pay handoff completes successfully.

### Resume Here Next Session

All three branches above were merged to `main`. No backend/Lambda changes in this session's work except the `/payments` `customer` field addition (already deployed in a prior session's Lambda zip upload — verify it's still live before relying on wallet-tokenize's customer upsert behavior). Next: run the QR code cross-browser test above, and decide whether to add the same Apple Pay JS SDK script tag to `success.html`/`failure.html` if any future feature needs `ApplePaySession` there too (not currently used on those pages).

---

## Session Summary (2026-09-30) — Disputes Testing Tab

### What Was Built

New **Disputes** tab — the whole point is that Checkout.com's sandbox doesn't let you create a dispute directly; paying with a specific amount + card expiry combination makes it generate a test dispute within a few minutes (`/developer-resources/testing/disputes-testing`). Full lifecycle: trigger payment → poll for the generated dispute → view details → Accept, or provide text-only evidence → submit (irreversible).

### New Files

| File | Purpose |
|---|---|
| `amplify/backend/function/flowDemoLambdaSyed/src/disputes/disputes-routes.js` | All dispute backend routes — mirrors the `competitors/stripe-routes.js` per-feature-file pattern, mounted via `router.use('/disputes', ...)` |
| `frontend/tabs/disputes.html` | Scenario picker (4 core + 6 expandable extended scenarios), raw-card trigger-payment form, dispute detail panel, text-evidence form, recent-disputes browser |
| `frontend/modules/disputes.js` | All wiring — scenario-row click-to-fill, payment trigger, dispute polling, accept/evidence/submit actions |

### Files Modified

| File | Change |
|---|---|
| `frontend/modules/data.js` | Added `DISPUTE_TEST_CARDS` (Visa/Mastercard/Amex base test cards), `DISPUTE_EXPIRY` (01/2099, required for scenario matching), `DISPUTE_TEST_SCENARIOS.core`/`.extended` (full CKO-documented amount→status matrix, GBP only) |
| `amplify/backend/function/flowDemoLambdaSyed/src/api-route-controller.js` | Mounted `router.use('/disputes', require('./disputes/disputes-routes'))` |
| `frontend/tabs/main.html`, `frontend/tabs/loader.js`, `frontend/index.html` | Added Disputes tab button/div, HTML injection, and `modules/disputes.js` script tag — same 3-file pattern as every other tab |

### Key Design Decisions (from user Q&A this session)

- **Raw card form, not Flow tokenization** — the dispute-triggering amount+expiry combo has to be exact (e.g. Visa `4242424242424242`, exp `01/2099`, amount `1040` → `evidence_required`), and Flow doesn't let you force an arbitrary expiry. New `POST /disputes/create-test-payment` route accepts `source.type: card` directly — acceptable here since these are fixed public sandbox test cards, not real PCI data.
- **Text-only evidence for now** — `PUT /disputes/{id}/evidence`'s `*_text` fields are documented as valid standalone (a description or an external link), so file upload (`POST /files`, binary proxy) was deliberately deferred rather than half-built.
- **Core 4 scenarios shown by default** (`evidence_required`, `won`, `lost`, `canceled`), extended 6 (`resolved_refund_processed`, `resolved_outside_process`, `evidence_under_review`, `arbitration_under_review/won/lost`) behind a "Show more" toggle.
- **GBP only** — matches CKO's documented scenario table exactly; other currencies (e.g. BHD) need different amount formatting and weren't worth the reliability risk.

### Key Patterns Established

- **Dispute polling**: `GET /disputes?payment_id={id}&limit=1` every 10s for up to 6 minutes after the trigger payment succeeds (docs say ~5 min) — same "poll after an action, cap the wait" shape as webhook polling elsewhere in this app, just a different endpoint.
- **Scenario data lives in `data.js`, not `disputes.js`** — `DISPUTE_TEST_SCENARIOS`/`DISPUTE_TEST_CARDS`/`DISPUTE_EXPIRY` are plain data, rendered generically by `renderScenarioGroups()`. Adding a new scenario or card later is a data-only change.
- **Evidence submission is two explicit steps in the UI** (Save, then Submit) with a native `confirm()` gate on Submit — mirrors the API's own two-step design (`PUT` to attach, `POST` to finalize) and makes the irreversibility visible rather than hidden behind one button.

### Prerequisite — Not Yet Verified

- [ ] The sandbox secret key needs the `disputes`, `disputes:view`, and `disputes:provide-evidence` scopes. If any dispute route 401s, this is the first thing to check (Dashboard → API keys → scopes).

### Pending Manual Steps

- [ ] Deploy the Lambda zip (new `disputes/` folder + `api-route-controller.js` mount)
- [ ] Add these routes in AWS API Gateway → Lambda proxy → `flowDemoLambdaSyed`: `POST /disputes/create-test-payment`, `GET /disputes`, `GET /disputes/{id}`, `POST /disputes/{id}/accept`, `PUT /disputes/{id}/evidence`, `GET /disputes/{id}/evidence`, `POST /disputes/{id}/evidence/submit`
- [ ] End-to-end test: trigger the `evidence_required` Visa scenario, confirm a dispute appears within ~5 minutes, save + submit text evidence, confirm status changes

### Resume Here Next Session

Not yet merged to `main` — on branch `feature/disputes-testing-tab`, awaiting user testing per this session's established "test before commit" workflow. If file-upload evidence support is wanted later, it needs `POST /files` (multipart binary proxy — check Lambda/API Gateway payload size limits first) before `PUT /disputes/{id}/evidence` can reference a `file_id`.

---

## Session Summary (2026-10-01) — Authorization Types Tab

### What Was Built

New **Authorization Types** tab testing Partial Authorization, Estimated Authorization (+ Incremental Authorization / Extend Validity), American Express Enhanced Authorization, and Discover Enhanced Decisioning — all verified against CKO docs directly (not memory) for exact field names, test cards, and verification signals before building.

### New Files

| File | Purpose |
|---|---|
| `frontend/tabs/auth-types.html` | 4-way type selector, per-type info/warning banners, raw-card form with dynamically highlighted enhanced-data fields, balances table, actions panel (Capture/Void/Increment/Extend) |
| `frontend/modules/auth-types.js` | All wiring — type selection reconfigures the form, builds the right request body per type, webhook polling after every action, collapses the setup UI into a compact summary bar once a payment exists |

### Backend Reuse (per explicit user request to avoid new API Gateway routes wherever possible)

| Action | Route | Status |
|---|---|---|
| Create payment (raw card, any auth type) | `POST /payments` | **Existing route, extended** — now accepts a raw card source (previously token-only) plus optional `authorization_type`, `partial_authorization`, `shipping`, `payment_ip`, `items`, `description`. Zero Gateway change. |
| Capture (full or partial) | `POST /capture-payment` | **Existing route, extended** — now forwards an optional `amount` in the body for partial capture; empty body still means full capture (unchanged for every existing caller). Zero Gateway change. |
| Void | `POST /void-payment` | Existing route, unchanged. |
| Get updated balances | `GET /get-payment-details` | Existing route, unchanged. |
| Webhook polling | `GET /webhook-event` | Existing generic store (keyed by the event's own `data.id`), unchanged. |
| **Increment authorization / extend validity** | `POST /increment-authorization` | **One new route** (mirrors the exact `/capture-payment`/`/void-payment` pattern) — `POST /payments/{id}/authorizations` has no existing equivalent. User explicitly approved this single exception. |

### Key Facts Verified From Docs (not from memory — worth trusting these over guessing later)

- **Partial authorization** requires `partial_authorization.enabled: true` AND the sandbox account being enabled for it by Checkout.com's account team — the UI surfaces this as a visible warning, since without it you'll see a normal `20051` decline instead of `10010`/"Partial Value Approved".
- Partial auth test cards/amounts: Visa `4757337282365488`, Mastercard `5518207720770101`, Amex (US only) `345678901234456` — amount must be exactly `10000` or `1000` (minor units).
- **Estimated authorization** (`authorization_type: "Estimated"`) auto-disables capture-on-authorization regardless of the `capture` field sent.
- **Incremental Authorization** only works on an open Estimated authorization with nothing captured yet. Scheme support varies: Visa/Amex(US) can increase amount only; Mastercard can increase amount AND extend validity (resets 30-day window); Mada can only extend validity, never increase amount.
- **Amex Enhanced Auth** and **Discover Enhanced Decisioning** are NOT separate API flags — they're just extra fields (`customer.email/phone`, `payment_ip`, `shipping.*`, plus `items[].reference` and Amex-specific `shipping.method`/`shipping.timeframe` values for Amex) added to a normal payment request. There is no response flag confirming they "worked" — success means the fields were sent, which the UI state (highlighted required fields) makes explicit rather than implying a pass/fail check exists.
- Webhook events confirmed from docs: `payment_approved`, `payment_declined`, `payment_authorization_incremented`, `payment_authorization_increment_declined`, `payment_captured`, `payment_capture_declined`, `payment_voided`, `payment_void_declined`.

### Key Patterns Established

- **`cko.payments.request` (checkout-sdk-node) throws errors shaped as `{ http_code, body }`, NOT axios's `{ response: { status, data } }`** — the generic `/payments` route's catch block was fixed to use `error.http_code`/`error.body`. Any future route using the SDK client (not raw `axios`) must use this same shape or a 422 decline error becomes a useless generic 500.
- **UX pattern for "setup vs. result" clutter** (same lesson as the Disputes tab): once a payment is created, the entire setup UI (`#at-setup-sections` — type grid, info banners, test cards, form) collapses behind a compact summary bar with a "Start New Test" button, rather than leaving the full selection UI visible alongside results/actions.
- **Highlighted-field pattern**: `.at-highlight-field` + `.at-field-badge` in `auth-types.html`/`.js` — reusable visual language for "this field matters for the currently selected mode, here's why" that could be lifted into other tabs later.

### Resume Here Next Session

Not yet merged to `main` — on branch `feature/authorization-types-tab`, awaiting user testing. Before merging, remember: the new `/increment-authorization` route needs a manual AWS API Gateway resource + Lambda zip upload, same as every other backend change in this app.


---

## Session Summary (2026-10-28) — Standalone Checkout Suite Tab

### What Was Built

New **Standalone Suite** tab with a product selector (like Card/Bank payouts): **Standalone 3DS (hosted sessions)**, **Network Tokens**, **Account Updater & RTAU**, **Card Metadata**. One shared **Card Source** panel feeds every product: *Saved card (COF CIT)* dropdown of `src_` ids, *New card* (Flow tokenization → `POST /instruments` → saved), or *Raw test card*. One shared **Live Webhooks** panel. Every request/response/webhook goes to the API log sidebar.

### New Files

| File | Purpose |
|---|---|
| `amplify/.../src/standalone/standalone-routes.js` | 10 routes mounted at `/standalone`: OAuth token helper (cached per scope), uniform envelope `{ upstream_status, upstream, auth_mode, cko_request_id, data }`, webhook ring buffer |
| `frontend/tabs/standalone.html` | Tab UI |
| `frontend/modules/standalone.js` | All logic |

### Files Modified (additive)

`config.js` ×2 (`ckoAccessKeyId/Secret/Url`), `api-route-controller.js` (mount; `/webhook` also calls `standaloneRoutes.recordWebhook`; `/payments` now also accepts `source.id` instruments, `source.type=network_token`, `allow_update`, `3ds`, `processing`, `merchant_initiated`, `previous_payment_id`), `data.js` (`SUITE_*` test-card constants), `main.html`, `loader.js`, `index.html`.

### Backend Routes (each needs a manual API Gateway method)

`POST /standalone/sessions`, `GET /standalone/session?id=`, `POST /standalone/network-tokens`, `GET /standalone/network-token?id=`, `POST /standalone/network-token-cryptogram?id=`, `POST /standalone/network-token-delete?id=`, `POST /standalone/account-updater`, `POST /standalone/instruments`, `GET /standalone/webhook-events`, `GET /standalone/config`. Reuses existing `/payments`, `/card-metadata`, `/payment-sessions`, `/get-payment-details`.

### Key Patterns Established

- **Auth mode**: sessions default to OAuth, everything else to the secret key; the `x-auth-mode: oauth|secret` header (UI dropdown) overrides per request.
- **Webhooks**: the existing `/webhook-event` store is one-event-per-`data.id` and delete-on-read, so it can't hold `network_token_update` / `card_updated` (no `data.id`). `/standalone/webhook-events?since=&types=&match=` reads a separate non-consuming 200-event buffer. `match` is comma-separated OR substrings. Per warm Lambda container only.
- **localStorage keys**: `cko-suite-instruments` (src_ ids grouped by customer email / cus_ id; same-email cards reuse the known `cus_` id; same fingerprint+customer de-duplicates), `cko-suite-network-tokens`. `sessionStorage` `cko-suite-3ds-pending` survives the hosted redirect.
- Hosted 3DS returns to `index.html?suite=3ds&cko-session-id=…`; `standalone.js` handles it on `window.load` (after script.js's first-tab click).
- **Sessions redirect link is `_links.redirect_url.href`** in the real sandbox (docs say `_links.redirect`), returned on both POST and GET /sessions. The code accepts either.
- **Hosted-3DS round trip (state restore)**: the app has no routes, so the hosted redirect returns to `index.html?suite=3ds&outcome=…&cko-session-id=…`. `saveSnapshot()` stores the whole tab (every `#sa-*` field, mode, selected `src_`, session, results HTML, webhook list) in `localStorage['cko-suite-3ds-snapshots'][sid]` (newest 10) — on session creation, on every status change, on edits (debounced), after payments, and just before redirecting. `handleReturn()` (on `window.load`, after script.js's first-tab click) re-opens the tab, calls `restoreSnapshot()`, re-fetches the session and resumes polling. No `cko-session-id` in the URL → falls back to `cko-suite-3ds-last-sid`. A `BroadcastChannel('cko-suite')` message makes the original tab refresh instantly when the return happened in another tab. Fields the user edited (e.g. a tampered eci) are never overwritten by a session refresh. The same `collectFields()/restoreSnapshot()` approach can be reused for any future redirect flow.
- **One payment per authentication (Step 3 gate)**: `payGate()` / `updatePayGate()` lock Step 3 unless a session exists, has left pending/processing/challenged, and has no recorded payment. A payment request that returns a payment id (approved OR declined) calls `markConsumed(sid)` → `localStorage['cko-suite-3ds-consumed']`; a request rejected before a payment exists (e.g. 422) does not consume it. The lock survives reload, return from the hosted page, "Reset 3DS state" and other tabs (`storage` event); the only way forward is a new session + redirect. `runBusy` re-enables buttons in `finally`, so `afterBusy()` re-applies the gate — keep that call. "Finished" is an **allowlist** (`FINAL_STATUSES`: approved, attempted, declined, rejected, unavailable, challenge_abandoned, expired) — unknown statuses stay locked. Real sandbox lifecycle observed: frictionless `pending → approved` (`next_actions: []`), challenge `pending → challenged` (`next_actions: ["redirect_cardholder"]`) → final after the challenge. **Payment details are session-scoped**: the 3DS "Get payment details" button fetches `sessionPaymentId()` (the payment recorded against the session on screen, from `cko-suite-3ds-consumed`) and is hidden when the session has no payment. Never use `state.lastPaymentId` for it — that is a tab-wide value overwritten by every panel's payments (Network Tokens, RTAU). Loading a different session clears the previous session's payment/details panels. **"Via full 3DS data" requires a cryptogram** (`sessionHas3dsData`): real declined / rejected / unavailable sessions return `eci: "07"` + `xid` but NO cryptogram, so that option is disabled (with an explanation) and the mode is forced back to "via session id" (`3ds.authentication_id`); approved / attempted sessions have one. Key off the cryptogram, never the eci. New assets are loaded with `?v=` cache-busters (`index.html`, `loader.js`) — bump it when redeploying changes to them.
- **Redirectless frictionless (HTTP 201)**: `POST /sessions` returns **202 pending** + redirect link normally; if `channel_data` (browser object: user_agent, accept_header, ip_address, language, timezone, color_depth, screen_width/height, java/javascript_enabled, three_ds_method_completion…) is sent up front, a frictionless card returns **201 `approved`** with `eci` + cryptogram and NO redirect (hosted AND non_hosted; verified on the real sandbox). A challenge card + `channel_data` returns 201 `challenged` and, for hosted, a `redirect_url` for the challenge only; non_hosted returns `next_actions: [challenge_cardholder]` (this tester has no challenge UI → use hosted). Toggle `sa-3ds-redirectless` + `sa-3ds-completion-type`; browser data auto-detected from `navigator` (`detectBrowserData()`), IP defaults to documentation IP 203.0.113.10. Final-on-create sessions skip polling and unlock Step 3 immediately.
- **SCA exemptions** are just `challenge_indicator` values (low_value, transaction_risk_assessment, trusted_listing, trusted_listing_prompt, secure_corporate_payment, data_share) — the select is grouped and explains each (`CHALLENGE_INFO`). Real sandbox behaviour (measured): every value is accepted and echoed as `exemption.requested`; `exemption.applied` stays `none` EXCEPT `trusted_listing` on Visa `4556085951507152` (applied, frictionless, deterministic); `data_share` on a challenge card → `unavailable`; low_value/TRA amount limits are not enforced by the simulator. The UI shows requested vs applied (`exemptionNote`), warns there is no liability shift when applied, and pre-fills Step 3 `3ds.exemption` for the raw-3DS-data path (docs: flag an exemption applied during authentication). One-click scenarios live in `SESSION_PRESETS`.
- **Webhook list ≡ API log (single pipeline)**: `pollWebhooks()` always fetches the whole buffer (`since=0`, `types` only — separate warm Lambda containers have independent buffers and sequence numbers, so a `since` cursor would hide events) and `ingestWebhook()` is the ONLY place an event enters the list (`state.whAll`) and the API log, once per `event_id` (`state.whSeen`, persisted in sessionStorage like the log). Relevance (`whRelevant`) = payload mentions one of the ids in the follow field (`session_id` / `payment_id` / nt / src_), or everything when the field is empty (live view: the first sight of the buffer is a silent baseline, so old events are not dumped). Never reintroduce a "replay" mode that lists without logging, and never filter on the backend `match` param for display — both caused list/log divergence. Snapshots store and re-adopt only relevant events (`adoptWebhooks`, which also logs any a brand-new tab has not logged). Still per-container in-memory on the Lambda: an event delivered to a container that is never polled again is invisible (a shared store such as DynamoDB would fix that).
- **RTAU simulator cases (Account Updater panel, section C)**: built from the Google Doc “CKO Account Updater Sandbox Simulator Test Cases” (+ its comment threads). Data lives in `RTAU_GROUPS` (data.js): Visa RTAU (card 4539361261984692, via Source ID, MIT=true; amount 100–700 and expiry pick the outcome; any deviation → 20059), Mastercard Update & Retry (…73 = card-number update, …65 = expiry update; amounts 9779/9782/7779/7782), Mastercard Store & Update (10 trailing-digit rules). `runRtauCase()` creates a FRESH `src_` (`POST /instruments` type `card` — raw-card instruments REQUIRE `processing_channel_id`; token-based ones do not), sends the documented payment through the existing `/payments` route and scores the real response with `checksFor()` / `checksForStore()`; the `card_updated` webhook is tracked per case via the webhook pipeline (the runner's instrument ids are added to the follow list). **Network-token merchants must send `processing.pan_preference = "fpan"`** or the payment is processed with a DPAN and RTAU is skipped (toggle `sa-rtau-fpan`). Each case carries a `sandbox` badge from live runs on 2026-10-30: works / flaky / deviates / broken — Visa 600 & 700 are unsupported (20059), Visa 400 is flaky (12/2025 expiry is now past), MC 7782 and the raw-card MC rows do not retry, Visa standalone updater returns `merchant_not_onboarded`. Verified: 30 cases, results match the badges. A batch (`state.rtauBatch`) keeps all run buttons locked between cases.
- **Network Tokens tab**: `eciFromCryptogram()` — the cryptogram response carries an `eci` for Visa (`07`) but NONE for Mastercard/MDES; a missing eci must stay missing (blank field, omitted from the request), never `String(undefined)`. Valid on Mastercard: eci omitted or `02`; `05` (a Visa value) → `20012`. Section C2 has editable token / expiry / token_type / cryptogram / eci fields (filled by "Pay with the selected network token", which always fetches a fresh cryptogram; "Pay with these details" sends the fields as typed). Section D (`NT_GROUPS` in data.js) is a scripted-scenario runner (`execNtcStep`: instrument / provision / get / cryptogram / delete / pay, each step checked) with expectations recorded from real sandbox runs on 2026-10-30: provisioning 200 = existing token, 201 = new; only Visa (VTS) and Mastercard (MDES) — Amex / Discover / Diners → `422 scheme_not_supported`, JCB → empty `404`, bad Luhn → `card_number_invalid`; delete → 204 then state `inactive` (not "deleted"), cryptogram → `422 token_not_active`, second delete → 404, re-provisioning revives the same `nt_` id (201); the sandbox does NOT validate cryptograms or token expiry; `pan_preference: fpan` → `pan_type_processed = fpan`, a stored card otherwise uses its token (`dpan`). This account declines every Visa customer-initiated payment with `43102` (Visa AFT mandate compliance) — Visa token payments need `merchant_initiated = true` (toggle `sa-nt-pay-mit`).
- Snapshots hold raw test-card data and `session_secret` in localStorage — sandbox test data only. "Reset 3DS state" clears the current session's snapshot (saved cards/network tokens are kept).
- No CKO-published test cards exist for RTAU / Standalone Account Updater; both need enablement from the account manager. The UI says so.

### Pending Manual Steps

- [ ] Set `CKO_ACCESS_KEY_ID`, `CKO_ACCESS_KEY_SECRET`, `CKO_ACCESS_URL` in `.env` and on the Lambda. OAuth client scopes: `sessions:browser sessions:app vault:network-tokens vault:instruments vault:real-time-account-updater`
- [ ] Deploy Lambda zip (new `standalone/` folder + controller changes)
- [ ] Add the 10 routes above in API Gateway → Lambda proxy → `flowDemoLambdaSyed`, redeploy to `staging`
- [ ] CKO Dashboard → Webhooks workflow: subscribe the existing webhook URL to `authentication_*`, `network_token_update`, `card_updated`
- [ ] Real end-to-end run (only mock-tested so far)

---

## Session Summary (2026-10-30) — Stripe / Adyen embeds follow the app theme

### What Was Built

Stripe and Adyen embedded UIs now follow the top-right theme selector (light / dark / midnight / neon) instead of vendor defaults. All mapping lives in one new file, **`frontend/modules/competitors/partner-theme.js`** (`window.PartnerTheme`, loaded before `stripe.js`/`adyen.js`).

| Surface | Mechanism | On theme change |
|---|---|---|
| Stripe split card fields | `style` object (`stripeCardStyle()`) | `element.update({ style })` — live, typed values kept |
| Stripe Payment Element | `appearance` (`stripeAppearance()`: `night` when dark, else `stripe`, + variables/rules) at `initCheckoutElementsSdk` | re-initialised (`mountPaymentElement()`) |
| Stripe embedded Checkout | `branding_settings` on the Checkout Session (`stripeBranding()`) | new session created with new branding (`onThemeChanged`) |
| Adyen Drop-in / Card / advanced | `--adyen-sdk-*` CSS vars on `:root` (live) + `styles` for secured card iframes | vars instant; component re-mounted (skipped once `paymentSubmitted` or a 3DS iframe is open) |

### Key Patterns

- Partner SDKs reject non-hex colours (Stripe branding needs strict 6-digit `#rrggbb`) — `PartnerTheme.toHex()` normalises every token (incl. rgba glow) via canvas.
- Every consumer calls PartnerTheme through a `themed(fn, fallback)` guard so a theming failure can never block a payment flow.
- New partners: add a mapping function to `partner-theme.js` and subscribe via `PartnerTheme.onChange(fn)` (150 ms debounced `themechange`).
- Backend: `stripe-routes.js` `sanitizeBranding()` validates `branding_settings` for **embedded** sessions only; if Stripe rejects it, the route logs `branding_rejected_retrying_without` and retries without branding. **Lambda redeploy required** (old Lambda just ignores the field — nothing breaks). No new API Gateway routes.
- Stripe Direct API shows its result inline (no redirect to `success.html`); Payment Element and Adyen redirect.

### Known Limitation

Stripe embedded Checkout's inner form panel stays white — `branding_settings` only controls page background, button colour, radius and font. Fully theming it would need Stripe's newer embedded-form SDK (Appearance API); not implemented. Stripe Payment Links / hosted Checkout and Adyen Hosted Checkout / Pay by Link are external pages and can't be themed.

### Resume Here Next Session

Theme work is uncommitted. Deploy `stripe-routes.js` to Lambda for embedded branding to take effect; frontend goes live on push to `main` (cache-bust `?v=20261101a` already set in `index.html`).

---

## Working Preferences (standing instructions)

- **Be careful not to break working features, but do NOT run full end-to-end / integration regression suites after every change.** It takes too long. Verify only what the change touches (a targeted check, or none if trivial); skip broad regression runs unless the user asks.

---

## Session Summary (2026-11-02) — Stripe embedded form (fully themeable)

- New 3rd option in Stripe → Checkout: **Embedded form (themeable)** — `ui_mode: 'form'` session + `stripeClient.initCheckoutFormSdk({ clientSecret, appearance })` → `checkout.createForm({ layout: 'expanded' }).mount()`; confirm via `checkout.loadActions()` + `form.on('confirm')`; a confirmed payment redirects to `return_url` (success.html). Available in the already-loaded `dahlia/stripe.js`; no script change.
- Theming: `PartnerTheme.stripeFormAppearance()` = Payment Element appearance **without `rules`** (unsupported by the form). Appearance is fixed at init, so `mountCheckoutForm()` re-inits with the SAME client secret on `themechange` (no new session).
- Backend: `POST /competitors/stripe/checkout/session` accepts `mode: 'form'`. **Lambda redeploy of `stripe-routes.js` needed**; no new API Gateway route.
- Unlike the older embedded Checkout (`embedded_page`, white inner panel), the whole form follows the theme.

---

## Session Summary (2026-11-02) — Vault: Customers & Instruments (Standalone Suite product)

New 5th product in the Standalone Suite selector ("Vault: Customers & Instruments"). Self-contained: own module `frontend/modules/vault.js` + panel `#sa-panel-vault` appended to `tabs/standalone.html`; `selectProduct('vault')` in `standalone.js` hides the shared card source + webhook panel and calls `window.SuiteVault.onShow()`.

- **No list endpoints exist** (only GET by `cus_` id/email or `src_` id), so the tab keeps a local directory (`localStorage['cko-vault-directory']`, seeded once from `cko-suite-instruments`); **Refresh all** re-fetches each id (404 → removed). Lookup box loads any `cus_` / email / `src_`.
- **Backend**: ONE new route `POST /standalone/vault { method, path, body }` in `standalone-routes.js` — allowlisted proxy (`POST /customers|/instruments`, `GET|PATCH|DELETE /customers|/instruments/{id}`, `GET /validation/bank-accounts/{c}/{cur}`), secret key by default. **Needs an API Gateway method + Lambda redeploy.** Instrument *creation* reuses the existing `POST /standalone/instruments`; Flow tokenizer reuses `/payment-sessions`.
- **Create**: Flow tokenize (`type: token`), raw card (`type: card` + `processing_channel_id`), SEPA, bank_account; optional `customer: { id | email, default }`; "Extra JSON" is deep-merged into any create body.
- **Sandbox facts (verified live)**: "Make default" works via `PATCH /customers/{id} {default: src_}` (204); `PATCH /instruments` with `customer.default: true` returns 200 but does NOT change the default. A customer created via `POST /customers` has no default until set. Deleting the default instrument drops the `default` key. `PATCH /instruments` (expiry/name) changes the fingerprint. SEPA create responses omit `customer` — the UI falls back to the requested customer id. Customer GET instrument items omit `name` (use instrument GET → "Details"). Deleting a customer deletes all its instruments (404 afterwards). Card `number` must be 16 digits (no Amex in this API).
- All requests go to the API log sidebar; IDs are click-to-copy chips.
- **Stored cards in Flow (Vault tab)**: block "Stored cards in Flow" → **Render Flow** creates a payment session via the existing `/payment-sessions` with `customer {id,email}` + `payment_method_configuration.stored_card.customer_id` (+ `card.store_payment_details: collect_consent`) and mounts `checkout.create('flow')`. Defaults to `cus_xhsalsrfvkjuxhsxcab2eo4m2y` / `sm_hasnain96@hotmail.com` (also seeded into the directory); selecting another customer in the list fills the fields. Optional "Always capture CVV" (`componentOptions.stored_card.captureCardCvv`). Pays through `success.html` like Flow tab. No backend change.

---

## API log conventions (2026-10-31)

- **The API log shows only the Checkout.com exchange** — what a merchant integration sends/receives: CKO request body, CKO response body, upstream status, full CKO URL. Never log this app's own wrapper (`/standalone/*` envelope fields `upstream_status` / `auth_mode` / `cko_request_id`, the `/standalone/vault` proxy payload `{method,path,body}`) and don't log calls that never reached CKO (gateway/network failures → toast only).
- `addToApiLog(method, endpoint, status, req, res, url)` — new optional 6th arg `url`; the log-detail modal shows `METHOD <full url>` (click to copy) at the top. Without `url` it falls back to a `http(s)://…` URL embedded in the endpoint label (partner calls via `withUpstream()` already include one), else the label. Entry ids are de-duplicated (two logs in the same millisecond used to overwrite each other).
- Standalone Suite: `logCko()` (standalone.js) / `request()` (vault.js) parse `env.upstream` ("POST https://…") for method + URL. Calls through existing raw routes (`/payments`, `/payment-sessions`, …) pass a best-effort `https://api.sandbox.checkout.com<path>` (our `/card-metadata` → `/metadata/card`, `/get-payment-details` → `/payments/{id}`). Webhook entries log the CKO event shape `{id,type,created_on,data}`.
- Other (older) tabs still log without a URL; pass a 6th arg there when touching them.

---

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

## Session Summary (2026-10-31) — App shell redesign: grouped left nav + docked API log

The horizontal tab bar (10 tabs, last one hidden under the floating log) was replaced so the app can keep growing.

- **Left navigation** (`tabs/main.html`, CSS at the end of `style.css`, behaviour in `modules/nav.js`): groups **Accept payments** (Checkout Flow, Wallets, Payment Setup, Authorization Types) · **Manage** (Payments, Disputes, Payouts) · **Standalone** (3DS, Network Tokens, Account Updater & RTAU, Card Metadata, Vault) · **Tools** (Forward API, Competitor Testing). Groups fold (remembered, `cko-nav-groups`); the whole menu collapses to icons (remembered, `cko-nav-collapsed`); ≤900px it is a ☰ slide-over drawer.
- **Adding a page**: add a `<div id="x-tab" class="tab-content">` + `loader.js` injection as before, then ONE nav item inside the right `.nav-group` in `main.html`: `<button class="tab-link nav-item" onclick="openTab(event, 'x-tab')" title="…"><span class="nav-ico">🆕</span><span class="nav-label">…</span></button>`. They are still `.tab-link` buttons calling `openTab(event, …)` — `script.js`, the initial-tab click, the 3DS return and the Payments-tab hook all work unchanged. A new group = another `.nav-group` block.
- **Standalone products are nav items** (`data-sa-nav="3ds|nt|au|meta|vault"`, onclick `openTab(event,'standalone-tab'); selectStandaloneProduct('<key>')`; `window.selectStandaloneProduct = selectProduct` in `standalone.js`). The in-page product picker is kept in the DOM but hidden (code toggles `data-sa-product`). A new Standalone product = add its panel + a `data-sa-nav` item.
- **API log is docked** on the right (index.html only: `loader.js` adds `body.app-docked`; success/failure pages keep the floating log): pushes the content instead of covering it, collapses to a slim tab with a call-count badge, drag the left edge to resize (`cko-log-w`, 280–720px), state remembered (`cko-log-collapsed`; default collapsed below 1500px wide so forms keep their room). ≤900px it keeps the old bottom drawer + 📋 button. Built in `api-log.js` (`_ensureDock`).
- Layout: `.app-body` (flex) → `nav.side-nav` · `main.wrapper` (max 1100px) · `#api-sidebar`; header is full width in this layout. CSS cache-buster: `style.css?v=…` in `index.html` — bump together with the JS ones.

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
