# Add Partner — Project Skill

You are working inside this Checkout.com demo app's **Competitor Testing** section (`frontend/tabs/competitors/`, `frontend/modules/competitors/`, `amplify/backend/function/flowDemoLambdaSyed/src/competitors/`). This skill scaffolds a brand-new partner (Adyen, Payrails, Primer, or any other PSP/orchestrator) end-to-end, following the exact structural, security, and API-verification patterns established by the Stripe integration — the reference implementation for every partner that follows.

Do not write a single line of code until Step 4 is confirmed by the user.

---

## Why this skill is strict about API verification

Building the Stripe integration in this app hit **five separate breaking API renames** that cached/remembered knowledge got wrong: `ui_mode: 'embedded'` → `'embedded_page'`, `ui_mode: 'custom'` → `'elements'`, `stripe.initEmbeddedCheckout()` → `stripe.createEmbeddedCheckoutPage()`, a Stripe.js bundle version gate (`v3` doesn't include `initCheckoutElementsSdk`, needed `dahlia`), and a Checkout Session field requirement (`automatic_payment_methods.allow_redirects`) that only surfaces at runtime. **Every partner API evolves the same way.** Never generate integration code from memory alone — always verify the current method names, parameter shapes, and required fields against a live source (MCP tool or fetched docs) immediately before writing the code that uses them, not just once at the start of the whole skill run.

---

## STEP 1 — Partner identity and access

Ask the developer, all at once:

```
1. Partner name? (e.g. Adyen, Payrails, Primer)

2. Do you already have API credentials for this partner in sandbox/test mode?
   If yes: what should the env var names be? (I'll suggest a convention below if you're unsure.)
   If no: you'll need to sign up for a sandbox account before we can test anything live —
   scaffolding can still proceed, but nothing will work until credentials exist.

3. Is there an MCP server connected for this partner already?
   (Run /mcp to check the list, or tell me the exact tool name if you know it —
   e.g. mcp__claude_ai_Stripe__* was the pattern for Stripe.)
   If not connected and one exists (check the MCP marketplace / claude.ai integrations),
   connect it now before continuing — it was significantly more reliable this session
   than documentation search alone for catching API renames.

4. If no MCP is available: give me a link to the partner's API reference docs.
   I'll use WebFetch/WebSearch against it for research instead.
```

Suggested env var naming convention (mirrors `STRIPE_SECRET_KEY`/`STRIPE_PUBLISHABLE_KEY`/`STRIPE_WEBHOOK_SECRET`):
```
<PARTNER>_SECRET_KEY / <PARTNER>_API_KEY     # server-side auth
<PARTNER>_PUBLISHABLE_KEY / <PARTNER>_CLIENT_KEY   # exposed to frontend, if the partner's SDK needs one
<PARTNER>_WEBHOOK_SECRET                     # webhook signature verification
```

Wait for answers before proceeding.

---

## STEP 2 — Research the partner's integration surface

Using whichever access Step 1 confirmed (MCP tools or WebFetch/WebSearch against docs), research:

1. **What acceptance modes does this partner actually offer?** Map them against the catalog already built for Stripe — don't assume all four exist for every partner:
   - **Direct API** — raw payment method + payment/intent creation, fully custom UI
   - **Hosted / Redirect Checkout** — partner-hosted page, redirect-based
   - **Embedded / Drop-in Checkout** — partner's prebuilt UI mounted in-page
   - **Elements / Components (Custom UI)** — partner renders only the sensitive fields, you own the layout
   - **Payment Links** — no-code hosted URL
   - Note any partner-specific modes that don't map to this catalog (e.g. an orchestrator's routing/cascading config) — these become their own new catalog entries, not shoehorned into the above.

