# 3DS · Non-hosted sessions (browser channel)

Nav: **Standalone → 🪟 3DS Non-hosted** (`frontend/tabs/nh3ds.html`, `frontend/modules/nh3ds.js`). A working reference of what a merchant's own page does for a
Standalone (Sessions) authentication with `completion.type: "non_hosted"`. **Browser channel only** — the app channel needs Checkout.com's iOS / Android 3DS SDKs and cannot run on a web page.

## The six steps (each shows its request / response and goes to the API log)
1. `POST /sessions` (non_hosted, no `channel_data` unless "Send browser data with the session" is on) → 202 `pending`, `next_actions: [collect_channel_data, issuer_fingerprint]`.
2. `GET /sessions/{id}` → next actions, `_links.three_ds_method_url`, `transaction_id`.
3. **Issuer fingerprint** (only when a 3DS Method URL exists): a hidden iframe receives a form POST of `threeDSMethodData = base64({threeDSServerTransID, threeDSMethodNotificationURL})`; the issuer's page forwards to Checkout.com's interceptor
   (`https://api.sandbox.checkout.com/sessions-interceptor/3ds-method-notification`), which `postMessage`s `{threeDSServerTransID}` to the parent. Answer within 10 s → `PUT /sessions/{id}/issuer-fingerprint {three_ds_method_completion: "Y"}`, otherwise `"N"`.
4. `PUT /sessions/{id}/collect-data` (browser object from `navigator`; IP is the documentation IP 203.0.113.10 because the browser can't know its public address) → `challenged` + `challenge_cardholder`, or a final status (frictionless).
5. **Challenge**: `creq = base64url({threeDSServerTransID, acsTransID: acs.transaction_id, messageType: "CReq", messageVersion: protocol_version, challengeWindowSize})` (no padding) POSTed as the `creq` form field to `acs.url` **inside an iframe**. The simulator's page then submits the CRes to
   `…/sessions-interceptor/challenge-notification?s=sid_…`, whose response runs `window.parent.postMessage('{"transStatus":"Y","threeDSServerTransID":"…"}')` (a JSON **string**). The tab validates `origin` (`*.checkout.com`), `event.source` (the challenge iframe) and the transaction id.
6. `POST /sessions/{id}/complete` (optional; 204, triggers `completion.callback_url` if one was set).

Backend: `POST /standalone/sessions`, `GET /standalone/session`, `PUT /standalone/session-issuer-fingerprint`, `PUT /standalone/session-collect-data`, `POST /standalone/session-complete` (OAuth `sessions:browser sessions:app`; id validated as `sid_…`). No callback route is needed — the outcome comes back to the browser as a window message.

## Verified on the sandbox (2026-11-09)
- **Order matters**: `issuer-fingerprint` must come **before** `collect-data`; afterwards it returns 403 `update_not_allowed_due_to_state`. Cards with a 3DS Method URL in the sandbox: all that were tried (`_links.three_ds_method_url` → `https://sessions-ext.cko-sbox.ckotech.co/simulator/acs/3ds-method`).
- `acs.url` is `https://` (no mixed-content problem); `protocol_version` 2.2.0.
- **The card decides the outcome, not the password** (`Checkout1!` is only the simulator hint). Challenge cards → CRes `transStatus` → final session status:
  `5385308360135181` Y → approved · `5518832400606463` A → attempted · `4243754271700719` N → declined · `5341034800000016` R → rejected · `5569757734785691` U → unavailable. Frictionless: `4485040371536584` → approved.
- A frictionless session after collect-data: `status: approved`, `next_actions: [complete]`. `complete` returns 204 even without a `callback_url`.
- Cancelling the challenge sends no CRes; the session stays `challenged`.

## Presentation themes
The issuer's challenge page (password / OTP / biometric prompt) is rendered by the ACS and **cannot be restyled**. What the merchant controls — and what the themes change — is the container: layout, colours, header, loader,
iframe size and abandonment handling. Themes: Classic modal, Dark glass modal, Branded header, Bottom sheet, Side drawer, Full screen, Inline in the page. Each has a default `challengeWindowSize` (01 250×400, 02 390×400, 03 500×600, 04 600×400, 05 full screen); the size select overrides it and is what goes into the CReq.
"Preview this theme" renders the container around a mock page without creating a session; after a run, "Run again in <next theme>" replays the same card for a side-by-side comparison. The iframe uses `sandbox="allow-forms allow-scripts allow-same-origin"`.

## Pitfalls
- Re-rendering a step must not wipe the inline challenge host → the challenge step keeps its host in a sibling node (`.nh-inline-host`).
- Open `<details>` survive re-renders through the `open` set (same lesson as Smart Dunning).
- Tested with jsdom only (stubbed API and issuer messages); the real iframe round trip was probed with curl against the sandbox but not yet clicked through in a real browser.
