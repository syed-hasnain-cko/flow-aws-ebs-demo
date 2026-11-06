# Security notes

## Audit (2026-11-06) — what was found, what was fixed, what is still open

Method: code review + live API checks (values were never printed, only prefixes/lengths) + git history. AWS-side checks (API Gateway
throttling/WAF, Amplify response headers, Lambda role contents, Lambda env var names) were NOT completed — the AWS session expired mid-audit.

### Fixed — Forward API credentials (2026-11-06)
- **Was**: unauthenticated `GET /forward-config` returned the Checkout.com sandbox secret key, the Stripe test key and the Adyen key in clear
  (`secretKey`, `stripeApiKey`, `adyenApiKey`); the Forward tab copied them into its fields and `localStorage['cko-forward-config']`.
  `GET /forward-customer-instruments` and `GET /forward-request` took `overrideSecretKey` in the URL.
- **Now**
  - `/forward-config` never returns a secret: `secretKey/stripeApiKey/adyenApiKey` are `''` (so a stale cached page sends no override and the
    server default is used) and `defaults.<key> = { set, masked (prefix + last 4), source }` tells the UI what is configured.
  - The server resolves the Forward credentials per request (`forwardCreds()` in `api-route-controller.js`): a key typed into the Forward
    panel (request BODY) → the visitor's **Settings** account (sealed token; secret key, public key, processing channel) → the server's
    `FORWARD_*` defaults. `/forward-request`, `/forward-customer-instruments`, `/forward-request?id=` and the Forward tokenizer
    (`/payment-sessions` + `useForwardCreds`) use it, and now call the visitor's gateway base URL (`accountConfig.gwUrl()`), so a prefixed account works.
  - The built-in destinations send a placeholder instead of a key: `{{server.secret_key}}`, `{{server.stripe_api_key}}`,
    `{{server.adyen_api_key}}` in `destination_request.headers.raw`. The server swaps it for the default **only if the destination host is that
    provider's own host over https** (`api[.sandbox].checkout.com`, `api.stripe.com`, `*.adyen.com`); otherwise 400 and nothing is forwarded —
    so the open endpoint cannot be used to send a default key somewhere else.
  - A key in a URL is refused (`GET …?overrideSecretKey=` → 400 "reload the page"); `/forward-customer-instruments` also accepts POST with the key in the body.
  - Browser: secret fields start empty with a masked-default hint; typed keys are kept for the **tab only** (sessionStorage) unless
    "Remember on this device" is ticked (then localStorage, as before). Existing users keep what they saved (remember is switched on for them);
    an old saved copy of a *server default* key (recognised by prefix + last 4) is scrubbed.
  - Tests (scratchpad, not in the repo): real route code with a stubbed HTTP layer and fake keys — no default key in any response, placeholder refused for
    evil/look-alike/http/wrong-provider hosts, own key wins, Settings account used by every Forward call; stub-DOM tests of the Forward tab storage and requests.

### Open (not changed yet)
1. **No authentication on the API** (API Gateway authorization NONE, CORS `*`). `POST /standalone/vault` (allowlisted proxy) can search all payments,
   capture/void/refund/cancel, create/delete webhook workflows and edit/delete vault customers/instruments; `/payments`, `/payouts` etc. are open.
   Options: SSO/shared team token (authorizer), WAF rate limit/IP allow-list.
2. **Public GitHub repo** `syed-hasnain-cko/flow-aws-ebs-demo`: three old commits (`e0d9f13`, `cc06905`, `7c52e5c`) contain a real-looking sandbox
   secret key — verified equal to the key the live Lambda uses; `ngrokToken` appears in older commits. Decision 2026-11-06: owner considers the keys
   not compromised and the repo unused, so no rotation / history rewrite / privacy change was made.
3. `POST /webhook` skips the secret check while a custom account is active in the container (events then land in the shared store).
4. `npm audit --omit=dev`: root 21 (3 critical, 13 high), Lambda 8 (1 critical, 5 high) — reachability not triaged.
5. Older modules build HTML with `innerHTML` and no `esc()` (payment-setup, forward, disputes, wallets-flow, auth-types, payouts) — no exploit confirmed.
6. Apple/Google Pay tokenization payloads are written to the Lambda logs (`api-route-controller.js` "Google Pay tokenization outcome" / "Apple Pay tokenization outcome").
7. Third-party scripts without SRI, no verified CSP / security headers on the Amplify site; secrets are plain Lambda env vars and the Lambda role has
   `SecretsManagerReadWrite` (seen 2026-11-05).