2. **For each mode the developer wants** (confirmed in Step 3): the exact current method/parameter names. Check specifically for:
   - Renamed or deprecated parameters (search the partner's changelog, not just the main guide)
   - Whether the client SDK requires a specific script version/tag (like Stripe's `dahlia` build) rather than a generic "latest" URL
   - Whether dynamic/automatic payment method selection exists, and what the *current* non-deprecated way to enable it is (never hardcode a payment-method allowlist unless the developer explicitly asks)
   - What return/redirect fields work in this app's local dev context — this app has no real backend server behind `npm start` (see `CLAUDE.md` Architecture section); every backend route must go through the manually-deployed Lambda regardless of environment

3. **Webhooks**: what event types exist, what the signature verification mechanism is (HMAC header? something else?), and whether it needs the same `req.rawBody` capture pattern already added to `app.js` for Stripe (check — it may already be raw-body-safe for all future partners, verify by reading `amplify/backend/function/flowDemoLambdaSyed/src/app.js`).

4. **SDK delivery**: if the partner has a server-side SDK (npm package), note it now — Step 6 needs it delivered via a Lambda Layer, not committed into `node_modules` inside the zip.

Present findings before Step 3's questions, e.g.:
```
Adyen offers: Drop-in (embedded components), Hosted Checkout (redirect), Components (Custom UI — closest
match to Stripe's Payment Element mode). No direct Payment Links equivalent — closest analog is
Pay by Link, which behaves more like a hosted-page mode than a no-code URL generator.
Current API version: 2026-01-01 (checked via [MCP tool / docs URL]).
```

---

## STEP 3 — Feature/mode selection (ask, don't assume)

```
Based on the research above, which modes do you want scaffolded for [Partner]?
[ ] Direct API
[ ] Hosted / Redirect Checkout
[ ] Embedded / Drop-in
[ ] Elements / Components (Custom UI)
[ ] Payment Links (or partner's closest equivalent — name it if different)
[ ] Other partner-specific mode: ____________

For each mode selected, should it include:
- A "Force 3DS" or equivalent test toggle, if the partner supports one? (Y/N per mode)
- Refund / capture / cancel actions in the shared Refund/Actions panel? (assume yes unless told otherwise)
```

---

## STEP 4 — Confirm the full change plan

Present this and wait for explicit go-ahead:

```
FILES I WILL CREATE:
  frontend/tabs/competitors/[partner].html          — Mode selector + one panel per selected mode
  frontend/modules/competitors/[partner].js          — All frontend logic for [partner]
  frontend/modules/competitors/[partner]-shared.js   — Success/failure page integration (only if any
                                                        mode redirects/navigates on completion)
  amplify/backend/function/flowDemoLambdaSyed/src/competitors/[partner]-routes.js

FILES I WILL MODIFY:
  frontend/tabs/competitors/index.html   — Enable the [partner] button in #competitor-partner-selector,
                                            add #partner-panel-[partner] div
  frontend/tabs/loader.js                — Inject [partner].html into its panel div
  frontend/index.html                    — Add partner SDK script tag(s) + module script tags
  frontend/script.js                     — Currency/country dropdown population for [partner] forms,
                                            stop-polling-on-tab-switch guard (mirror the Stripe pattern)
  frontend/success.html, frontend/failure.html   — Branch to [partner]-shared.js (only if needed)
  amplify/backend/function/flowDemoLambdaSyed/src/api-route-controller.js
                                          — router.use('/competitors/[partner]', require('./competitors/[partner]-routes'))
  amplify/backend/function/flowDemoLambdaSyed/src/config.js, config.js (root)
                                          — [partner]SecretKey / [partner]PublishableKey / etc, all reading
                                            from process.env with empty-string fallback (never hardcoded)
  .env                                    — New env var placeholders with a comment on where to get real values

Shall I go ahead? (yes / no / adjust)
```

---

## STEP 5 — Build the backend routes

Create `amplify/backend/function/flowDemoLambdaSyed/src/competitors/[partner]-routes.js`. Mirror `stripe-routes.js`'s structure exactly:

```js
// ─── Competitor Testing: [Partner] ───────────────────────────────────
// Mounted at /competitors/[partner]/* from api-route-controller.js.

const PartnerSdk = require('[partner-npm-package]'); // only if the partner has one
const router = require('express').Router();
const config = require('../config');

// Constructed lazily — a missing/malformed secret key must never throw at
// require() time, or it crashes the ENTIRE Lambda (every partner's routes,
// not just this one) since this file is required unconditionally at cold
// start. This exact bug took down the whole app during Stripe's build.
let _client = null;
function client() {
    if (!_client) {
        if (!config.[partner]SecretKey) {
            throw Object.assign(new Error('[PARTNER]_SECRET_KEY is not set on this Lambda'), { statusCode: 500 });
        }
        _client = new PartnerSdk(config.[partner]SecretKey, { /* ... */ });
    }
    return _client;
}

function log(level, route, message, data = {}) {
    console.log(JSON.stringify({ level, route, message, partner: '[partner]', timestamp: new Date().toISOString(), ...data }));
}

const webhookEventStore = new Map(); // same 2-minute poll-then-delete pattern as every other partner

router.get('/config', (_req, res) => {
    res.json({ publishableKey: config.[partner]PublishableKey }); // only if the frontend SDK needs one
});

// One router.post/get per mode selected in Step 3 — write these only after
// re-verifying the exact current parameter names per mode against live
// docs/MCP, even if Step 2 already looked them up once.

router.post('/webhook', (req, res) => {
    // Signature verification — check whether config.[partner]WebhookSecret
    // pattern matches Stripe's req.rawBody capture, or needs something else
    // entirely (some partners use a shared HMAC header instead).
});

router.get('/webhook-event', (req, res) => {
    // Identical to every other partner's poll-then-delete implementation.
});

module.exports = router;
```

Then mount it:
```js
// In api-route-controller.js, near the existing Stripe mount line:
router.use('/competitors/[partner]', require('./competitors/[partner]-routes'));
```

**Before writing any route body**, re-check the exact current request/response shape for that specific endpoint via MCP or docs — do this per-route, not once for the whole file, since partner APIs (like Stripe's) can rename fields between what you researched in Step 2 and what actually ships.

---

## STEP 6 — SDK delivery for Lambda (if the partner has a server-side npm package)

**Never** copy a package folder alone out of an existing local `node_modules` — it misses transitive dependencies (this broke Stripe's first deploy: `qs` wasn't included, causing every route in the Lambda to 502, not just the new partner's). Always build the Layer from a clean install:

```bash
rm -rf /tmp/[partner]-layer /tmp/[partner]-layer.zip
mkdir -p /tmp/[partner]-layer/nodejs
cd /tmp/[partner]-layer/nodejs
npm init -y >/dev/null 2>&1
npm install [partner-npm-package]@[version] --no-audit --no-fund --silent
rm -f package.json package-lock.json
cd /tmp/[partner]-layer
zip -r -q /tmp/[partner]-layer.zip nodejs
```

Verify before handing it to the user: `unzip -l` should show the package's own dependencies nested alongside it, not just the package's own folder.

Tell the developer:
```
1. Lambda → Layers → create a new layer (or new version of an existing shared layer) → upload /tmp/[partner]-layer.zip
2. Attach it to flowDemoLambdaSyed under matching Node.js runtime compatibility
3. Paste the 3-4 code changes from Step 5 into the Lambda console (app.js if raw-body capture needs adding, config.js, api-route-controller.js, the new [partner]-routes.js)
```

---

## STEP 7 — Build the frontend

### 7a. Enable the partner in the shell

In `frontend/tabs/competitors/index.html`, change the partner's `wallet-option` from `disabled` (with `title="Coming soon"`) to enabled, and add its panel div if not already present:
```html
<div id="partner-panel-[partner]" class="partner-panel" style="display:none;"></div>
```

In `frontend/tabs/loader.js`, add the injection line (after `partner-panel-stripe`'s):
```js
document.getElementById('partner-panel-[partner]').innerHTML = loadSync('tabs/competitors/[partner].html');
```

### 7b. Tab HTML — `frontend/tabs/competitors/[partner].html`

Mirror `stripe.html`'s structure: a `#[partner]-mode-selector` (`wallet-selector` of `wallet-option`s, one per mode from Step 3, all others `disabled` with `title="Coming soon"` if the partner supports them but they weren't selected this round), one `#[partner]-mode-panel-[mode]` div per selected mode, then the shared Refund/Actions section and Webhooks log section at the bottom — reuse the exact same layout, classes (`context-area`, `section-header`, `inline-form`, `form-group`, `text-input`, `select-input`, `main-button`, `wallet-selector`/`wallet-option`), and status-banner pattern (`setStatus(el, type, text)`, already global from `payment-setup.js`).

### 7c. JS module — `frontend/modules/competitors/[partner].js`

Mirror `stripe.js`: one `STRIPE_BASE()`-style base-URL helper renamed for this partner, mode-panel switching wired in the `DOMContentLoaded` block (`stripe-mode-selector` pattern), one function per mode's create/submit flow, shared `renderActionButtons`/`doAction` for the Refund/Actions panel, and webhook polling matching the existing 2-minute pattern. Every fetch call — client SDK call or backend call — goes through `addToApiLog` so it shows in the same API sidebar as every other partner.

### 7d. Success/failure page integration (only if any mode redirects/navigates away)

If ANY selected mode causes a full-page navigation on completion (hosted redirect, embedded `onComplete`, Elements-mode `confirm()`, a required 3DS redirect), build `frontend/modules/competitors/[partner]-shared.js` mirroring `stripe-shared.js`: detect the partner's own return query-param shape, fetch the resulting payment status, and render into the **same** `#payment-details-response` / `#action-buttons` / `#webhook-status` elements every other partner (and Checkout.com) already uses — never invent new result-page elements per partner. Then wire the branch into `success.html`/`failure.html`'s existing `DOMContentLoaded` handlers, same as Stripe's.

### 7e. Script tags and dropdowns

In `frontend/index.html`, add the partner's client SDK script tag — **verify the exact current script URL/version from Step 2's research, don't assume a generic `/v3/`-style URL is current** (Stripe's generic bundle didn't include a feature this session needed; the partner may have the same trap). Add module script tags for `[partner].js` and `[partner]-shared.js` (if built), after the existing competitor modules.

In `frontend/script.js`, add currency/country dropdown population for every new select element, and add a `window.stop[Partner]WebhookPolling` guard to the `openTab()` tab-switch handler, mirroring Stripe's.

---

## STEP 8 — API Gateway + secrets checklist

Present this exact checklist, filled in with the real routes/vars from this run:

```
API GATEWAY — add these routes (Lambda proxy integration → flowDemoLambdaSyed, deploy to staging):
  [METHOD] /competitors/[partner]/[route]
  ...

LAMBDA ENV VARS — set these in the Lambda console (NOT just .env — Lambda doesn't read the local .env file):
  [PARTNER]_SECRET_KEY
  [PARTNER]_PUBLISHABLE_KEY   (if applicable)
  [PARTNER]_WEBHOOK_SECRET    (if applicable)

WEBHOOK ENDPOINT — register in the [Partner] dashboard:
  https://[api-gateway-base]/staging/competitors/[partner]/webhook

SECURITY CHECK — before any git commit of amplify/, confirm none of these new files embed a real
secret value (this app's team-provider-info.json and an Apple Pay certificate were both found to
contain live secrets mid-project — check every new/modified file under amplify/ for plaintext
sk_/rk_-style values or private key blocks before staging).
```

---

## STEP 9 — Post-build report

```
DONE — [Partner] scaffolded with modes: [list].

✅ Backend routes: [list, e.g. POST /competitors/adyen/payments, GET /competitors/adyen/payments/:id, ...]
✅ Frontend: partner enabled in selector, [N] mode panels, [webhook/no webhook] integration
✅ Shared success/failure page routing: [yes/no, and why]

PENDING MANUAL STEPS:
[ ] Add routes to API Gateway (Step 8)
[ ] Set Lambda env vars (Step 8)
[ ] Attach SDK Lambda Layer (Step 6, if applicable)
[ ] Register webhook endpoint in partner dashboard
[ ] End-to-end test each mode with the partner's sandbox test cards/credentials

NOT YET BUILT (available for a future /add-partner or manual follow-up):
[List any modes discovered in Step 2 but not selected in Step 3, so nothing discovered gets silently lost.]
```
