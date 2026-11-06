'use strict';
// The app's secret VALUES live in one AWS Secrets Manager secret (PIN.appSecretId) — not in Lambda environment variables, not in the repo.
// The Lambda loads that secret at cold start (src/secrets-loader.js). Which names are secrets is decided in scripts/aws/env.manifest.json
// (policy "secret"); names that merely LOOK like secrets (…_SECRET, …_KEY, …_TOKEN, …_PASSWORD, …_HMAC) are treated the same way.
//
//   npm run secrets:sync                              → STATUS / dry run: where each secret value is (store · Lambda env · local .env), nothing changed
//   npm run secrets:sync -- --apply                   → create/update the secret. A value already in the store is KEPT; a missing one is taken from
//                                                        scripts/aws/.env.lambda → the Lambda's current environment → the local .env
//   npm run secrets:sync -- --add NAME[,NAME] --apply → also register new secret names (manifest) and store them
//   npm run secrets:sync -- --overwrite NAME --apply  → replace a stored value (e.g. after rotating a key) from .env.lambda → .env → Lambda env
//   npm run secrets:sync -- --prune-lambda-env --apply→ remove the secret names from the Lambda's plain environment. Safety: needs the deployed code to
//                                                        contain the loader, backs the variables up (0600), runs live checks before and after, and
//                                                        RESTORES them automatically if any check that worked before now fails.
// Values are never printed or put on a command line (0600 temp files, removed). Only names and yes/no facts are shown.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const dotenv = require('dotenv');
const { execFileSync } = require('child_process');
const { aws, guard, PIN, ROOT, BACKUP_DIR, BUILD_DIR, API_BASE, stamp, log, ok, warn, fail, hasFlag, flagValue, downloadDeployed } = require('./lib');
const { currentLambdaEnv, setEnv, scanCode, looksSecret } = require('./lambda-env');

const MANIFEST = path.join(__dirname, 'env.manifest.json');
const LAMBDA_FILE = path.join(__dirname, '.env.lambda');
const h = (v) => crypto.createHash('sha256').update(String(v)).digest('hex');
const parse = (f) => (fs.existsSync(f) ? dotenv.parse(fs.readFileSync(f)) : {});
const readManifest = () => JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));

// ── which names are secrets ───────────────────────────────────────────────────────────────────────────
function secretNames({ extra = [] } = {}) {
    const m = readManifest().vars;
    const names = new Set(Object.entries(m).filter(([, v]) => v.policy === 'secret').map(([n]) => n));
    extra.forEach(n => names.add(n));
    Object.keys(scanCode()).filter(n => !m[n] && looksSecret(n)).forEach(n => names.add(n));      // new, secret-looking names read by the code
    return [...names].sort();
}

// ── the secret ───────────────────────────────────────────────────────────────────────────────────────
function readSecret() {
    try {
        const r = aws(['secretsmanager', 'get-secret-value', '--secret-id', PIN.appSecretId]);
        return { exists: true, values: JSON.parse(r.SecretString || '{}') };
    } catch (e) {
        if (/ResourceNotFound/i.test(e.message)) return { exists: false, values: {} };
        throw e;
    }
}
function writeSecret(values, exists) {
    const tmp = path.join(os.tmpdir(), `app-secrets-${process.pid}-${Date.now()}.json`);
    fs.writeFileSync(tmp, JSON.stringify(values), { mode: 0o600 });
    try {
        if (exists) aws(['secretsmanager', 'put-secret-value', '--secret-id', PIN.appSecretId, '--secret-string', `file://${tmp}`]);
        else aws(['secretsmanager', 'create-secret', '--name', PIN.appSecretId, '--description', 'Flow demo app secrets (JSON name→value). Managed by npm run secrets:sync — do not edit by hand.', '--secret-string', `file://${tmp}`]);
    } finally { fs.rmSync(tmp, { force: true }); }
}

