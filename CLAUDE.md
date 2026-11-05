# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

A Checkout.com payment integration testing suite app showcasing Flow (prebuilt UI) card payments, Google Pay, Apple Pay, and all payment methods like PayPal, Klarna tested via payment setup API and management operations (capture, void, refund) with a webhook endpoint polling for 2 mins until received. Deployed on AWS Amplify and API Gateway with a parallel Lambda/Amplify manual deployment path.

---

## Commands

```bash
npm start         # Local env runs on http://localhost:4244
```

App runs at `http://localhost:4244`.

No lint or test commands are configured.

---

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
- **`frontend/modules/common.js`** — shared helpers (`window.Common`: `$`, `val`, `esc`, `money`). Loaded before every feature module; modules do `const { $, val, esc, money } = window.Common;` instead of redefining them. Add any new cross-module helper here.
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

## Working Preferences (standing instructions)

- **Be careful not to break working features, but do NOT run full end-to-end / integration regression suites after every change.** It takes too long. Verify only what the change touches (a targeted check, or none if trivial); skip broad regression runs unless the user asks.

---

## API log conventions (2026-10-31)

- **The API log shows only the Checkout.com exchange** — what a merchant integration sends/receives: CKO request body, CKO response body, upstream status, full CKO URL. Never log this app's own wrapper (`/standalone/*` envelope fields `upstream_status` / `auth_mode` / `cko_request_id`, the `/standalone/vault` proxy payload `{method,path,body}`) and don't log calls that never reached CKO (gateway/network failures → toast only).
- `addToApiLog(method, endpoint, status, req, res, url)` — new optional 6th arg `url`; the log-detail modal shows `METHOD <full url>` (click to copy) at the top. Without `url` it falls back to a `http(s)://…` URL embedded in the endpoint label (partner calls via `withUpstream()` already include one), else the label. Entry ids are de-duplicated (two logs in the same millisecond used to overwrite each other).
- Standalone Suite: `logCko()` (standalone.js) / `request()` (vault.js) parse `env.upstream` ("POST https://…") for method + URL. Calls through existing raw routes (`/payments`, `/payment-sessions`, …) pass a best-effort `https://api.sandbox.checkout.com<path>` (our `/card-metadata` → `/metadata/card`, `/get-payment-details` → `/payments/{id}`). Webhook entries log the CKO event shape `{id,type,created_on,data}`.
- Other (older) tabs still log without a URL; pass a 6th arg there when touching them.

---

## AWS deploy tooling (2026-11-02) — one command to ship backend + frontend

### How we are connected to AWS (read this when a deploy needs AWS)
- **No access keys, ever** (the owner is not allowed to have them). The `aws` CLI is used with a **login profile `cko-syed-testing-playground`** (region `us-east-1`, role `cko_playground_engineer`, CKO "Gen 3" playground account). Profile name lives in `scripts/aws/config.json` (`$AWS_PROFILE` overrides). Account numbers are masked in all script output.
- **If the session is missing/expired** the scripts say so. Ask the owner to run (with the `!` prefix in the chat, or in their own terminal):
  `aws login --profile cko-syed-testing-playground` → press Enter to accept `us-east-1` → sign in in the browser tab that opens. Then run `npm run aws:check` to confirm. Needs AWS CLI ≥ 2.32 (installed: 2.39.3, from the official pkg — `brew upgrade awscli` does NOT update it; use `https://awscli.amazonaws.com/AWSCLIV2.pkg` + `sudo installer -pkg … -target /`, which the owner must run). The older flow is `aws sso login --profile …`.
- **Pinned resources** (hard-coded in `scripts/aws/lib.js`; no flag can change them; the scripts also refuse to run unless signed in as `cko_playground_engineer`): Lambda **`flowDemoLambdaSyed-staging`**, REST API `flowDemoAPIGatewaySyed` = **`zzrte604h4`**, stage **`staging`**, Amplify app `flow-syed-demo` = **`d11m29074qik0k`** (branch `main`, auto-build on push). `d2ave4x7yz6z7` in the team how-to is an example app, not ours.
- The role is `Allow *` on all resources except Lambda `Thanos`.

