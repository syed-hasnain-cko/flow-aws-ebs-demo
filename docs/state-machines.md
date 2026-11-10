# State machines (2026-11-11)

Branch `refactor/state-machines`. The site had many *implicit* state machines — a flag, a timer handle and a few `if`s that together
mean "idle → waiting → done". This page lists them, says which are now explicit, and how to add one.

## The shared module — `frontend/modules/machine.js` (loaded right after `common.js`)

| API | What it gives |
|---|---|
| `Common.machine(name, { initial, states: { a: { EVENT: 'b' } } })` | tiny FSM: `send(evt)`, `is()`, `can()`, `subscribe()`, `bind(el, labels)`. An event that is not allowed from the current state is **ignored and counted** (never throws). |
| `Common.waitFor({ name, check, intervalMs, timeoutMs, el, text, onFound, onTimeout, onFail })` | the "wait until something happens" loop: `idle → waiting → found \| timeout \| failed \| cancelled` (any end state can START again). Ticks **never overlap**; a new wait with the same `name` cancels the old one; `check()` returning null keeps waiting, throwing retries, throwing with `.fatal = true` fails. |
| `Common.waitForWebhook(id, { name, match, … })` | `waitFor` on `GET /webhook-event?paymentId=<id>` (logs the WEBHOOK entry, 2 min default, optional `match(event)`). |
| `Common.busyStart(btns, label)` → `done()` / `Common.busy(btns, label, fn, {after})` | busy button: `idle → busy → idle`. Disables, relabels the first button, sets `aria-busy` + `data-state`; a second click while busy returns `null` (ignored). Machine `busy:<id>`. |
| `window.CkoMachines` | **for agents / tests / support:** `snapshot()` → `[{ name, state, since, ignored, history }]`, `get(name)`, `names()`. |

On screen, a machine bound to an element sets `data-machine="<name>"` and `data-state="<state>"` (+ `aria-live="polite"`), so a script or an
AI agent can wait for `[data-machine="dispute-action-wait"][data-state="found"]` instead of guessing from text.

## Inventory

| Implicit machine | Where | States (as found) | Status |
|---|---|---|---|
| Wait for the payment's webhook | auth-types, disputes (action), wallets-flow, payment-setup | idle → waiting → found / timeout / cancelled | **migrated** to `waitForWebhook` (`auth-types-action-wait`, `dispute-action-wait`, `wallet-flow-webhook-wait`, `payment-setup-ready-wait`) |
| Wait for the test dispute to appear | disputes (create) | idle → waiting (10 s, 6 min cap) → found / timeout / failed | **migrated** to `waitFor` (`dispute-creation-wait`) |
| Payout queue entries | payouts.js | pending → paid / declined / returned / expired (+ form lock while a card payout is pending) | candidate — per-entry machine, one shared timer; left as is |
| Payment watch (run) | smart-dunning.js | idle → watching → settled (20 s after a final status) / capped at 6 min / stopped | candidate — richer than `waitFor` (it keeps collecting events) |
| 3DS session poll + "paid" gate | standalone.js | session status pending → approved / declined / …; plus `consumed` flag in localStorage | candidate |
| Webhook follower | standalone.js | following ↔ paused | candidate |
| Non-hosted 3DS run | nh3ds.js | idle → creating → fingerprint → collect → challenge → complete → done / cancelled (token `S.run` guards stale runs) | already disciplined; could adopt `Common.machine` |
| Busy buttons | ~35 `btn.disabled = true … finally` sites; `runBusy()` in standalone.js | idle → busy → idle | **partly migrated** (branch `refactor/busy-machine`): standalone `runBusy` (20 call sites), AFT card check, Smart Dunning initial payment, Disputes pay & trigger. Remaining sites (payouts, payment-setup, forward, wallet-onboarding, vault…) have bespoke text/flow — migrate one at a time with `busyStart` |
| Flow card mount | standalone.js (`flowMounting`, `flowNeedsMount`) | unmounted → mounting → mounted → needs-remount (theme change) | candidate |
| Link countdown | links.js | ticking → expired | trivial; left |

## Rules for new work
- Anything that waits for a webhook or a status uses `waitFor` / `waitForWebhook`, with a unique `name` — never a new `setInterval`.
- Anything with three or more states and transitions between them gets `Common.machine`, so `CkoMachines.snapshot()` shows it.
- Keep the visible text exactly what the tab said before; only add `data-state`.

## Verified
`machine.js` unit-tested in jsdom (illegal events, found, timeout, cancel, same-name restart, fatal vs transient errors, no overlapping ticks,
webhook 404 / non-matching event / match). The five migrated modules were syntax-checked; they have **not** been clicked through in a real browser.
