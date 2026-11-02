'use strict';
// ONE command to ship everything after a feature is done:
//   npm run release -- --message "what changed"            → DRY RUN: shows exactly what would happen
//   npm run release -- --message "what changed" --apply    → does it
// Order matters: BACKEND first (new routes + Lambda code), FRONTEND last (git push → Amplify build), so a new frontend never goes live
// against a backend that does not have its routes yet. If any backend step fails, the frontend is NOT pushed.
//   1. API Gateway: create routes that exist in code but are not reachable (api:sync)
//   2. Lambda: deploy the new backend code with backup + hash verification + smoke test (lambda:deploy)
//   3. Frontend: commit everything, merge into main if you are on a feature branch, push → waits for the Amplify build and checks the site
//   0. pre-flight: if the code needs an environment variable that has no value anywhere, stop before changing anything
//   (between 1 and 2: new Lambda environment variables are added automatically — see lambda-env.js)
// Flags: --no-backend / --no-frontend to do only one half; --overwrite NAME[,NAME] to also replace existing Lambda variables from your .env.
const { execFileSync } = require('child_process');
const { aws, guard, PIN, ROOT, FRONTEND_URL, smokeTest, log, ok, warn, hasFlag, flagValue } = require('./lib');
const { deploy } = require('./lambda-deploy');
const { syncRoutes } = require('./api-sync');
const { planEnv, syncEnv } = require('./lambda-env');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim();

// What actually finished — printed at the end so nobody starts testing against a half-finished release.
const done = { routes: null, env: null, lambda: null, frontend: null, commit: null };
const line = '═'.repeat(64);
function banner(complete, lines) {
    log(`\n${line}`);
    log(complete ? '  RELEASE COMPLETE — backend and frontend are both live. Safe to test now.' : '  RELEASE NOT COMPLETE — do NOT start testing yet.');
    lines.forEach(l => log('  ' + l));
    log(line + '\n');
}