// ── plan ─────────────────────────────────────────────────────────────────────────────────────────────
function plan({ extra = [], overwrite = [] } = {}) {
    const names = secretNames({ extra });
    const store = readSecret(), lam = currentLambdaEnv(), local = parse(path.join(ROOT, '.env')), lamFile = parse(LAMBDA_FILE);
    const src = (n, order) => { for (const [label, o] of order) if (o[n] !== undefined && o[n] !== '') return { label, value: o[n] }; return null; };
    const rows = names.map(n => {
        const inStore = store.values[n] !== undefined, onLambda = lam.vars[n] !== undefined, inLocal = local[n] !== undefined || lamFile[n] !== undefined;
        let pick = null;
        if (overwrite.includes(n)) pick = src(n, [['scripts/aws/.env.lambda', lamFile], ['local .env', local], ['Lambda environment', lam.vars]]);
        else if (!inStore) pick = src(n, [['scripts/aws/.env.lambda', lamFile], ['Lambda environment', lam.vars], ['local .env', local]]);
        const differsFromLambda = inStore && onLambda && h(store.values[n]) !== h(lam.vars[n]);
        return { name: n, inStore, onLambda, inLocal, pick, differsFromLambda, used: n in scanCode() };
    });
    return { rows, store, lam, names };
}
function printPlan(p) {
    log(`  secret: ${PIN.appSecretId} — ${p.store.exists ? `exists, ${Object.keys(p.store.values).length} value(s)` : 'does NOT exist yet'}`);
    log('  name'.padEnd(34) + 'in store'.padEnd(10) + 'Lambda env'.padEnd(12) + 'local'.padEnd(8) + 'action');
    p.rows.forEach(r => {
        const act = r.pick ? `will be stored from ${r.pick.label}` : r.inStore ? 'ok' : 'no value found anywhere (optional?)';
        log('  ' + r.name.padEnd(32) + (r.inStore ? 'yes' : '–').padEnd(10) + (r.onLambda ? 'yes' : '–').padEnd(12) + (r.inLocal ? 'yes' : '–').padEnd(8) + act + (r.differsFromLambda ? '  ⚠ store ≠ Lambda env (store kept)' : ''));
    });
}

