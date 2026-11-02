'use strict';
// npm run lambda:deploy             → DRY RUN: builds the zip, shows which source files differ from what is deployed, changes nothing
// npm run lambda:deploy -- --apply  → backs up the current package, uploads, waits until active, VERIFIES the live code hash equals the
//                                      uploaded zip, and smoke-tests the API
// Only the code is replaced — environment variables, layers, memory, timeout and the API Gateway wiring are untouched.
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { aws, guard, PIN, SRC_DIR, BACKUP_DIR, API_BASE, stamp, sha256b64, downloadDeployed, smokeTest, log, ok, warn, fail, hasFlag } = require('./lib');
const { buildZip, verify } = require('./lambda-build');

const hashFile = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
function walkJs(dir, base = dir, out = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (['node_modules', 'certificates', '__MACOSX'].includes(e.name)) continue;
        const p = path.join(dir, e.name);
        e.isDirectory() ? walkJs(p, base, out) : /\.(js|json)$/.test(e.name) && e.name !== 'event.json' && out.push(path.relative(base, p));
    }
    return out;
}

// Returns { applied, changed, removed, builtSha, beforeSha, afterSha, backup, smoke }. Throws on any failure.
async function deploy({ apply = false } = {}) {
    log(`\nLambda deploy (${apply ? 'APPLY' : 'dry run'}) — ${PIN.lambda}`);
    const before = aws(['lambda', 'get-function-configuration', '--function-name', PIN.lambda]);
    ok(`deployed now: ${(before.CodeSize / 1048576).toFixed(1)} MB, modified ${before.LastModified}`);

    const { file, names } = buildZip();
    const { problems } = verify(names);
    if (problems.length) throw new Error('Build problems: ' + problems.join('; '));
    const builtSha = sha256b64(file);
    ok(`built ${path.relative(process.cwd(), file)} (${(fs.statSync(file).size / 1048576).toFixed(1)} MB, ${names.length} entries)`);

    // compare source files with what is deployed (downloaded to a temp dir and removed afterwards)
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lambda-cmp-'));
    const deployedZip = path.join(tmp, 'deployed.zip');
    try {
        await downloadDeployed(deployedZip);
        execFileSync('unzip', ['-q', '-o', deployedZip, '-x', 'node_modules/*', '__MACOSX/*', 'certificates/*', '-d', path.join(tmp, 'x')], { stdio: ['ignore', 'ignore', 'ignore'] });
        const localFiles = walkJs(SRC_DIR), deployedFiles = fs.existsSync(path.join(tmp, 'x')) ? walkJs(path.join(tmp, 'x')) : [];
        const changed = localFiles.filter(f => !deployedFiles.includes(f) || hashFile(path.join(SRC_DIR, f)) !== hashFile(path.join(tmp, 'x', f)));
        const removed = deployedFiles.filter(f => !localFiles.includes(f));
        if (before.CodeSha256 === builtSha) ok('the built zip is byte-identical to what is deployed — nothing to upload');
        else if (!changed.length && !removed.length) ok('source files are identical to what is deployed (the zip differs only in packaging, e.g. dropped macOS junk)');
        else { log('  source files that differ from the deployed package:'); changed.forEach(f => log(`    ~ ${f}`)); removed.forEach(f => log(`    - ${f} (only in the deployed package)`)); }

        if (!apply) { log('\n  Dry run only — nothing was changed. Re-run with  -- --apply  to deploy.'); return { applied: false, changed, removed, builtSha, beforeSha: before.CodeSha256 }; }
        if (before.CodeSha256 === builtSha) return { applied: false, changed, removed, builtSha, beforeSha: before.CodeSha256, afterSha: before.CodeSha256, unchanged: true };

        // 1. back up the deployed package so it can be restored
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
        const backup = path.join(BACKUP_DIR, `${stamp()}-${before.CodeSha256.replace(/[^A-Za-z0-9]/g, '').slice(0, 8)}.zip`);
        fs.copyFileSync(deployedZip, backup);
        ok(`backed up the current package → ${path.relative(process.cwd(), backup)}`);
        // 2. upload (revision id guards against someone else changing the function meanwhile)
        aws(['lambda', 'update-function-code', '--function-name', PIN.lambda, '--zip-file', `fileb://${file}`, '--revision-id', before.RevisionId]);
        aws(['lambda', 'wait', 'function-updated', '--function-name', PIN.lambda], { json: false });
        const after = aws(['lambda', 'get-function-configuration', '--function-name', PIN.lambda]);
        ok(`uploaded — status ${after.LastUpdateStatus}, ${(after.CodeSize / 1048576).toFixed(1)} MB, modified ${after.LastModified}`);
        // 3. the live code must be EXACTLY the zip we built
        if (after.CodeSha256 !== builtSha) throw new Error(`Hash mismatch after upload: live ${after.CodeSha256} ≠ built ${builtSha}. Roll back with: npm run lambda:rollback -- --apply`);
        ok('live code hash equals the uploaded zip (verified)');
        // 4. smoke test through API Gateway
        const smoke = await smokeTest();
        smoke.forEach(r => (r.status === 200 ? ok : warn)(`GET ${r.path} → ${r.status}`));
        if (smoke.some(r => r.status !== 200)) throw new Error('Smoke test failed after deploy — roll back with: npm run lambda:rollback -- --apply');
        log(`\n  Rollback: npm run lambda:rollback -- --apply   (restores ${path.basename(backup)})   ·   Base URL: ${API_BASE}`);
        return { applied: true, changed, removed, builtSha, beforeSha: before.CodeSha256, afterSha: after.CodeSha256, backup, smoke };
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

if (require.main === module) {
    (async () => { try { guard(); await deploy({ apply: hasFlag('--apply') }); log(''); } catch (e) { fail(e.message); } })();
}
module.exports = { deploy };
