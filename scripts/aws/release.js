'use strict';
// ONE command to ship everything after a feature is done:
//   npm run release -- --message "what changed"            → DRY RUN: shows exactly what would happen
//   npm run release -- --message "what changed" --apply    → does it
// Order matters: BACKEND first (new routes + Lambda code), FRONTEND last (git push → Amplify build), so a new frontend never goes live
// against a backend that does not have its routes yet. If any backend step fails, the frontend is NOT pushed.
//   1. API Gateway: create routes that exist in code but are not reachable (api:sync)
//   2. Lambda: deploy the new backend code with backup + hash verification + smoke test (lambda:deploy)
//   3. Frontend: commit everything, merge into main if you are on a feature branch, push → waits for the Amplify build and checks the site
// Flags: --no-backend / --no-frontend to do only one half.
const { execFileSync } = require('child_process');
const { aws, guard, PIN, ROOT, FRONTEND_URL, log, ok, warn, fail, hasFlag, flagValue } = require('./lib');
const { deploy } = require('./lambda-deploy');
const { syncRoutes } = require('./api-sync');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim();

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
            log('\n[1/3] API Gateway routes');
            await syncRoutes({ apply });
            log('\n[2/3] Lambda code');
            const d = await deploy({ apply });
            if (apply && d.unchanged) ok('backend code already live — nothing uploaded');
        }
        if (!doFrontend) { log('\nDone (frontend skipped).\n'); return; }

        log('\n[3/3] Frontend (commit → main → push → Amplify)');
        const plan = branch === 'main' ? 'commit on main and push' : `commit on ${branch}, merge into main, push main`;
        log(`  plan: ${plan}${message ? ` — “${message}”` : ''}`);
        if (!apply) { log('\n  Dry run only — nothing was changed, nothing was pushed. Add  --apply  to run it.\n'); return; }

        if (git('status', '--porcelain')) { git('add', '.'); git('commit', '-m', message); ok('committed'); } else ok('nothing to commit');
        if (branch !== 'main') { git('checkout', 'main'); git('merge', branch, '--no-edit'); ok(`merged ${branch} into main`); }
        git('push', 'origin', 'main'); ok('pushed main');
        const head = git('rev-parse', 'HEAD');

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
        const r = await fetch(FRONTEND_URL); (r.status === 200 ? ok : warn)(`${FRONTEND_URL} → HTTP ${r.status}`);
        log('\n✓ Release complete — hard-refresh the site.\n');
    } catch (e) { fail(e.message); }
})();
