# Start of Day — Project Skill

You are resuming a coding session inside this Checkout.com demo app (Syed's Testing Suite). When this skill is invoked, execute every step below **in order and silently** — no questions, no confirmations. The goal is to build a complete, accurate mental model of where the project stands in under 60 seconds of tool calls, then deliver a tight briefing so the user can give the next task immediately.

---

## STEP 1 — Read CLAUDE.md

Read the full `CLAUDE.md` file. This is the primary source of truth. Pay attention to:
- The **most recent Session Summary** block (last one at the bottom) — this is the resume point
- All `- [ ]` pending manual steps across ALL session summaries — these may still be outstanding
- The Architecture section — understand the deployment model, key files, and env vars before touching any code

Do not read any other file yet.

---

## STEP 2 — Check git state (3 commands, run in parallel)

Run all three simultaneously:

1. `git log --oneline -10` — last 10 commits; confirms what was actually shipped vs what was planned
2. `git status` — any uncommitted or staged changes left over from yesterday
3. `git stash list` — any stashed work the user may have forgotten about

Cross-reference the git log against the latest Session Summary in CLAUDE.md:
- If commits match what was documented → state is clean
- If there are uncommitted changes → flag them prominently in the briefing
- If git log shows commits NOT in CLAUDE.md → note the gap (session summary may be incomplete)

---

## STEP 3 — Scan for pending manual steps

From CLAUDE.md, collect every unchecked `- [ ]` item across all session summaries. These are things that require action outside the codebase (AWS console, env vars, API Gateway routes, deployments). They block production testing and are easy to forget.

---

## STEP 4 — Read only the files mentioned in "Resume Here Next Session"

Do NOT do a broad codebase scan. Only read the specific file(s) named in the latest "Resume Here Next Session" section of CLAUDE.md. Read just enough to confirm the current state matches what was documented (e.g. check if a function exists, a route is present, a field was added). This keeps token cost low.

If "Resume Here Next Session" names no specific files, skip this step entirely.

---

## STEP 5 — Deliver the morning briefing

Output a structured briefing in this exact format — keep it short and scannable:

```
GOOD MORNING — HERE IS WHERE WE LEFT OFF

LAST SESSION: [date] — [topic from session summary title]

RESUME POINT:
  [paste the "Resume Here Next Session" text verbatim — this is the most important line]

GIT STATE:
  Branch  : [current branch]
  Last commit : [hash + message]
  Uncommitted : [Yes — [N] files | No — working tree clean]
  Stashed     : [Yes — [N] entries | None]

PENDING MANUAL STEPS (do these before production testing):
  [ ] [step 1 from any unchecked items in CLAUDE.md]
  [ ] [step 2]
  ...
  (or "None outstanding — all clear")

WHAT I KNOW (no file reads needed for these):
  • [1-line fact about the codebase state that will save a search, e.g. "POST /payouts route exists in api-route-controller.js but not yet added to API Gateway"]
  • [another fact — max 4 bullets. Only include things likely to come up in today's work based on the resume point]

READY. What would you like to work on?
```

Rules for the briefing:
- Never pad with filler. Every line must be actionable or directly relevant to today's work.
- If there are unchecked manual steps, put them first so the user sees them before starting to code.
- The "WHAT I KNOW" bullets are pre-loaded facts that would otherwise cost a file-read to recover. Only include facts that are likely relevant to the next task. Max 4.
- Do not summarise the whole project. The user built it — they know what it is.

---

## STEP 6 — Pre-load the right modules into context (lazy, on-demand)

Do NOT proactively read every module file. Instead, after delivering the briefing, hold this lookup table in mind so the first coding task does not need redundant orientation searches:

| If the user's next task involves... | Read this first |
|---|---|
| Card payments / Flow UI | `frontend/modules/flow.js` |
| Payment setup / APMs (PayPal, Klarna, etc.) | `frontend/modules/payment-setup-config.js`, then `frontend/modules/payment-setup.js` |
| Payouts (card or bank) | `frontend/tabs/payouts.html`, `frontend/modules/payouts.js` |
| Wallets (Apple Pay / Google Pay) | `frontend/modules/wallets.js`, `frontend/apple-pay.js`, `frontend/google-pay.js` |
| Backend routes | `amplify/backend/function/flowDemoLambdaSyed/src/api-route-controller.js` |
| Shared utilities (toast, theme, appearance) | `frontend/utils.js` |
| Adding a new tab / feature | `frontend/tabs/main.html`, `frontend/tabs/loader.js`, `frontend/script.js` |
| Currency / country dropdowns | `frontend/modules/data.js` (already in context from session summary) |
| API log sidebar | `frontend/modules/api-log.js` |
| Payment capture / void / refund | `frontend/modules/payment-actions.js` |

Only read a file when the user's task actually requires it — not before.

---

## Token Efficiency Rules (applied automatically this session)

- **CLAUDE.md first, files second** — always check CLAUDE.md before opening a source file. If the answer is there, skip the file read.
- **No shotgun Globs** — never `Glob("**/*.js")` to find something. Use Grep with a specific pattern or read the exact file from the lookup table above.
- **No re-researching known APIs** — Checkout.com API field names, required fields, and enum values used in previous sessions are already documented in CLAUDE.md session summaries. Read those before calling MCP tools.
- **Batch parallel reads** — when multiple independent files are needed, read them all in one parallel tool call, not sequentially.
- **Confirm before scanning** — if unsure which file contains something, ask the user rather than scanning 10 files speculatively.
