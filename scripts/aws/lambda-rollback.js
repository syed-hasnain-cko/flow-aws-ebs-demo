'use strict';
// npm run lambda:rollback -- --list            → show the backups taken by lambda:deploy
// npm run lambda:rollback                      → DRY RUN for the newest backup
// npm run lambda:rollback -- --apply           → restore the newest backup (or --file <name from --list>), verify its hash, smoke-test
const fs = require('fs');
const path = require('path');
const { aws, guard, PIN, BACKUP_DIR, sha256b64, smokeTest, log, ok, warn, fail, hasFlag, flagValue } = require('./lib');

const listBackups = () => (fs.existsSync(BACKUP_DIR) ? fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.zip')).sort().reverse() : []);

// Returns { applied, file, afterSha, smoke }. Throws on failure.
async function rollback({ apply = false, file: name } = {}) {
    const files = listBackups();
    if (!files.length) throw new Error('No backups found in .aws-backups/ — nothing to roll back to.');
    const file = path.join(BACKUP_DIR, path.basename(name || files[0]));
    if (!fs.existsSync(file)) throw new Error(`Backup not found: ${name}`);
    log(`\nLambda rollback (${apply ? 'APPLY' : 'dry run'}) — ${PIN.lambda}`);
    ok(`would restore ${path.basename(file)} (${(fs.statSync(file).size / 1048576).toFixed(1)} MB)`);
    if (!apply) { log('\n  Dry run only — nothing was changed. Re-run with  -- --apply  to restore.'); return { applied: false, file }; }
    const before = aws(['lambda', 'get-function-configuration', '--function-name', PIN.lambda]);
    aws(['lambda', 'update-function-code', '--function-name', PIN.lambda, '--zip-file', `fileb://${file}`, '--revision-id', before.RevisionId]);
    aws(['lambda', 'wait', 'function-updated', '--function-name', PIN.lambda], { json: false });
    const after = aws(['lambda', 'get-function-configuration', '--function-name', PIN.lambda]);
    ok(`restored — status ${after.LastUpdateStatus}, modified ${after.LastModified}`);
    if (after.CodeSha256 !== sha256b64(file)) throw new Error('Hash mismatch after restore — the live code is not the backup.');
    ok('live code hash equals the backup (verified)');
    const smoke = await smokeTest();
    smoke.forEach(r => (r.status === 200 ? ok : warn)(`GET ${r.path} → ${r.status}`));
    if (smoke.some(r => r.status !== 200)) throw new Error('Smoke test failed after rollback.');
    return { applied: true, file, afterSha: after.CodeSha256, smoke };
}

if (require.main === module) {
    (async () => {
        try {
            if (hasFlag('--list')) { const f = listBackups(); log(f.length ? '\nBackups (newest first):\n' + f.map(x => '  ' + x).join('\n') + '\n' : '\nNo backups yet — lambda:deploy --apply creates one each time.\n'); return; }
            guard(); await rollback({ apply: hasFlag('--apply'), file: flagValue('--file') }); log('');
        } catch (e) { fail(e.message); }
    })();
}
module.exports = { rollback, listBackups };
