# Core architecture history (April 2026)

> Moved verbatim from CLAUDE.md. Update this page (not CLAUDE.md) when you change this area.

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

Every new Express route in `api-route-controller.js` must be reachable through AWS API Gateway before it works in production. *Update (2026-11-02): this is now checked/automated — `npm run api:diff` lists unreachable routes and `npm run api:sync` creates them (see “AWS deploy tooling”). Routes under `/standalone`, `/competitors` and `/disputes` already work through catch-all `{proxy+}` resources and need nothing.*

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
