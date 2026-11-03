# Authorization Types tab + AFT

> Moved verbatim from CLAUDE.md. Update this page (not CLAUDE.md) when you change this area.

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

## Session Summary (2026-11-04) — Authorization Types: Account Funding Transactions (AFT)

New 5th type **Account Funding Transaction (AFT)** in the Authorization Types tab (`modules/aft.js`, hooks in `auth-types.js`, containers/styles in `tabs/auth-types.html`, data `AFT_TEST_CARDS` / `AFT_PURPOSES` in `data.js`). Other four types are untouched.

- **Flow**: pick *Scheme* (Visa / Mastercard) → *Operating region* (Europe, APAC, Canada, UAE, USA) → *Domestic / Cross-border* → *Recipient is an account | a card* → *Transaction* (one-off, recurring/unscheduled initial, recurring/unscheduled MIT). Defaults for sender/recipient are filled per scenario (and only re-applied to fields the user has not edited; "Reset to scenario defaults" forces them). Currency follows the region. Request = existing `POST /payments` with `processing.aft: true`, `sender`, `recipient`, optional `instruction.purpose`, and for recurring/unscheduled `payment_type` / `merchant_initiated` / `previous_payment_id` / `3ds.challenge_requested_mandate` / `source.stored`.
- **Requirement matrix** (`RULES` in aft.js) is transcribed from the docs page *Perform an Account Funding Transaction*: per scheme+region+category which `sender` / `recipient` fields are required, plus the conditional rules (sender `state` if US/CA; AU/NZ/South-Pacific recipient cards need `address_line1`; Canada recipients/cards need the full address; Mastercard "card" recipients need `address.country` — USA needs the full address). Unsupported: Visa & Mastercard USA cross-border, Canada cross-border (not listed). **Docs conflict**: Mastercard UAE cross-border is both listed and declared unsupported — flagged as a warning.
- **Qualification check** (live): scenario support · card vs scheme (PAN prefix, or issuer from metadata) · domestic/cross-border vs the issuer/sender/recipient countries · required fields (badges *required / conditional / optional* on every input + inline errors) · the documented **format rules** (names: Latin only, no digits/emoji/double spaces/titles/disallowed words; address lines; city/state; state ≤3; prohibited countries AF BY CU IQ IR KP LY RU SD SY VE; DOB; account number shape / PAN Luhn) · `instruction.purpose` required for Visa cards issued in AR BD CL CO EG IN MX SA · MIT needs `previous_payment_id`. "Block sending while there are errors" (default on) can be unticked to test the API's own rejections. Issuer country: test-card table, or **Check card** → `POST /card-metadata`. Prohibited countries are added to the AFT country dropdowns (the app-wide list omits them) so the rule can be tested.
- **Result diagnosis**: explains `422 aft_processor_not_matched`, `422 {sender|recipient}_{field}_invalid`, `20012`, `43102`, `20057` (AFT decline test cards) and echoes `processing.aft` / issuer country from the response.
- **Backend**: `/payments` now also forwards `sender`, `recipient`, `instruction` and `source.stored` (additive; undefined for every other caller). **Redeploy the Lambda** — no new API Gateway route.
- **Observed on the demo sandbox (2026-11-04), not docs**: Visa AFT works for GB / FR issuers (cross-border and domestic with a full sender); Visa without `processing.aft` → `43102`; Mastercard AFT → `422 aft_processor_not_matched` (not enabled for the scheme on this channel); US / CA / SG-issued cards decline `20012` even with complete data (region not enabled for AFT on this account); missing required data → `20012`; bad formats → 422 `<party>_<field>_invalid`; titles like "Mrs" were accepted by the sandbox although the docs prohibit them.
- **Scenario = full happy-flow setup (2026-11-04 update)**: clicking a scheme / region / category pill now loads, in one go, sender + recipient defaults (countries consistent with domestic / cross-border), a matching **test card** (`HAPPY_CARD` in aft.js — issuer country fits the scenario, shown with a note) and the region currency, and re-includes both parties. Only Visa · Europe (domestic + cross-border) is marked "approved on the demo sandbox"; Mastercard notes warn about `aft_processor_not_matched`; UAE notes that no UAE-issued test card is published (so the scheme sees GB-issued cards as cross-border). Editing a field afterwards is never overwritten except by choosing another scenario / "Reset to scenario defaults".
- **Include checkboxes** exist for both Sender and Recipient and are always usable. Excluding a party the scenario requires is flagged as a qualification error (blocking unless "block sending" is unticked, so the API's own rejection can be tested); optional parties can be dropped silently. A declined AFT keeps the form open (other types collapse it) so a field can be corrected and re-sent.
- The AFT form builds its own country list (shared `COUNTRIES` lacks SG, JP, CA, IN … and every prohibited country) and adds missing currencies (CAD, JPY …) to `#at-currency`.
