'use strict';
// Keeps the Lambda's environment variables in step with the code — safely.
//   npm run lambda:env                       → DRY RUN: what the code needs, what is missing on the Lambda, where each new value would come from
//   npm run lambda:env -- --apply            → adds the missing variables (existing ones are NEVER changed)
//   npm run lambda:env -- --overwrite A,B --apply   → also replaces the named existing variables (e.g. a rotated key)
//   npm run lambda:env -- --restore <file> --apply  → put back the variables saved in .aws-backups/env-*.json
// Rules that make it accurate:
//   - The code is scanned for process.env.X. A variable is REQUIRED unless every use has a fallback (`|| default`).
//   - Existing Lambda values are the source of truth and are never touched unless named in --overwrite.
//   - A new variable's value comes from (1) scripts/aws/.env.lambda (git-ignored, Lambda-only values), (2) a "literal" in env.manifest.json,
//     (3) the local .env — but NOT for environment-specific names (policy "ask", or names like ENV, *_URL, REGION, DOMAIN*, *_SECRET_NAME).
//   - A required variable with no value anywhere BLOCKS (nothing is changed).
//   - lambda:update-function-configuration REPLACES the whole variable set, so the existing set is read, merged, size-checked (4096-byte limit) and backed up first.
//   - Values are never printed or put on a command line (a 0600 temp file is used and removed). Only names and same/different flags are shown.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const dotenv = require('dotenv');
const { aws, guard, PIN, ROOT, SRC_DIR, BACKUP_DIR, stamp, log, ok, warn, fail, hasFlag, flagValue } = require('./lib');

const MANIFEST = path.join(__dirname, 'env.manifest.json');
const LAMBDA_FILE = path.join(__dirname, '.env.lambda');
const RUNTIME = /^(AWS_|LAMBDA_|_HANDLER$|TZ$|NODE_|LD_|PATH$)/;                 // provided by the Lambda runtime
const ENV_SPECIFIC = /^(ENV|PORT|HOST|REGION|API_BASE_URL|DOMAIN.*)$|_URL$|_SECRET_NAME$/;   // never auto-copied from the local .env
const LIMIT = 4096;
const VALID_NAME = /^[a-zA-Z][a-zA-Z0-9_]+$/;                                  // Lambda's own rule for variable names

const h = (v) => crypto.createHash('sha256').update(String(v)).digest('hex');
const parse = (f) => (fs.existsSync(f) ? dotenv.parse(fs.readFileSync(f)) : {});
const envSize = (o) => Object.entries(o).reduce((a, [k, v]) => a + k.length + String(v).length, 0);