### Commands (root `package.json`)
| Command | What it does | Changes AWS? |
|---|---|---|
| **`npm run release -- --message "…"`** (slash command **`/release`**, which replaces the old frontend-only `/publish-amplify-frontend-release`) | **THE one command.** Dry run by default; `--apply` does: (0) pre-flight: block if a required env var has no value anywhere → (1) `api:sync` (create unreachable routes) → (2) `lambda:env` (add missing Lambda env vars) → (3) `lambda:deploy` (backup, upload, hash check, smoke test) → (3) frontend: commit, merge into `main` if on a feature branch, `git push origin main`, wait for the Amplify build of that commit, check the site. Backend first; if a backend step fails the frontend is NOT pushed. It ends with a banner: **`RELEASE COMPLETE — backend and frontend are both live. Safe to test now.`** or **`RELEASE NOT COMPLETE — do NOT start testing yet.`** (exit code 1) listing which half finished — only trust the first one. `--no-backend` / `--no-frontend` for one half | only with `--apply` |
| `npm run aws:check` | signed-in role, Lambda/API/stage reachable, API→Lambda wiring | no |
| `npm run aws:verify` | read-only checks. **`-- --apply`** = full self-test with auto-cleanup: Lambda deploy → live hash == uploaded zip → rollback → live hash == original → re-deploy; throwaway route `/__synctest` → OPTIONS 200 + CORS, GET reaches Express (404 html, not API-Gateway 403) → deleted → 403 again. `--skip-lambda` / `--skip-api` run one half | only with `--apply` (restores itself) |
| `npm run api:diff` / `api:routes` | routes in code vs API Gateway (exit 1 if unreachable) / rewrite `scripts/aws/routes.manifest.json` (loads the controller with stubs — no secrets/network) | no |
| `npm run api:sync` | dry-run plan; `-- --apply` creates `/<x>` (ANY → Lambda proxy + OPTIONS mock CORS) and `/<x>/{proxy+}` if nested, then deploys stage `staging`. `--simulate /path` previews; with `--apply` it is allowed only for `/__synctest…` | only with `--apply` |
| **`npm run lambda:env`** | **Lambda environment variables, automatically.** Dry run shows what the code needs vs what the Lambda has; `-- --apply` (and every `release`) adds MISSING variables. Rules: the code is scanned for `process.env.X` (a variable is *required* unless every use has a `||`/`??` fallback); **existing Lambda values are never changed** (Lambda is the source of truth — `-- --overwrite A,B` replaces named ones, e.g. a rotated key; drift vs local is only reported); a new variable's value comes from `scripts/aws/.env.lambda` (git-ignored, Lambda-only values) → `env.manifest.json` literal → your local `.env`, **but never from `.env` for environment-specific names** (`ENV`, `*_URL`, `REGION`, `DOMAIN*`, `*_SECRET_NAME`, or policy `ask`); a required variable with no value anywhere **blocks the release before anything changes** (it tells you which name and where to put the value); the existing set is read, merged (the API replaces the whole set), size-checked against the 4096-byte limit, backed up to `.aws-backups/env-*.json` (0600) and re-read to verify; values are never printed or put on a command line. `-- --restore <env-backup.json> --apply` undoes it. New variables are recorded (name + policy only) in `env.manifest.json` | only with `--apply` |
| `npm run lambda:build` / `lambda:deploy` / `lambda:rollback` | clean zip → `.aws-build/` (src incl. `node_modules` + `certificates`, minus `__MACOSX`, `.DS_Store`, `event.json`); deploy (dry run lists files that differ from the deployed package; `--apply` backs up to `.aws-backups/`, uploads with `--revision-id`, waits, **asserts the live `CodeSha256` equals the zip**, smoke-tests `/config` + `/standalone/config`); rollback (`--list`, `--apply [--file]`) | only with `--apply` |

### Facts about the live setup
Every API Gateway method is `ANY` + Lambda `AWS_PROXY`, authorization NONE, CORS via mock `OPTIONS`; `/standalone`, `/competitors`, `/disputes` have catch-all `{proxy+}` children so new routes under those prefixes need no gateway work; the Lambda's invoke permission already covers the whole API (`zzrte604h4/*/*/*`); deploys replace **only the code** (env vars, layer, memory, timeout untouched); the API edge is CloudFront, which **caches 403s** — probe with a unique `?cb=` query when testing new routes. `.aws-build/` and `.aws-backups/` are git-ignored (backups contain certificates).

### Verified 2026-11-02 (real runs against staging)
Lambda environment round trip (real): temp variable added, 24 existing untouched, API ok, restored identical ✓ (also found: Lambda names must start with a letter — now validated up front). Lambda round trip: deploy hash ✓, backup exact copy ✓, rollback hash == original ✓, re-deploy reproducible ✓, smoke tests ✓. API Gateway throwaway route: created ✓ GET→Express ✓ OPTIONS+CORS ✓ cleaned ✓. Staging Lambda now runs the clean 4.5 MB build (same source as before; a backup of the original Finder-zipped package is in `.aws-backups/`). `npm run release` was dry-run only — the first `--apply` happens when this branch is merged.

---

## Feature notes live in `docs/`

Per-feature history, design decisions, verified sandbox facts and pitfalls were moved verbatim out of this file. **Read the matching page before changing that area, and add new notes there (not here).** Keep this file for architecture, standing rules, API-log conventions and deploy tooling.

| Page | Covers |
|---|---|
| [`docs/history-core.md`](docs/history-core.md) | Core architecture history (April 2026) |
| [`docs/payouts.md`](docs/payouts.md) | Payouts tab (card + bank) |
| [`docs/payment-setup.md`](docs/payment-setup.md) | Payment Setup tab + API log persistence |
| [`docs/competitors.md`](docs/competitors.md) | Competitor Testing (Stripe / Adyen) + theming |
| [`docs/wallets.md`](docs/wallets.md) | Wallets (Apple Pay / Google Pay / Flow tokenize) |
| [`docs/disputes.md`](docs/disputes.md) | Disputes tab |
| [`docs/auth-types.md`](docs/auth-types.md) | Authorization Types tab + AFT |
| [`docs/standalone-suite.md`](docs/standalone-suite.md) | Standalone Suite (3DS, Network Tokens, RTAU, Vault) |
| [`docs/payments-links-flow.md`](docs/payments-links-flow.md) | Payments Explorer, Hosted Page & Links, Checkout Flow options |
| [`docs/smart-dunning.md`](docs/smart-dunning.md) | Smart Dunning tab (retry schedules, webhooks, test cards) |
| [`docs/app-shell.md`](docs/app-shell.md) | App shell: left navigation + docked API log |
| [`docs/account-and-webhooks.md`](docs/account-and-webhooks.md) | Account Settings (BYO account) + Webhooks tab |
