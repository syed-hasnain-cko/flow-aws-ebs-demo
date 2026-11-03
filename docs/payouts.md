# Payouts tab (card + bank)

> Moved verbatim from CLAUDE.md. Update this page (not CLAUDE.md) when you change this area.

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
