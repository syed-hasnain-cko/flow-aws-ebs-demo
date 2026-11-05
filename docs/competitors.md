# Competitor Testing (Stripe / Adyen) + theming

> Moved verbatim from CLAUDE.md. Update this page (not CLAUDE.md) when you change this area.

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

## Session Summary (2026-11-02) — Stripe embedded form (fully themeable)

- New 3rd option in Stripe → Checkout: **Embedded form (themeable)** — `ui_mode: 'form'` session + `stripeClient.initCheckoutFormSdk({ clientSecret, appearance })` → `checkout.createForm({ layout: 'expanded' }).mount()`; confirm via `checkout.loadActions()` + `form.on('confirm')`; a confirmed payment redirects to `return_url` (success.html). Available in the already-loaded `dahlia/stripe.js`; no script change.
- Theming: `PartnerTheme.stripeFormAppearance()` = Payment Element appearance **without `rules`** (unsupported by the form). Appearance is fixed at init, so `mountCheckoutForm()` re-inits with the SAME client secret on `themechange` (no new session).
- Backend: `POST /competitors/stripe/checkout/session` accepts `mode: 'form'`. **Lambda redeploy of `stripe-routes.js` needed**; no new API Gateway route.
- Unlike the older embedded Checkout (`embedded_page`, white inner panel), the whole form follows the theme.

---

## Stripe Payment Links — reusable links (2026-11-06)

- Payment Links mode now supports **Fixed amount** or **Customer chooses the amount** (Price with `custom_unit_amount {enabled, minimum, maximum, preset}`; made via `POST /v1/prices` first because `payment_links` `price_data` has no `custom_unit_amount`), **Max completed payments** (`restrictions.completed_sessions.limit`), an **inactive message**, and a **Deactivate / Reactivate** button (`POST /competitors/stripe/payment-links/:id/active`, POST not PATCH so the API Gateway CORS mock needs no change).
- Stripe links have **no expiry** and are reusable (each visit = new Checkout Session); they stop only via `active=false` or the payment cap. Response counter is `restrictions.completed_sessions.count` / `.limit`.
- Routes: `POST /payment-links`, `GET /payment-links/:id`, `POST /payment-links/:id/active`. Unverified against live Stripe sandbox until first use — check the API log for 4xx.
