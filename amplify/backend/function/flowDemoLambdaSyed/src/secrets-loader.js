'use strict';
// =============================================================================
// App secrets loader
// Secret values (API keys, webhook secrets, the sealing key …) live in ONE AWS Secrets Manager secret — not in plain Lambda
// environment variables (visible to anyone who can read the function configuration) and not in the repo. At cold start this loads
// that secret and copies each value into process.env, BEFORE the app (config.js etc.) is required, so the rest of the code keeps
// reading its settings from the environment unchanged.
//   - Only on Lambda (or when APP_SECRETS_ID is set). Locally the .env file is used as before.
//   - A variable that is already set in the environment wins (local override / emergency override / migration period).
//   - Values are never logged — only counts. A failure is logged and reported to the caller, which may retry on the next request.
//   - The AWS SDK v3 client comes from the Node.js Lambda runtime (not bundled).
// The secret is a JSON object { "SECRET_KEY": "…", "FORWARD_STRIPE_API_KEY": "…", … }. Managed by `npm run secrets:sync`.
// =============================================================================
const DEFAULT_SECRET_ID = 'flowdemo/staging/app-secrets';
const TIMEOUT_MS = 5000;

let sdkOverride = null;          // tests only

async function load() {
    const id = process.env.APP_SECRETS_ID || (process.env.AWS_LAMBDA_FUNCTION_NAME ? DEFAULT_SECRET_ID : '');
    if (!id) return { skipped: true, reason: 'not running on Lambda — using the local .env' };
    let sdk = sdkOverride;
    if (!sdk) {
        try { sdk = require('@aws-sdk/client-secrets-manager'); }
        catch (e) { console.log(`[secrets] AWS SDK not available (${e.message}) — using the environment as is`); return { error: 'sdk-missing' }; }
    }
    try {
        const client = new sdk.SecretsManagerClient({ maxAttempts: 3 });
        const res = await client.send(new sdk.GetSecretValueCommand({ SecretId: id }), { abortSignal: AbortSignal.timeout(TIMEOUT_MS) });
        const values = JSON.parse(res.SecretString || '{}');
        let applied = 0, already = 0;
        for (const [name, value] of Object.entries(values)) {
            if (typeof value !== 'string' || !/^[A-Za-z][A-Za-z0-9_]*$/.test(name)) continue;
            if (process.env[name] === undefined) { process.env[name] = value; applied++; } else already++;
        }
        console.log(`[secrets] ${id}: ${applied} value(s) loaded, ${already} already set in the environment`);
        return { applied, already };
    } catch (e) {
        console.log(`[secrets] could not read ${id}: ${e.name || 'error'} — ${String(e.message || e).slice(0, 140)}`);
        return { error: e.name || 'error' };
    }
}

module.exports = { load, DEFAULT_SECRET_ID, _test: { setSdk: (m) => { sdkOverride = m; } } };
