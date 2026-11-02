'use strict';
// npm run aws:verify             → read-only checks only (setup, route coverage, deploy dry-run)
// npm run aws:verify -- --apply  → also proves the CHANGING paths work, with automatic cleanup:
//     Lambda   deploy new build → live hash == uploaded zip → rollback → live hash == original → deploy new build again
//     Gateway  create a throwaway route (/__synctest) → OPTIONS 200 + CORS, GET reaches the Lambda (Express 404, not API-Gateway 403)
//              → delete it → GET is 403 again → route diff still clean
// The only lasting effect: the Lambda ends on the new clean build (same source as before), and a backup of the original is kept.
const { aws, guard, PIN, API_BASE, sha256b64, smokeTest, log, hasFlag } = require('./lib');
const { deploy } = require('./lambda-deploy');
const { rollback } = require('./lambda-rollback');
const { syncRoutes, removeTestResources, TEST_PREFIX } = require('./api-sync');
const { listRoutes } = require('./routes');
const { planEnv, applyEnv, setEnv, currentLambdaEnv } = require('./lambda-env');
const { fetchResources, coverage } = require('./gateway');

const results = [];
const check = (name, pass, detail = '') => { results.push({ name, pass, detail }); log(`  ${pass ? '✓' : '✕'} ${name}${detail ? ' — ' + detail : ''}`); return pass; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let n = 0;
const bust = (u) => `${u}${u.includes('?') ? '&' : '?'}cb=${Date.now()}${n++}`;   // the API's edge (CloudFront) caches 403s — never probe the same URL twice
async function waitFor(fn, ms = 25000, every = 2000) { const end = Date.now() + ms; let last; while (Date.now() < end) { last = await fn(); if (last.done) return last; await sleep(every); } return last; }

(async () => {
    const apply = hasFlag('--apply');
    log(`\nAWS verification (${apply ? 'FULL — changes staging, then restores' : 'read-only'})`);
    let cleanupNeeded = false;
    try {
        const { role } = guard(); check('signed in with the expected role', true, role);
        const fn = aws(['lambda', 'get-function-configuration', '--function-name', PIN.lambda]);
        check('Lambda is healthy', fn.LastUpdateStatus === 'Successful', `${fn.LastUpdateStatus}, ${(fn.CodeSize / 1048576).toFixed(1)} MB`);
        const cov = coverage(listRoutes(), fetchResources());
        check('every route in the code is reachable through API Gateway', cov.missing.length === 0, cov.missing.length ? cov.missing.map(m => m.path).join(', ') : `${cov.covered.length} paths`);
        const smoke0 = await smokeTest(); check('live API answers (smoke test)', smoke0.every(r => r.status === 200), smoke0.map(r => `${r.path} ${r.status}`).join(', '));
        // environment-variable logic (offline unit checks with made-up inputs, then the real Lambda state)
        const L = { vars: { EXISTING: 'lambda-value', ENV: 'PROD' }, revision: 'x' };
        const mf = { ENV: { policy: 'ask' }, EXISTING: { policy: 'copy-local' } };
        const t = (code, local, lambdaFile = {}, extra = {}) => planEnv({ _inject: { code, local, lambdaFile, lambda: L, manifest: mf }, ...extra });
        const a = t({ NEW_KEY: { required: true } }, { NEW_KEY: 'v1' });
        check('env logic: a new required variable is copied from the local .env', a.add.NEW_KEY === 'v1' && a.report.new[0]?.source === 'local .env');
        const b = t({ NEW_KEY: { required: true } }, { NEW_KEY: 'v1' }, { NEW_KEY: 'lambda-specific' });
        check('env logic: scripts/aws/.env.lambda wins over the local .env', b.add.NEW_KEY === 'lambda-specific');
        const c = t({ SERVICE_URL: { required: true } }, { SERVICE_URL: 'http://localhost:4244' });
        check('env logic: an environment-specific name (…_URL) is never copied from local — it blocks', c.report.blocked.some(x => x.name === 'SERVICE_URL') && !('SERVICE_URL' in c.add));
        const d = t({ NEW_KEY: { required: true } }, {});
        check('env logic: a required variable with no value anywhere blocks the release', d.report.blocked.some(x => x.name === 'NEW_KEY'));
        const e = t({ OPT_KEY: { required: false } }, {});
        check('env logic: an optional variable (code has a fallback) is not an error', e.report.blocked.length === 0 && e.report.optionalMissing.includes('OPT_KEY'));
        const f = t({ EXISTING: { required: true }, ENV: { required: true } }, { EXISTING: 'other-local-value', ENV: 'DEV' });
        check('env logic: existing Lambda values are never changed (drift is only reported)', Object.keys(f.add).length === 0 && f.report.drift.includes('EXISTING') && !f.report.drift.includes('ENV'));
        const g = t({ EXISTING: { required: true } }, { EXISTING: 'rotated' }, {}, { overwrite: ['EXISTING'] });
        check('env logic: --overwrite replaces only the named variable', g.add.EXISTING === 'rotated' && Object.keys(g.add).length === 1);
        const bad = t({ _BAD_NAME: { required: true } }, { _BAD_NAME: 'x' });
        check('env logic: a name Lambda would reject is blocked before any AWS call', bad.report.blocked.some(x => x.name === '_BAD_NAME') && !('_BAD_NAME' in bad.add));
        const live = planEnv();
        check('the Lambda has every REQUIRED environment variable the code reads', live.report.blocked.length === 0 && live.report.new.length === 0, `${live.codeCount} read by the code, ${Object.keys(live.existing).length} on the Lambda, ${live.size}/4096 bytes`);
        const dry = await deploy({ apply: false }); check('deploy dry run works (build + diff vs deployed)', true, dry.changed.length ? `${dry.changed.length} file(s) differ: ${dry.changed.join(', ')}` : 'no source differences');

        if (!apply) { log('\n  Read-only run finished. Add  -- --apply  to run the Lambda round trip and the throwaway-route test.'); return; }

        // ── Lambda round trip ────────────────────────────────────────────────────────
        const sha0 = fn.CodeSha256;
        await removeTestResources();                                   // leftovers from an interrupted earlier run
        const skipLambda = hasFlag('--skip-lambda'), skipApi = hasFlag('--skip-api');
        if (!skipLambda) {
        log('\n— Lambda round trip —');
        const d1 = await deploy({ apply: true });
        if (d1.unchanged) { check('deploy', true, 'the built zip is byte-identical to what is live — round trip skipped (nothing to roll back to)'); }
        else {
            check('deploy: live code hash == uploaded zip', d1.afterSha === d1.builtSha);
            check('deploy: smoke test after deploy', d1.smoke.every(r => r.status === 200));
            check('deploy: backup of the previous package is an exact copy', sha256b64(d1.backup) === sha0);
            const rb = await rollback({ apply: true, file: require('path').basename(d1.backup) });
            check('rollback: live code hash == the original package', rb.afterSha === sha0);
            check('rollback: smoke test after rollback', rb.smoke.every(r => r.status === 200));
            const d2 = await deploy({ apply: true });
            check('re-deploy: live code hash == uploaded zip', d2.afterSha === d2.builtSha);
            check('re-deploy: same build as the first deploy (reproducible zip)', d2.builtSha === d1.builtSha);
        }
        }
        // ── Lambda environment: add a temporary variable, prove nothing else moved, restore ──
        if (!skipLambda) {
            log('\n— Lambda environment round trip —');
            const before = currentLambdaEnv();
            const tmpVar = { ZZ_VERIFY_TMP_VAR: 'temporary-test-value' };
            const plan = { add: tmpVar, merged: { ...before.vars, ...tmpVar }, existing: before.vars, revision: before.revision, size: 0, report: {} };
            let restored = false;
            try {
                const res = await applyEnv(plan);
                const mid = currentLambdaEnv().vars;
                check('env: the new variable is on the Lambda and every existing variable is unchanged', mid.ZZ_VERIFY_TMP_VAR === 'temporary-test-value' && Object.keys(before.vars).every(k => mid[k] === before.vars[k]));
                const smokeE = await smokeTest(); check('env: the API still answers after the configuration change', smokeE.every(r => r.status === 200));
                void res;
            } finally {
                const cur = currentLambdaEnv();
                await setEnv(before.vars, cur.revision); restored = true;
            }
            const aft = currentLambdaEnv().vars;
            check('env: restored — the test variable is gone and all original variables are identical', restored && !('ZZ_VERIFY_TMP_VAR' in aft) && Object.keys(before.vars).length === Object.keys(aft).length && Object.keys(before.vars).every(k => aft[k] === before.vars[k]));
        }

        if (!skipApi) {

        // ── API Gateway: throwaway route ──────────────────────────────────────────────
        log('\n— API Gateway throwaway route —');
        const probe = `${API_BASE}${TEST_PREFIX}/ping`;
        const before = await fetch(bust(probe)); check('before: the test route does not exist (API Gateway 403)', before.status === 403, `HTTP ${before.status}`);
        cleanupNeeded = true;
        await syncRoutes({ apply: true, simulate: `${TEST_PREFIX}/ping` });
        const got = await waitFor(async () => { const r = await fetch(bust(probe)); return { done: r.status !== 403, status: r.status, type: r.headers.get('content-type') || '', body: await r.text() }; });
        check('GET reaches the Lambda (Express answers, not API Gateway)', got.done && /html/.test(got.type) && /Cannot GET/.test(got.body), `HTTP ${got.status}, ${got.type}`);
        const opt = await fetch(bust(probe), { method: 'OPTIONS' });
        check('OPTIONS returns 200 with CORS headers', opt.status === 200 && !!opt.headers.get('access-control-allow-origin'), `HTTP ${opt.status}, allow-origin ${opt.headers.get('access-control-allow-origin')}`);
        const optRoot = await fetch(bust(`${API_BASE}${TEST_PREFIX}`), { method: 'OPTIONS' });
        check('the prefix resource itself also answers OPTIONS', optRoot.status === 200, `HTTP ${optRoot.status}`);
        await removeTestResources(); cleanupNeeded = false;
        const gone = await waitFor(async () => { const r = await fetch(bust(probe)); return { done: r.status === 403, status: r.status }; });
        check('cleanup: the test route is gone again (API Gateway 403)', gone.done, `HTTP ${gone.status}`);
        check('cleanup: no test resources remain', !fetchResources().some(r => r.path.startsWith(TEST_PREFIX)));
        }
        const smoke1 = await smokeTest(); check('live API still healthy at the end', smoke1.every(r => r.status === 200), smoke1.map(r => `${r.path} ${r.status}`).join(', '));
    } catch (e) {
        check('no unexpected error', false, e.message);
    } finally {
        if (cleanupNeeded) { try { await removeTestResources(); log('  (cleanup after failure: removed the throwaway route)'); } catch (e) { log(`  ⚠ could not remove ${TEST_PREFIX}: ${e.message} — delete the resource ${TEST_PREFIX} in API Gateway`); } }
        const failed = results.filter(r => !r.pass);
        log(`\n${failed.length ? '✕' : '✓'} ${results.length - failed.length}/${results.length} checks passed${failed.length ? ' — FAILED: ' + failed.map(f => f.name).join('; ') : ''}\n`);
        process.exit(failed.length ? 1 : 0);
    }
})();
