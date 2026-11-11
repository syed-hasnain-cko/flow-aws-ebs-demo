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
| `m.dispose()` | removes a machine from the registry (use for per-item machines such as `payout:<id>`). |
| `window.CkoMachines` | **for agents / tests / support:** `snapshot()` → `[{ name, state, since, ignored, history }]`, `get(name)`, `names()`. |

On screen, a machine bound to an element sets `data-machine="<name>"` and `data-state="<state>"` (+ `aria-live="polite"`), so a script or an
AI agent can wait for `[data-machine="dispute-action-wait"][data-state="found"]` instead of guessing from text.

## Inventory

| Implicit machine | Where | States (as found) | Status |
|---|---|---|---|
| Wait for the payment's webhook | auth-types, disputes (action), wallets-flow, payment-setup | idle → waiting → found / timeout / cancelled | **migrated** to `waitForWebhook` (`auth-types-action-wait`, `dispute-action-wait`, `wallet-flow-webhook-wait`, `payment-setup-ready-wait`) |
| Wait for the test dispute to appear | disputes (create) | idle → waiting (10 s, 6 min cap) → found / timeout / failed | **migrated** to `waitFor` (`dispute-creation-wait`) |
| Payout queue entries | payouts.js | pending → paid / declined / returned / expired / <other webhook type> (+ form lock while a card payout is pending) | **migrated** (branch `refactor/payout-queue-machine`): one machine per entry (`payout:<id>`, readable in `CkoMachines`); the two hand-kept pending counters are gone — counts are derived from the queue, so they cannot drift. The shared 2 s timer is unchanged |
| Payment watch (run) | smart-dunning.js | idle → watching → settling (20 s grace after a final status) → ended (grace over / 6 min cap / Stop) | **migrated** (branch `refactor/dunning-watch-machine`): its own machine `smart-dunning-watch` (richer than `waitFor`: it keeps collecting events during the grace period). **Bug fixed:** a late webhook / payment response of the previous run leaked into the run now on screen (confirmed on the old code: “1 webhook received” on a fresh run); each call now checks the payment id it started with, ticks no longer overlap, and a run token drops ticks of a stopped watch. The Run button uses `Common.busyStart`. Same on-screen words |
| 3DS session poll | standalone.js | idle → waiting → found (final status) / timeout (5 min) / failed / cancelled | **migrated** (branch `refactor/3ds-session-machine`): machine `standalone-3ds-session-poll` (on `waitFor`). **Bug fixed:** a poll response that arrived after “Reset” / a new session used to be applied to the dead session (it put the old `sid_…` back); a run token now discards it. Same on-screen words |
| 3DS pay gate (Step 3) | standalone.js | none / unknown / waiting / used / ready — already a pure function `payGate()` | **exposed, rules untouched**: machine `standalone-3ds-pay-gate` + `data-state` on `#sa-pay-gate` so agents can read why Step 3 is locked |
| Webhook follower | standalone.js | idle (tab/panel hidden) ⇄ listening ⇄ paused | **migrated** (branch `refactor/webhook-follower-machine`): machine `standalone-webhook-follower` drives the `sa-wh-state` text (same words) and `data-state`; polls are now single-flight (a poll requested during one in flight runs once afterwards). Jsdom-tested against the real `standalone.js` |
| Non-hosted 3DS run | nh3ds.js | idle → creating → fingerprint → collect → challenge → complete → done / cancelled (token `S.run` guards stale runs) | already disciplined; could adopt `Common.machine` |
| Busy buttons | ~35 `btn.disabled = true … finally` sites; `runBusy()` in standalone.js | idle → busy → idle | **partly migrated** (branch `refactor/busy-machine`): standalone `runBusy` (20 call sites), AFT card check, Smart Dunning initial payment, Disputes pay & trigger. payouts card + bank submit (branch `refactor/busy-payouts-setup`; **fixes** the card submit being re-enabled right after a payout was queued as pending — the documented lock now holds). **Not migrated on purpose — Payment Setup:** its buttons are a different machine, *submit until redirect* (idle → busy → redirecting \| retry): on success the page navigates and the button must STAY disabled, and on failure it is restored with its own label (“Retry Confirmation”, “Pay”) and opacity/cursor styling, so a `try/finally` helper would re-enable it mid-redirect. If that pattern is ever needed, add `Common.submitUntilRedirect()` rather than bending `busyStart`. Remaining unmigrated: forward, wallet-onboarding, vault, aft (others), webhooks — migrate one at a time with `busyStart` |
| Flow card mount | standalone.js | stale → mounting → ready \| failed; ready → stale once used; any → mounting on a theme change | **migrated** (branch `refactor/flow-mount-machine`): machine `standalone-flow-card` replaces the two booleans `flowNeedsMount` / `flowMounting`. Jsdom-tested against the real `standalone.js` (first mount, theme-change remount, no concurrent mounts, failure + retry, no remount when switching modes) |
| Payments Explorer request lock + webhook watch | payments-explorer.js | lock: idle ⇄ busy (latest queued click runs next); watch: waiting → timeout / cancelled (reloads on every new webhook) | **migrated** (branch `refactor/explorer-machine`): machines `payments-explorer-request` (also `data-state` on `#pe-root`) and `payments-explorer-watch` (on `waitFor`, same 2.5 s / 2 min, stops when another payment is opened). This module already had a token + dedupe, so no bug was found — the gain is readable state and one less hand-written loop |
| Link countdown | links.js | ticking → expired | trivial; left |

## Rules for new work
- Anything that waits for a webhook or a status uses `waitFor` / `waitForWebhook`, with a unique `name` — never a new `setInterval`.
- Anything with three or more states and transitions between them gets `Common.machine`, so `CkoMachines.snapshot()` shows it.
- Keep the visible text exactly what the tab said before; only add `data-state`.

## Verified
`machine.js` unit-tested in jsdom (illegal events, found, timeout, cancel, same-name restart, fatal vs transient errors, no overlapping ticks,
webhook 404 / non-matching event / match). The five migrated modules were syntax-checked; they have **not** been clicked through in a real browser.
