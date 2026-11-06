# Wallet Onboarding tab (Apple Pay + Google Pay)

**Where**: nav 📲 *Wallet Onboarding* in the **Manage** group. Files: `frontend/tabs/wallet-onboarding.html`, `frontend/modules/wallet-onboarding.js`; backend `amplify/.../src/wallet-onboarding/wallet-onboarding-routes.js` mounted at `/wallet-onboarding` (a new top-level API Gateway path — `npm run release` creates it).

## What it does
| Section | Action | Checkout.com call |
|---|---|---|
| Apple Pay → Domains (Flow web) | enroll N domains, **one request per domain**, per-row result + retry failed | `POST /applepay/enrollments {domain}` → 204 |
| Apple Pay → Signing request | generate a CSR (EC `ec_v1` / RSA `rsa_v1`), download as `<merchantId>.csr` | `POST /applepay/signing-requests {protocol_version}` → `{content}` (PEM, **valid 24 h**) |
| Apple Pay → Certificate | upload the `apple_pay.cer` from Apple: the file is read in the browser (DER or PEM, no `openssl` needed), decoded by the server and **checked before sending** (merchant ID, EC/RSA vs your CSR, expiry, "payment processing" vs "merchant identity") | `POST /applepay/certificates {content}` → `{id, public_key_hash, valid_from, valid_until}` |
| Apple Pay → Activity | local log of every Apple action + per-merchant-ID status (CSR → certificate uploaded, valid until) — Apple Pay has **no read endpoints**, so this is the only "what did we onboard" view | – |
| Google Pay → Enroll | enroll an entity (`entity_id`, `email_address`, ToS must be ticked) | `POST /googlepay/enrollments` → 201 |
| Google Pay → Domains | register N domains (one request each) and show the registered list | `POST /googlepay/enrollments/{entity_id}/domain {web_domain}` → 204, `GET …/domains` |
| Google Pay → Merchants | every entity enrolled or looked up here, with live state + domains; "Look up & add" for entities already enrolled; refresh one / all; "all merchant accounts" | `GET …/state`, `GET …/domains` |

Google Pay has no "list entities" endpoint → the Merchants list is built from what was enrolled/looked up in this browser (`cko-wallet-onboarding-gpay`).

## Accounts and secrets
- **My account** (default) = the visitor's Settings account if set, else the server's own account — nothing is sent from the browser.
- **Merchants** (`+ New merchant`): name, environment (sandbox/production), optional account prefix (`https://{prefix}.api[.sandbox].checkout.com`), public key, entity ID + email (Google defaults), **secret key**. The secret key is sent once to `POST /wallet-onboarding/seal` and comes back as an opaque AES-256-GCM token (key derived from `CONFIG_SEAL_KEY` with its own label + AAD → not interchangeable with Settings tokens), valid 8 h / 24 h / 7 d. The browser keeps only the token + public values (`cko-wallet-onboarding-profiles`, marked sensitive: excluded from the Settings export). The key never appears in a response, a log or the DOM.
- "Call with" selects secret key (default) or public key. In the sandbox all three Apple endpoints and the Google endpoints accepted a secret key, a public key and OAuth (verified 2026-11-06 with empty/invalid bodies); the **docs** say Apple enrollment needs a secret key with scope `vault:apme-enrollment` and Google Pay needs `vault:gpayme-enrollment` — flagged on the tabs.
- Production: any state-changing request needs an in-page confirmation (server enforces `confirmProduction`), the URL has no `sandbox`, the environment is a red pill everywhere.

## Server rules (`/wallet-onboarding/call`)
Only the 7 allowlisted operations; server-side validation (hostnames — no scheme/path/IP, `ent_…`, email, base64 certificate, protocol); account prefix `[a-z0-9]{1,24}`; key shape must match the environment; response = `{upstream, upstream_status, cko_request_id, duration_ms, request, data, auth (masked)}` like the other tabs. Calls refused before Checkout.com (validation, expired key, missing production confirmation) are not written to the API log.

## Observed on the live API (2026-11-06, sandbox, after the first release)
- An entity that is **not enrolled** answers every Google call (`state`, `domains`, `domain`) with **HTTP 400** and `{"requestId":"0","errorType":"INVALID_REQUEST","errorCodes":["Entity not onboarded for entityId: ent_…"]}` — camelCase `errorCodes`, no `cko-request-id` header. (A malformed id such as `ent_probe000…` gets an empty 404 instead.) The UI treats both as "not enrolled": the state pill reads NOT ENROLLED, "Look up & add" refuses to add it, and the message says to enroll it first.
- Apple enroll / CSR / certificate and Google enroll accepted a secret key, a public key and an OAuth token in the sandbox (empty/invalid bodies, so nothing was created); `/applepay/enrollments` and `/googlepay/enrollments` rejected an OAuth token without the matching scope with 401.

## Still not verified against the real API (check the API log on first use)
Response bodies of a **successful** `GET …/state` and `GET …/domains` (the UI reads `state|status|enrollment_state` and `domains|web_domains|items`, or a plain array, and always shows the raw JSON); the error codes for an already-enrolled domain/entity.

## Tests (scratchpad, not in the repo)
Backend with stubbed Checkout.com + a generated Apple-style certificate (validation, credential paths, sealing/tamper/expiry, production guard, 204/422 relay, certificate inspection) and a jsdom page talking to the real routes (profile modal, bulk domains, CSR download, certificate upload with warnings, Google enroll/domains/merchants, production confirm, expired key).
