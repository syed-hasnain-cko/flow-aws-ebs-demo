# Release — Project Skill (backend + frontend, shipped together)

Ships **everything** that changed — API Gateway routes, the Lambda backend and the Amplify frontend — with ONE command, and only
reports success when **both halves are verifiably live**. It replaces the old frontend-only "publish-amplify-frontend-release".

How it works (all done by `npm run release`, see CLAUDE.md → "AWS deploy tooling"):
1. API Gateway: creates any route that exists in code but is not reachable.
2. Lambda environment: adds any env var the code needs that the Lambda lacks (never changes existing ones).
3. Lambda code: deploys the backend with a backup, verifies the live code hash equals the uploaded zip, smoke-tests the API.
4. Frontend: commits, merges into `main` if on a feature branch, pushes, **waits for the Amplify build of that exact commit**, checks the site and the API once more.
Backend goes first; if any backend step fails the frontend is NOT pushed.

The user must not start testing until BOTH are done — so never say "done / safe to test" unless the script printed `RELEASE COMPLETE`.

---

## STEP 1 — Commit message

If a message was passed as an argument, use it. Otherwise ask:

```
What is your commit message?
(e.g. "add Hosted Page & Links", "fix payouts layout", "AFT: add region validation")
```

## STEP 2 — Check the AWS session

Run `npm run aws:check`.
- If it prints that the session is missing/expired (or fails to find the profile), ask the user to run:
  `! aws login --profile cko-syed-testing-playground` (press Enter to accept `us-east-1`, sign in in the browser), then wait for them to confirm and re-run `npm run aws:check`.
- Do not continue until it prints ✓ for the role, Lambda, API, stage and wiring.

## STEP 3 — Dry run (always)

```bash
git branch --show-current
npm run release -- --message "<the commit message>"
```

Summarise the plan in 3–4 lines for the user: current branch (and that it will be merged into `main` if it is not `main`), uncommitted files by area,
API routes that would be created, whether the backend code differs from what is live.
Stop and ask before continuing only if: the dry run errored or says BLOCKED, it proposes creating API routes the user did not mention, or `git status` shows files that look like secrets
(`.env`, keys, certificates, `team-provider-info.json`) that are not git-ignored. Otherwise continue straight to the apply — invoking this skill is the user's request to release.

## STEP 4 — Apply

```bash
npm run release -- --message "<the commit message>" --apply
```

This can take several minutes (the Amplify build is awaited, up to 12 minutes). Run it in the background and watch its output until it exits — do not stop early and do not report in between as if it were finished.

## STEP 5 — Report (strict)

- Output contains **`RELEASE COMPLETE`** → tell the user: backend ✓ (what was done) and frontend ✓ (Amplify job, commit), **both live — safe to test; hard-refresh the browser (Cmd+Shift+R)**.
- Output contains **`RELEASE NOT COMPLETE`** (or the command exited non-zero, or timed out) → say clearly **"do not test yet"**, show which half finished and which did not, and what to do:
  - backend failed → the frontend was NOT pushed (safe); show the error. If the Lambda was already replaced and is misbehaving: `npm run lambda:rollback -- --apply`.
  - frontend build failed / not confirmed → the backend IS already live; show the Amplify error or tell the user to check the Amplify console; the backend is backward-compatible with the previous frontend unless the change was breaking — say which.
- Never summarise a partial run as success.

## Edge cases

- **Nothing to commit, backend identical** → the script says so for each step; report "nothing to release".
- **Merge conflict** when merging the feature branch into `main` → tell the user to resolve it, then re-run `/release`.
- **Push rejected** (remote has new commits) → `git pull origin main --rebase`, then re-run; tell the user before pulling.
- **Only one half wanted** → `npm run release -- --message "…" --apply --no-backend` (frontend only) or `--no-frontend` (backend only, no git).
- **Roll the backend back** → `npm run lambda:rollback -- --list`, then `-- --apply [--file <zip>]`.

## Reminders

- New backend routes no longer need manual API Gateway work: `release` creates them (routes under `/standalone`, `/competitors`, `/disputes` already work through catch-all proxies).
- **Environment variables are handled automatically** (`npm run lambda:env`): a NEW variable the code needs is added from the local `.env` — except environment-specific names (`ENV`, `*_URL`, `REGION`, `DOMAIN*`, `*_SECRET_NAME`), whose Lambda value must be put in `scripts/aws/.env.lambda` (git-ignored). If the dry run says **BLOCKED <NAME>**, tell the user exactly which name and file, wait until they add it, then re-run. Existing Lambda values are never changed unless they ask (`--overwrite NAME`, e.g. after rotating a key). The layer, memory and timeout are still not changed by a release.
- The release is pinned to Lambda `flowDemoLambdaSyed-staging`, API `zzrte604h4` stage `staging`, Amplify app `d11m29074qik0k`; nothing else is touched.
