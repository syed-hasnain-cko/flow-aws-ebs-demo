# Wallets (Apple Pay / Google Pay / Flow tokenize)

> Moved verbatim from CLAUDE.md. Update this page (not CLAUDE.md) when you change this area.

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