## Secrets handling (2026-11-06)

**Rule: no secret value in the repo, in the browser, or in plain Lambda environment variables.**

| Where | What lives there |
|---|---|
| AWS Secrets Manager `flowdemo/staging/app-secrets` (JSON name → value) | `SECRET_KEY`, `WEBHOOK_SECRET`, `FORWARD_SECRET_KEY`, `FORWARD_STRIPE_API_KEY`, `FORWARD_ADYEN_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `ADYEN_API_KEY`, `ADYEN_HMAC_KEY`, `CKO_ACCESS_KEY_ID/SECRET`, `CONFIG_SEAL_KEY` |
| AWS Secrets Manager (existing, unchanged) | the Apple Pay merchant certificate + private key (`APPLE_PAY_SYED_CERT_SECRET_NAME` / `…_KEY_SECRET_NAME` hold only the secret *names*) |
| Lambda environment | non-secrets only: `GW_URL`, `PROCESSING_CHANNEL_ID`, `CURRENCY_ACCOUNT_ID`, publishable/public keys, merchant account, `DOMAIN_NAME`, secret *names*, `WEBHOOK_TABLE` … |
| local `.env` (git-ignored) | developer values for local runs; also the source `secrets:sync` can store from |
| browser | public values only; a visitor's own keys stay in the tab (sessionStorage) unless "Remember on this device"; a Settings account is sealed server-side |

- **How it loads**: `src/index.js` awaits `secrets-loader.js` before `require('./app')`, so `config.js` and every `process.env.X` read keep working. A variable already in the environment wins (local `.env`, emergency override, migration period). A failed load is logged (`[secrets] could not read …`, names/counts only) and retried on the next request. The SDK (`@aws-sdk/client-secrets-manager`) comes from the Lambda runtime.
- **Tooling**: `npm run secrets:sync` (see CLAUDE.md). `lambda:env` skips secret names (listed with `policy: "secret"`, or any new name ending `_SECRET`, `_KEY`, `_TOKEN`, `_PASSWORD`, `_HMAC` except `PUBLIC`/`PUBLISHABLE`/`CLIENT_KEY`), so a release can never copy one back onto the Lambda; `release` blocks if the code needs a secret that is in neither the store nor the Lambda.
- **Adding a secret later**: read it with `process.env.NEW_THING_KEY` in code → put the value in `.env` → `npm run secrets:sync -- --add NEW_THING_KEY --apply` → release. (Rotating: change it in the provider, then `-- --overwrite NAME --apply`; the Lambda picks it up on its next cold start — or release.)
- **Logs**: the Lambda entry point used to print the WHOLE API Gateway event for every request (headers incl. `Authorization` account tokens and webhook secrets, bodies incl. keys typed in the Forward tab, card/wallet data). It now logs one line: method, path, request id. Older CloudWatch log events still contain those dumps — retention applies.
- **Deployment package**: `certificates/` (Apple Pay private key + cert, git-ignored, no code reads it) is no longer put in the Lambda zip.

### Git history
Found in the public repo's history (231 commits, 24 branches): the Checkout.com sandbox secret key (2 commits), an ngrok auth token (8 commits) and the Apple Pay sandbox merchant **private key + certificate** (5 paths, 5 commits). (Apple's `.well-known` domain-association files are public by design and stay.) A rewritten copy was produced with `git filter-repo` (secret values replaced, every `certificates/` path removed): 0 of 2 known values and 0 private-key blocks left, `main` byte-identical, other branches differ only in the scrubbed `config.js` lines and the removed `certificates/` files. Backup of the old history: `.aws-backups/pre-history-rewrite-*.bundle` (git-ignored; contains the secrets — delete it when no longer needed). Pushing the rewrite to GitHub needs `git push --force --mirror` and changes every commit id; pull requests' hidden refs and anyone's clones keep the old history until GitHub purges it (GitHub support can purge cached views).
