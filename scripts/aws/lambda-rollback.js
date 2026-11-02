'use strict';
// npm run lambda:rollback -- --list            → show the backups taken by lambda:deploy
// npm run lambda:rollback                      → DRY RUN for the newest backup
// npm run lambda:rollback -- --apply           → restore the newest backup (or --file <name from --list>)
const fs = require('fs');
const path = require('path');
const { aws, guard, PIN, BACKUP_DIR, smokeTest, log, ok, warn, fail, hasFlag, flagValue } = require('./lib');

(async () => {
    try {
        const files = fs.existsSync(BACKUP_DIR) ? fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.zip')).sort().reverse() : [];
        if (hasFlag('--list')) { log(files.length ? '\nBackups (newest first):\n' + files.map(f => '  ' + f).join('\n') + '\n' : '\nNo backups yet — lambda:deploy --apply creates one each time.\n'); return; }
        if (!files.length) throw new Error('No backups found in .aws-backups/ — nothing to roll back to.');
        const name = flagValue('--file') || files[0];
        const file = path.join(BACKUP_DIR, path.basename(name));
        if (!fs.existsSync(file)) throw new Error(`Backup not found: ${name}`);
        guard();
        const apply = hasFlag('--apply');
        log(`\nLambda rollback (${apply ? 'APPLY' : 'dry run'}) — ${PIN.lambda}`);
        ok(`would restore ${path.basename(file)} (${(fs.statSync(file).size / 1048576).toFixed(1)} MB)`);
        if (!apply) { log('\n  Dry run only — nothing was changed. Re-run with  -- --apply  to restore.\n'); return; }
        const before = aws(['lambda', 'get-function-configuration', '--function-name', PIN.lambda]);
        aws(['lambda', 'update-function-code', '--function-name', PIN.lambda, '--zip-file', `fileb://${file}`, '--revision-id', before.RevisionId]);
        aws(['lambda', 'wait', 'function-updated', '--function-name', PIN.lambda], { json: false });
        const after = aws(['lambda', 'get-function-configuration', '--function-name', PIN.lambda]);
        ok(`restored — status ${after.LastUpdateStatus}, modified ${after.LastModified}`);
        (await smokeTest()).forEach(r => (r.status === 200 ? ok : warn)(`GET ${r.path} → ${r.status}`));
        log('');
    } catch (e) { fail(e.message); }
})();
