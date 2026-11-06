'use strict';
// =============================================
// Shared helpers for the AWS deploy scripts (scripts/aws/*).
//   - Talks to AWS only through the installed `aws` CLI using the login/SSO profile in config.json
//     (or $AWS_PROFILE). No access keys are read or stored anywhere.
//   - The target (Lambda, REST API, stage, region) is PINNED below — there is no flag to change it.
//   - 12-digit account numbers are masked in everything these scripts print.
// =============================================
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '../..');
const SRC_DIR = path.join(ROOT, 'amplify/backend/function/flowDemoLambdaSyed/src');
const BUILD_DIR = path.join(ROOT, '.aws-build');
const BACKUP_DIR = path.join(ROOT, '.aws-backups');

const PIN = Object.freeze({
    region: 'us-east-1',
    lambda: 'flowDemoLambdaSyed-staging',
    restApiId: 'zzrte604h4',
    stage: 'staging',
    expectedRole: 'cko_playground_engineer',      // the SSO role this tooling expects to run as
    amplifyAppId: 'd11m29074qik0k',               // Amplify app “flow-syed-demo” (the frontend; deploys on every push to main)
    amplifyBranch: 'main',
    appSecretId: 'flowdemo/staging/app-secrets',   // the Secrets Manager secret that holds the app's secret values (see secrets.js)
});
const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
const PROFILE = process.env.AWS_PROFILE || cfg.profile;
const API_BASE = `https://${PIN.restApiId}.execute-api.${PIN.region}.amazonaws.com/${PIN.stage}`;
const FRONTEND_URL = `https://${PIN.amplifyBranch}.${PIN.amplifyAppId}.amplifyapp.com`;

const mask = (s) => String(s).replace(/\b\d{12}\b/g, '************');
const hasFlag = (f) => process.argv.includes(f);
const flagValue = (f) => { const i = process.argv.indexOf(f); return i > -1 ? process.argv[i + 1] : undefined; };
const log = (...a) => console.log(...a);
const ok = (m) => log(`  ✓ ${m}`);
const warn = (m) => log(`  ⚠ ${m}`);
const fail = (m) => { console.error(`\n✕ ${m}\n`); process.exit(1); };

// Run `aws <args> --profile … --region …` and return parsed JSON (or raw text with {json:false}).
function aws(args, opts = {}) {
    const full = [...args, '--profile', PROFILE, '--region', PIN.region];
    if (opts.json !== false) full.push('--output', 'json');
    try {
        const out = execFileSync('aws', full, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
        if (opts.json === false) return out;
        return out.trim() ? JSON.parse(out) : null;
    } catch (e) {
        const err = String(e.stderr || e.message || '');
        if (/Unable to locate credentials|ExpiredToken|token has expired|SSO session|Error loading SSO|login/i.test(err)) {
            throw new Error(`The AWS session is missing or expired — run:  aws login --profile ${PROFILE}`);
        }
        throw new Error(mask(err).trim().split('\n').slice(-4).join('\n') || 'aws command failed');
    }
}

// Confirms we are signed in as the expected role. The account number is never printed.
function guard() {
    const id = aws(['sts', 'get-caller-identity']);
    const role = (id.Arn.split('/')[1] || '');
    if (!role.includes(PIN.expectedRole)) throw new Error(`Signed in as role “${role}”, expected “${PIN.expectedRole}”. Run: aws login --profile ${PROFILE}`);
    return { role };
}

const sha256b64 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('base64');
const sha8 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, 8);
const stamp = () => new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);

// Download the CURRENTLY deployed Lambda package (Code.Location is a short-lived presigned URL).
async function downloadDeployed(dest) {
    const fn = aws(['lambda', 'get-function', '--function-name', PIN.lambda]);
    const res = await fetch(fn.Code.Location);
    if (!res.ok) throw new Error(`Could not download the deployed package (HTTP ${res.status})`);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
    return fn.Configuration;
}

// Hit the live API after a change. Returns [{path, status}].
async function smokeTest(paths = ['/config', '/standalone/config']) {
    const out = [];
    for (const p of paths) {
        try { const r = await fetch(API_BASE + p); out.push({ path: p, status: r.status }); }
        catch (e) { out.push({ path: p, status: 'network error' }); }
    }
    return out;
}

module.exports = { ROOT, SRC_DIR, BUILD_DIR, BACKUP_DIR, PIN, PROFILE, API_BASE, FRONTEND_URL, mask, hasFlag, flagValue, log, ok, warn, fail, aws, guard, sha256b64, sha8, stamp, downloadDeployed, smokeTest };