// name → { required, uses }  for every process.env.X read by the backend source
function scanCode() {
    const found = {};
    (function walk(d) {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            if (['node_modules', 'certificates', '__MACOSX'].includes(e.name)) continue;
            const p = path.join(d, e.name);
            if (e.isDirectory()) { walk(p); continue; }
            if (!e.name.endsWith('.js')) continue;
            const t = fs.readFileSync(p, 'utf8');
            for (const m of t.matchAll(/process\.env(?:\.([A-Z0-9_]+)|\[['"]([A-Z0-9_]+)['"]\])(\s*(?:\|\||\?\?))?/g)) {
                const n = m[1] || m[2]; if (RUNTIME.test(n)) continue;
                found[n] = found[n] || { fallbackUses: 0, bareUses: 0 };
                m[3] ? found[n].fallbackUses++ : found[n].bareUses++;
            }
        }
    })(SRC_DIR);
    Object.values(found).forEach(f => { f.required = f.fallbackUses === 0; });   // required only if no use has a default
    return found;
}

function currentLambdaEnv() {
    const cfg = aws(['lambda', 'get-function-configuration', '--function-name', PIN.lambda]);
    return { vars: cfg.Environment?.Variables || {}, revision: cfg.RevisionId };
}

// Work out what to do. Pure read-only. Returns names/flags only in the report; values stay inside `add`.
function planEnv({ overwrite = [], _inject } = {}) {
    const manifest = (_inject?.manifest) || JSON.parse(fs.readFileSync(MANIFEST, 'utf8')).vars;
    // _inject lets aws:verify exercise the decision logic with made-up inputs, without touching AWS or reading real values
    const code = _inject?.code || scanCode(), lam = _inject?.lambda || currentLambdaEnv(), local = _inject?.local || parse(path.join(ROOT, '.env')), lambdaFile = _inject?.lambdaFile || parse(LAMBDA_FILE);
    const add = {}, report = { new: [], blocked: [], optionalMissing: [], drift: [], unused: [], overwritten: [], unknownOverwrite: [] };

    const resolve = (name) => {                      // → { value, source } | null
        if (name in lambdaFile) return { value: lambdaFile[name], source: 'scripts/aws/.env.lambda' };
        const m = manifest[name];
        if (m?.policy === 'literal' && m.value !== undefined) return { value: m.value, source: 'env.manifest.json (literal)' };
        const askLike = m ? m.policy === 'ask' : ENV_SPECIFIC.test(name);
        if (!askLike && name in local) return { value: local[name], source: 'local .env' };
        return null;
    };

    for (const name of Object.keys(code).sort()) {
        if (name in lam.vars) continue;
        const r = resolve(name);
        if (r) { add[name] = r.value; report.new.push({ name, source: r.source, required: code[name].required }); }
        else if (code[name].required) report.blocked.push({ name, why: (manifest[name]?.policy === 'ask' || ENV_SPECIFIC.test(name)) ? 'environment-specific: put its Lambda value in scripts/aws/.env.lambda' : 'not in the local .env either: add it to .env (or scripts/aws/.env.lambda)' });
        else report.optionalMissing.push(name);
    }
    for (const name of overwrite) {
        if (!(name in lam.vars)) { report.unknownOverwrite.push(name); continue; }
        const r = resolve(name); if (!r) { report.blocked.push({ name, why: 'no source value for --overwrite (add it to .env or scripts/aws/.env.lambda)' }); continue; }
        if (h(r.value) !== h(lam.vars[name])) { add[name] = r.value; report.overwritten.push({ name, source: r.source }); }
    }
    for (const name of Object.keys(lam.vars).sort()) {
        if (!(name in code)) report.unused.push(name);
        const policy = manifest[name]?.policy || (ENV_SPECIFIC.test(name) ? 'ask' : 'copy-local');
        if (policy === 'copy-local' && name in local && h(local[name]) !== h(lam.vars[name]) && !(name in add)) report.drift.push(name);
    }
    Object.keys(add).filter(n => !VALID_NAME.test(n)).forEach(n => { delete add[n]; report.new = report.new.filter(x => x.name !== n); report.blocked.push({ name: n, why: 'Lambda only accepts names that start with a letter and use letters, digits and underscores' }); });
    const merged = { ...lam.vars, ...add };
    return { add, merged, existing: lam.vars, revision: lam.revision, size: envSize(merged), codeCount: Object.keys(code).length, report };
}

function printPlan(plan) {
    const r = plan.report;
    log(`  needs: ${plan.codeCount} variables read by the code · Lambda has ${Object.keys(plan.existing).length} · size after change ${plan.size}/${LIMIT} bytes`);
    r.new.forEach(n => ok(`${n.name} — missing on the Lambda, will be ADDED from ${n.source}${n.required ? '' : ' (optional)'}`));
    r.overwritten.forEach(n => warn(`${n.name} — will be OVERWRITTEN from ${n.source} (--overwrite)`));
    r.optionalMissing.forEach(n => log(`  ℹ ${n} — not on the Lambda, but every use has a fallback in the code → fine`));
    r.blocked.forEach(b => warn(`BLOCKED  ${b.name} — ${b.why}`));
    r.unknownOverwrite.forEach(n => warn(`--overwrite ${n}: not an existing Lambda variable`));
    if (r.drift.length) log(`  ℹ differs from your local .env (Lambda value kept, not changed): ${r.drift.join(', ')}`);
    if (r.unused.length) log(`  ℹ on the Lambda but not read by the code (left alone): ${r.unused.join(', ')}`);
    if (!r.new.length && !r.overwritten.length && !r.blocked.length) ok('the Lambda has every variable the code needs — nothing to add');
    if (plan.size > LIMIT) warn(`the merged environment would be ${plan.size} bytes — over the 4096-byte Lambda limit`);
}

// Apply. Writes a 0600 backup of the current variables and a temp file for the CLI (both contain secrets; both git-ignored / removed).
async function applyEnv(plan) {
    if (!Object.keys(plan.add).length) return { changed: [] };
    if (plan.size > LIMIT) throw new Error(`Merged environment is ${plan.size} bytes — over Lambda's 4096-byte limit. Remove a variable or move a value to Secrets Manager.`);
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const backup = path.join(BACKUP_DIR, `env-${stamp()}.json`);
    fs.writeFileSync(backup, JSON.stringify(plan.existing), { mode: 0o600 });
    ok(`backed up the current variables → ${path.relative(ROOT, backup)} (contains secrets; git-ignored)`);
    await setEnv(plan.merged, plan.revision);
    const after = currentLambdaEnv().vars;
    Object.keys(plan.add).forEach(k => { if (h(after[k]) !== h(plan.add[k])) throw new Error(`Verification failed: ${k} on the Lambda is not what was sent.`); });
    Object.keys(plan.existing).filter(k => !(k in plan.add)).forEach(k => { if (h(after[k]) !== h(plan.existing[k])) throw new Error(`Verification failed: ${k} changed unexpectedly.`); });
    ok(`environment updated and verified — ${Object.keys(plan.add).length} variable(s) set, ${Object.keys(plan.existing).length - Object.keys(plan.add).filter(k => k in plan.existing).length} untouched`);
    return { changed: Object.keys(plan.add), backup };
}

async function setEnv(variables, revision) {
    const tmp = path.join(os.tmpdir(), `lambda-env-${process.pid}-${Date.now()}.json`);
    fs.writeFileSync(tmp, JSON.stringify({ FunctionName: PIN.lambda, RevisionId: revision, Environment: { Variables: variables } }), { mode: 0o600 });
    try {
        aws(['lambda', 'update-function-configuration', '--cli-input-json', `file://${tmp}`]);
        aws(['lambda', 'wait', 'function-updated', '--function-name', PIN.lambda], { json: false });
    } finally { fs.rmSync(tmp, { force: true }); }
}

// Record new variables in the manifest so future drift checks know them (names + policy only, never values).
function recordInManifest(plan) {
    const m = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
    let changed = false;
    plan.report.new.forEach(n => { if (!m.vars[n.name]) { m.vars[n.name] = { policy: n.source === 'local .env' ? 'copy-local' : 'ask', note: `added automatically ${new Date().toISOString().slice(0, 10)}` }; changed = true; } });
    if (changed) fs.writeFileSync(MANIFEST, JSON.stringify(m, null, 2) + '\n');
    return changed;
}

async function syncEnv({ apply = false, overwrite = [] } = {}) {
    log(`\nLambda environment (${apply ? 'APPLY' : 'dry run'}) — ${PIN.lambda}`);
    const plan = planEnv({ overwrite });
    printPlan(plan);
    if (plan.report.blocked.length) throw new Error(`Blocked: ${plan.report.blocked.map(b => b.name).join(', ')} — see above. Nothing was changed.`);
    if (!apply) { if (Object.keys(plan.add).length) log('\n  Dry run only — nothing was changed. Re-run with  -- --apply  (or run a release) to add them.'); return { plan, changed: [] }; }
    const res = await applyEnv(plan);
    if (res.changed.length && recordInManifest(plan)) ok('recorded the new variable(s) in scripts/aws/env.manifest.json (names only)');
    return { plan, ...res };
}

if (require.main === module) {
    (async () => {
        try {
            guard();
            if (flagValue('--restore')) {
                const f = path.join(BACKUP_DIR, path.basename(flagValue('--restore')));
                if (!fs.existsSync(f)) throw new Error(`Backup not found: ${f}`);
                if (!hasFlag('--apply')) { log(`\nWould restore the Lambda environment from ${path.basename(f)} (dry run — add --apply).\n`); return; }
                await setEnv(JSON.parse(fs.readFileSync(f, 'utf8')), currentLambdaEnv().revision); ok(`restored the environment from ${path.basename(f)}`); return;
            }
            await syncEnv({ apply: hasFlag('--apply'), overwrite: (flagValue('--overwrite') || '').split(',').filter(Boolean) }); log('');
        } catch (e) { fail(e.message); }
    })();
}
module.exports = { planEnv, syncEnv, applyEnv, setEnv, currentLambdaEnv, scanCode, envSize };
