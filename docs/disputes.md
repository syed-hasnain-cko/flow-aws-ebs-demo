# Disputes tab

> Moved verbatim from CLAUDE.md. Update this page (not CLAUDE.md) when you change this area.

## Session Summary (2026-09-30) — Disputes Testing Tab

### What Was Built

New **Disputes** tab — the whole point is that Checkout.com's sandbox doesn't let you create a dispute directly; paying with a specific amount + card expiry combination makes it generate a test dispute within a few minutes (`/developer-resources/testing/disputes-testing`). Full lifecycle: trigger payment → poll for the generated dispute → view details → Accept, or provide text-only evidence → submit (irreversible).

### New Files

| File | Purpose |
|---|---|
| `amplify/backend/function/flowDemoLambdaSyed/src/disputes/disputes-routes.js` | All dispute backend routes — mirrors the `competitors/stripe-routes.js` per-feature-file pattern, mounted via `router.use('/disputes', ...)` |
| `frontend/tabs/disputes.html` | Scenario picker (4 core + 6 expandable extended scenarios), raw-card trigger-payment form, dispute detail panel, text-evidence form, recent-disputes browser |
| `frontend/modules/disputes.js` | All wiring — scenario-row click-to-fill, payment trigger, dispute polling, accept/evidence/submit actions |

### Files Modified

| File | Change |
|---|---|
| `frontend/modules/data.js` | Added `DISPUTE_TEST_CARDS` (Visa/Mastercard/Amex base test cards), `DISPUTE_EXPIRY` (01/2099, required for scenario matching), `DISPUTE_TEST_SCENARIOS.core`/`.extended` (full CKO-documented amount→status matrix, GBP only) |
| `amplify/backend/function/flowDemoLambdaSyed/src/api-route-controller.js` | Mounted `router.use('/disputes', require('./disputes/disputes-routes'))` |
| `frontend/tabs/main.html`, `frontend/tabs/loader.js`, `frontend/index.html` | Added Disputes tab button/div, HTML injection, and `modules/disputes.js` script tag — same 3-file pattern as every other tab |

### Key Design Decisions (from user Q&A this session)

- **Raw card form, not Flow tokenization** — the dispute-triggering amount+expiry combo has to be exact (e.g. Visa `4242424242424242`, exp `01/2099`, amount `1040` → `evidence_required`), and Flow doesn't let you force an arbitrary expiry. New `POST /disputes/create-test-payment` route accepts `source.type: card` directly — acceptable here since these are fixed public sandbox test cards, not real PCI data.
- **Text-only evidence for now** — `PUT /disputes/{id}/evidence`'s `*_text` fields are documented as valid standalone (a description or an external link), so file upload (`POST /files`, binary proxy) was deliberately deferred rather than half-built.
- **Core 4 scenarios shown by default** (`evidence_required`, `won`, `lost`, `canceled`), extended 6 (`resolved_refund_processed`, `resolved_outside_process`, `evidence_under_review`, `arbitration_under_review/won/lost`) behind a "Show more" toggle.
- **GBP only** — matches CKO's documented scenario table exactly; other currencies (e.g. BHD) need different amount formatting and weren't worth the reliability risk.

### Key Patterns Established

- **Dispute polling**: `GET /disputes?payment_id={id}&limit=1` every 10s for up to 6 minutes after the trigger payment succeeds (docs say ~5 min) — same "poll after an action, cap the wait" shape as webhook polling elsewhere in this app, just a different endpoint.
- **Scenario data lives in `data.js`, not `disputes.js`** — `DISPUTE_TEST_SCENARIOS`/`DISPUTE_TEST_CARDS`/`DISPUTE_EXPIRY` are plain data, rendered generically by `renderScenarioGroups()`. Adding a new scenario or card later is a data-only change.
- **Evidence submission is two explicit steps in the UI** (Save, then Submit) with a native `confirm()` gate on Submit — mirrors the API's own two-step design (`PUT` to attach, `POST` to finalize) and makes the irreversibility visible rather than hidden behind one button.

### Prerequisite — Not Yet Verified

- [ ] The sandbox secret key needs the `disputes`, `disputes:view`, and `disputes:provide-evidence` scopes. If any dispute route 401s, this is the first thing to check (Dashboard → API keys → scopes).

### Pending Manual Steps

- [ ] Deploy the Lambda zip (new `disputes/` folder + `api-route-controller.js` mount)
- [ ] Add these routes in AWS API Gateway → Lambda proxy → `flowDemoLambdaSyed`: `POST /disputes/create-test-payment`, `GET /disputes`, `GET /disputes/{id}`, `POST /disputes/{id}/accept`, `PUT /disputes/{id}/evidence`, `GET /disputes/{id}/evidence`, `POST /disputes/{id}/evidence/submit`
- [ ] End-to-end test: trigger the `evidence_required` Visa scenario, confirm a dispute appears within ~5 minutes, save + submit text evidence, confirm status changes

### Resume Here Next Session

Not yet merged to `main` — on branch `feature/disputes-testing-tab`, awaiting user testing per this session's established "test before commit" workflow. If file-upload evidence support is wanted later, it needs `POST /files` (multipart binary proxy — check Lambda/API Gateway payload size limits first) before `PUT /disputes/{id}/evidence` can reference a `file_id`.