// ── live checks (no secret values are sent or shown) ─────────────────────────────────────────────────
async function http(method, p, body) {
    try {
        const r = await fetch(`${API_BASE}${p}${p.includes('?') ? '&' : '?'}cb=${Date.now()}`, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
        let j = null; try { j = await r.json(); } catch (e) { /* not JSON */ }
        return { status: r.status, json: j };
    } catch (e) { return { status: 0, json: null }; }
}
async function liveChecks() {
    const cfg = await http('GET', '/config'), sa = await http('GET', '/standalone/config'), fc = await http('GET', '/forward-config');
    const sess = await http('POST', '/payment-sessions', { amount: 100, currency: 'GBP', processing_channel_id: cfg.json?.processingChannelId, billing: { address: { country: 'GB' } }, success_url: 'https://example.com/s', failure_url: 'https://example.com/f' });
    const stripe = await http('GET', '/competitors/stripe/payment-intent/pi_secrets_check');
    const acct = await http('GET', '/account/config');                                 // read-only: reports (as yes/no + masked) which server defaults are present
    const d = fc.json?.defaults || {};
    return {
        'API reachable (/config)': cfg.status === 200,
        'main secret key accepted by Checkout.com': [200, 201, 422].includes(sess.status),
        'Standalone OAuth client configured': sa.json?.oauthConfigured === true,
        'Forward secret key present': d.secretKey?.set === true,
        'Forward Stripe key present': d.stripeApiKey?.set === true,
        'Forward Adyen key present': d.adyenApiKey?.set === true,
        'Stripe secret key accepted by Stripe': stripe.status === 404,
        'webhook secret present': acct.json?.defaults?.webhookSecret?.set === true,
        'account sealing key present': acct.json?.sealingAvailable === true,
        _leaks: typeof fc.json?.secretKey === 'string' && fc.json.secretKey.length > 0,
    };
}

// ── prune the secret names from the Lambda's plain environment ──────────────────────────────────────
async function prune(p, apply) {
    const onLambda = p.rows.filter(r => r.onLambda);
    log(`\n  Lambda environment holds ${onLambda.length} secret value(s): ${onLambda.map(r => r.name).join(', ') || '—'}`);
    if (!onLambda.length) { ok('nothing to remove'); return; }
    const notStored = onLambda.filter(r => !r.inStore || r.differsFromLambda);
    if (notStored.length) throw new Error(`Not safe yet — these are missing from the store or differ from the Lambda's value: ${notStored.map(r => r.name).join(', ')}. Run  npm run secrets:sync -- --apply  first (use --overwrite NAME to take the Lambda's value).`);
    ok('every one of them is in the secrets store with the same value');
    fs.mkdirSync(BUILD_DIR, { recursive: true });
    const zip = path.join(BUILD_DIR, `deployed-check-${stamp()}.zip`);
    await downloadDeployed(zip);
    const entries = execFileSync('unzip', ['-Z1', zip], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    fs.rmSync(zip, { force: true });
    if (!/^secrets-loader\.js$/m.test(entries)) throw new Error('The DEPLOYED Lambda does not contain secrets-loader.js yet — release first (npm run release), otherwise the app would lose its secrets.');
    if (/^certificates\//m.test(entries)) warn('the deployed package still contains certificates/ — it will be gone after the next release');
    ok('the deployed Lambda contains the secrets loader');
    const before = await liveChecks();
    if (before._leaks) throw new Error('GET /forward-config still returns a secret — release the Forward credentials fix first.');
    const works = Object.entries(before).filter(([k, v]) => k !== '_leaks' && v);
    log(`  live checks BEFORE: ${works.length} pass — ${works.map(([k]) => k).join('; ')}`);
    if (!apply) { log('\n  Dry run only — nothing was changed. Re-run with  -- --prune-lambda-env --apply'); return; }

    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const backup = path.join(BACKUP_DIR, `env-${stamp()}.json`);
    fs.writeFileSync(backup, JSON.stringify(p.lam.vars), { mode: 0o600 });
    ok(`backed up the current variables → ${path.relative(ROOT, backup)} (contains secrets; git-ignored)`);
    const remaining = Object.fromEntries(Object.entries(p.lam.vars).filter(([k]) => !onLambda.some(r => r.name === k)));
    await setEnv(remaining, p.lam.revision);
    ok(`removed ${onLambda.length} secret variable(s) from the Lambda environment`);
    await new Promise(r => setTimeout(r, 4000));                       // let the new configuration take effect on the next invocation
    const cold = await liveChecks();                                    // the first call after a config change is a cold start that reads the store
    const after = await liveChecks();
    const regress = works.filter(([k]) => !after[k]).map(([k]) => k);
    if (regress.length) {
        warn(`regression after the change: ${regress.join('; ')} — RESTORING the environment`);
        await setEnv(p.lam.vars, currentLambdaEnv().revision);
        throw new Error(`Rolled back: the app did not work without those environment variables (${regress.join('; ')}). Check the Lambda log for "[secrets]" lines.`);
    }
    ok(`live checks AFTER: all ${works.length} still pass — the app now reads its secrets from Secrets Manager`);
    log(`  Undo any time:  npm run lambda:env -- --restore ${path.basename(backup)} --apply`);
}

// ── used by release: block when the code needs a secret that exists nowhere ─────────────────────────
function secretsStatus() {
    const code = scanCode(), names = secretNames().filter(n => code[n]);
    const store = readSecret(), lam = currentLambdaEnv();
    const blocked = names.filter(n => code[n].required && store.values[n] === undefined && lam.vars[n] === undefined).map(n => ({ name: n }));
    return { exists: store.exists, names, blocked };
}

async function main() {
    const apply = hasFlag('--apply');
    const extra = (flagValue('--add') || '').split(',').filter(Boolean), overwrite = (flagValue('--overwrite') || '').split(',').filter(Boolean);
    log(`\nApp secrets (${apply ? 'APPLY' : 'dry run'}) — ${PIN.appSecretId}`);
    guard();
    const p = plan({ extra, overwrite });
    printPlan(p);
    const toStore = p.rows.filter(r => r.pick);
    if (hasFlag('--prune-lambda-env')) {
        if (toStore.length) throw new Error('Some values are not stored yet — run  npm run secrets:sync -- --apply  first.');
        return prune(p, apply);
    }
    if (!toStore.length && p.store.exists && !extra.length) { ok('the store is complete — nothing to do'); return; }
    if (!apply) { log('\n  Dry run only — nothing was changed. Re-run with  -- --apply'); return; }
    const values = { ...p.store.values };
    toStore.forEach(r => { values[r.name] = r.pick.value; });
    writeSecret(values, p.store.exists);
    const back = readSecret().values;
    toStore.forEach(r => { if (h(back[r.name]) !== h(r.pick.value)) throw new Error(`Verification failed for ${r.name}`); });
    ok(`${p.store.exists ? 'updated' : 'created'} ${PIN.appSecretId} — ${toStore.length} value(s) written and verified (${Object.keys(values).length} in total)`);
    if (extra.length) {
        const m = readManifest(); extra.forEach(n => { m.vars[n] = { ...(m.vars[n] || {}), policy: 'secret' }; });
        fs.writeFileSync(MANIFEST, JSON.stringify(m, null, 2) + '\n'); ok(`registered as secret in env.manifest.json: ${extra.join(', ')}`);
    }
    log('  Next: release the code with the loader, then  npm run secrets:sync -- --prune-lambda-env --apply');
}

if (require.main === module) main().then(() => log('')).catch(e => fail(e.message));
module.exports = { secretNames, secretsStatus, readSecret };
