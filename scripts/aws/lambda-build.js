'use strict';
// npm run lambda:build — zip the Lambda source folder the way you do by hand today (src incl. node_modules and certificates),
// minus the macOS junk (__MACOSX, .DS_Store) and event.json. Output goes to .aws-build/ (git-ignored). Local only: no AWS calls.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { SRC_DIR, BUILD_DIR, stamp, sha8, log, ok, warn, fail } = require('./lib');

function buildZip() {
    fs.mkdirSync(BUILD_DIR, { recursive: true });
    const out = path.join(BUILD_DIR, `flowDemoLambdaSyed-${stamp()}.zip`);
    execFileSync('zip', ['-r', '-q', '-X', out, '.', '-x', '__MACOSX/*', '*.DS_Store', '.DS_Store', 'event.json', 'node_modules/.cache/*'], { cwd: SRC_DIR });
    const names = execFileSync('unzip', ['-Z1', out], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\n').filter(Boolean);
    return { file: out, names };
}

function verify(names) {
    const top = new Set(names.map(n => n.split('/')[0]));
    const problems = [];
    ['index.js', 'app.js', 'api-route-controller.js', 'config.js', 'package.json', 'node_modules'].forEach(r => { if (!top.has(r)) problems.push(`missing ${r}`); });
    if (names.some(n => n.startsWith('__MACOSX') || n.endsWith('.DS_Store'))) problems.push('junk files slipped into the zip');
    return { top, problems };
}

if (require.main === module) {
    try {
        const { file, names } = buildZip();
        const { top, problems } = verify(names);
        const mb = (fs.statSync(file).size / 1048576).toFixed(1);
        log(`\nBuilt ${path.relative(process.cwd(), file)} — ${mb} MB, ${names.length} entries (sha ${sha8(file)})`);
        log('  top level: ' + [...top].sort().join(', '));
        if (top.has('certificates')) warn('certificates/ is included (as in your current package) — the zip stays local and is git-ignored');
        problems.length ? problems.forEach(p => warn(p)) : ok('structure looks right (entry files + node_modules present, no macOS junk)');
        log('');
        if (problems.length) process.exit(1);
    } catch (e) { fail(e.message); }
}
module.exports = { buildZip, verify };
