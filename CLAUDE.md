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
- And all other router.post and router.get and router.put.

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

- [ ] Add `CURRENCY_ACCOUNT_ID=ca_...` to `.env` and to Lambda environment variables in AWS console
- [ ] Add `POST /payouts` route in AWS API Gateway → Lambda proxy → `flowDemoLambdaSyed`
- [ ] Deploy Lambda zip after route changes
- [ ] Replace placeholder FTT codes in `data.js` `PAYOUT_FUNDS_TRANSFER_TYPES` with real scheme-assigned codes (already done by user for sandbox — Visa: AA/PP/FT/WT/TU/FD/PD, Mastercard: C55/C07/C52/C65)