(async () => {
    try {
        const apply = hasFlag('--apply'), message = flagValue('--message');
        const doBackend = !hasFlag('--no-backend'), doFrontend = !hasFlag('--no-frontend');
        if (apply && !message) throw new Error('--message "…" is required with --apply (it becomes the commit message).');
        log(`\nRelease (${apply ? 'APPLY' : 'dry run'}) — backend ${doBackend ? 'yes' : 'skipped'} · frontend ${doFrontend ? 'yes' : 'skipped'}`);
        const branch = git('branch', '--show-current');
        const changes = git('status', '--porcelain').split('\n').filter(Boolean);
        const area = (f) => (/\bfrontend\//.test(f) ? 'frontend' : /amplify\/backend\//.test(f) ? 'backend' : 'other');
        const counts = changes.reduce((a, l) => { const k = area(l); a[k] = (a[k] || 0) + 1; return a; }, {});
        log(`  git: branch ${branch}, ${changes.length} uncommitted file(s) ${JSON.stringify(counts)}`);

        if (doBackend) {
            guard();
            // pre-flight: refuse to start if the code needs an environment variable that has no value anywhere (nothing has been changed yet)
            const overwrite = (flagValue('--overwrite') || '').split(',').filter(Boolean);
            const pre = planEnv({ overwrite });
            if (pre.report.blocked.length) { await syncEnv({ apply: false, overwrite }); }
            log('\n[1/4] API Gateway routes');
            const sr = await syncRoutes({ apply });
            done.routes = sr.missing.length ? `${sr.plan.length} API Gateway resource(s) created` : 'all routes already reachable';
            log('\n[2/4] Lambda environment variables');
            const ev = await syncEnv({ apply, overwrite });
            done.env = ev.changed.length ? `${ev.changed.length} env var(s) added: ${ev.changed.join(', ')}` : 'environment already complete';
            log('\n[3/4] Lambda code');
            const d = await deploy({ apply });
            if (apply && d.unchanged) ok('backend code already live — nothing uploaded');
            done.lambda = apply ? (d.unchanged ? 'backend code was already live (hash-identical)' : `Lambda deployed, live hash verified (${String(d.afterSha).slice(0, 8)}…)`) : null;
        }
        if (!doFrontend) { if (apply) banner(true, [`✓ Backend  — ${done.routes}; ${done.env}; ${done.lambda}`, '– Frontend — skipped (--no-frontend)']); else log('\nDone (dry run, frontend skipped).\n'); return; }

        log('\n[4/4] Frontend (commit → main → push → Amplify)');
        const plan = branch === 'main' ? 'commit on main and push' : `commit on ${branch}, merge into main, push main`;
        log(`  plan: ${plan}${message ? ` — “${message}”` : ''}`);
        if (!apply) { log('\n  Dry run only — nothing was changed, nothing was pushed. Add  --apply  to run it.\n'); return; }

        if (git('status', '--porcelain')) { git('add', '.'); git('commit', '-m', message); ok('committed'); } else ok('nothing to commit');
        if (branch !== 'main') { git('checkout', 'main'); git('merge', branch, '--no-edit'); ok(`merged ${branch} into main`); }
        git('push', 'origin', 'main'); ok('pushed main');
        const head = git('rev-parse', 'HEAD'); done.commit = head.slice(0, 7);

        // wait for the Amplify build of exactly this commit
        log('  waiting for the Amplify build …');
        const end = Date.now() + 12 * 60 * 1000; let job = null;
        while (Date.now() < end) {
            const jobs = aws(['amplify', 'list-jobs', '--app-id', PIN.amplifyAppId, '--branch-name', PIN.amplifyBranch, '--max-results', '5']).jobSummaries || [];
            job = jobs.find(j => head.startsWith(j.commitId || '~') || (j.commitId || '').startsWith(head.slice(0, 7))) || null;
            if (job && ['SUCCEED', 'FAILED', 'CANCELLED'].includes(job.status)) break;
            await sleep(10000);
        }
        if (!job) throw new Error('Pushed, but no Amplify build for this commit appeared in 12 minutes — check the Amplify console.');
        if (job.status !== 'SUCCEED') throw new Error(`Amplify build ${job.jobId} ended as ${job.status}.`);
        ok(`Amplify build ${job.jobId} succeeded`);
        const r = await fetch(`${FRONTEND_URL}/?cb=${Date.now()}`);
        if (r.status !== 200) throw new Error(`The Amplify build succeeded but ${FRONTEND_URL} answered HTTP ${r.status}.`);
        ok(`${FRONTEND_URL} → HTTP 200`);
        // the API must still be healthy now that both halves are live
        const smoke = await smokeTest();
        if (smoke.some(x => x.status !== 200)) throw new Error('Both halves deployed, but the API smoke test failed: ' + smoke.map(x => `${x.path} ${x.status}`).join(', '));
        ok('API smoke test passed');
        done.frontend = `Amplify build ${job.jobId} succeeded, site HTTP 200 (commit ${done.commit})`;
        banner(true, [`✓ Backend  — ${[done.routes, done.env, done.lambda].filter(Boolean).join('; ') || 'no backend step'}`, `✓ Frontend — ${done.frontend}`, 'Hard-refresh the site (Cmd+Shift+R) before testing.']);
    } catch (e) {
        console.error(`\n✕ ${e.message}`);
        banner(false, [
            `${done.lambda ? '✓' : '✕'} Backend  — ${[done.routes, done.env, done.lambda].filter(Boolean).join('; ') || 'did not finish'}`,
            `${done.frontend ? '✓' : '✕'} Frontend — ${done.frontend || (done.commit ? `pushed (${done.commit}) but not confirmed live — check the Amplify console` : 'not pushed / not finished')}`,
            'Backend rollback if needed:  npm run lambda:rollback -- --apply',
        ]);
        process.exit(1);
    }
})();
