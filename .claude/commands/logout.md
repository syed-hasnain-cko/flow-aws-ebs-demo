# Logging Off the Day — Project Skill

You are a senior engineer wrapping up a coding session inside this Checkout.com demo app. When this skill is invoked, execute every step below **in order** without asking questions. The goal is to leave a complete, token-efficient breadcrumb in `CLAUDE.md` so the next session can resume instantly with zero re-orientation.

---

## STEP 1 — Compact the conversation

Run `/compact` to compress the full conversation into a structured summary. The compacted summary will be available in the session context. Do not skip this — it is the source of truth for everything that follows.

---

## STEP 2 — Extract the session delta

From the compacted summary, extract only the **new information from this session** — things that were not already in `CLAUDE.md` before today. Specifically identify:

1. **New files created** — file path + one-line purpose
2. **Files modified** — file path + what changed (not how, just what)
3. **New patterns established** — reusable decisions (layout conventions, API quirks, naming rules) that should influence future work
4. **Bugs found and fixed** — symptom, root cause, fix location
5. **Key design decisions** — architectural or UX choices made this session and the reasoning
6. **Pending manual steps** — anything the user must do outside the codebase (AWS console, env vars, API Gateway, etc.)
7. **Unfinished work / next session starting point** — exact description of where to resume, including file and function name if applicable

Skip anything already documented in `CLAUDE.md`. Do not repeat architecture overviews, existing file descriptions, or previously recorded sessions.

---

## STEP 3 — Write a new session summary block into CLAUDE.md

Read `CLAUDE.md` first. Then **append** a new section at the bottom using this exact format:

```markdown
---

## Session Summary (YYYY-MM-DD) — [2-5 word topic label]

### What Was Built / Changed

[1-3 bullet points. Each bullet = one completed thing. Be specific: name files, functions, API endpoints.]

### New Files Created

| File | Purpose |
|---|---|
| `path/to/file.ext` | One sentence |

*(Omit this table if no new files were created.)*

### Files Modified

| File | Change |
|---|---|
| `path/to/file.ext` | What changed |

*(Omit if no modifications.)*

### Key Patterns Established

[Bullet list. Only patterns that should influence future code. Each bullet answers: "next time I do X, remember Y." Skip if none.]*

### Bugs Fixed

[Bullet list: symptom → root cause → fix location. Skip if none.]

### Pending Manual Steps

- [ ] [Step 1]
- [ ] [Step 2]

*(Omit if nothing is pending.)*

### Resume Here Next Session

[1-3 sentences. Exact file(s) and function(s) to open. What to do first. What the user was in the middle of. Be specific enough that a cold start takes under 30 seconds.]
```

Rules for writing this block:
- Use today's date (`currentDate` from context = 2026-04-02 or later)
- Keep each cell/bullet as short as possible — a future session needs to scan this in seconds, not read an essay
- Do not duplicate content from earlier session summaries already in `CLAUDE.md`
- Do not add content that can be derived by reading the code (e.g. "function X accepts parameter Y")
- If this session had no meaningful code changes (e.g. only discussion), write a one-liner: `### No code changes — [what was discussed]`

---

## STEP 4 — Update the environment variables block (if new vars were added)

If any new environment variables were introduced this session, add them to the `.env` block in the `## Architecture` section of `CLAUDE.md`. Format:

```
NEW_VAR_NAME          # What it is and where to get the value
```

---

## STEP 5 — Update the API Endpoints list (if new routes were added)

If new backend routes were added to `api-route-controller.js` this session, append them to the `### API Endpoints` list in `CLAUDE.md`. Format:

```
- `METHOD /route-name` — one-line description
```

---

## STEP 6 — Prune stale "Pending Manual Steps" from earlier sessions

Scan all previous session summaries in `CLAUDE.md` for `- [ ]` checkboxes. For each one:
- If the step has been completed this session (e.g. a route was added to API Gateway, an env var was set), replace `- [ ]` with `- [x]` and append ` *(done YYYY-MM-DD)*`
- If the step is still outstanding, leave it unchanged

---

## STEP 7 — Report back to the user

Output this confirmation message (fill in the blanks):

```
Session logged. Here is what was recorded in CLAUDE.md:

SUMMARY BLOCK: "Session Summary (DATE) — TOPIC"

FILES DOCUMENTED:
  Created : [N] new files
  Modified: [N] files

PENDING STEPS REMAINING:
  [list any unchecked boxes still open, or "None — all clear"]

RESUME POINT:
  [paste the "Resume Here Next Session" text verbatim]

Safe to close. See you tomorrow.
```

---

## Token Optimisation Tips (applied automatically when this skill runs)

The following practices keep future sessions lean and fast:

- **Compact early and often** — `/compact` mid-session before context fills up, not just at end of day. Each compaction reduces token cost of the remaining session.
- **CLAUDE.md as the ground truth** — The session summary replaces the need to re-read large files to reestablish context. Future sessions should read `CLAUDE.md` first, then only read specific files mentioned in "Resume Here".
- **Avoid re-researching APIs** — If an MCP API lookup was done this session, record the key schema facts (field names, required fields, enum values) in the session summary so next session skips the MCP call.
- **No duplicate content** — Each session summary records only the delta. Earlier summaries are not repeated or paraphrased.
- **Exact resume pointer** — A precise "open file X, function Y, do Z" costs ~10 tokens to read and saves 5+ minutes of re-orientation.
