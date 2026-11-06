'use strict';
// =============================================================================
// Wallet onboarding — Apple Pay + Google Pay setup calls on behalf of a merchant account
//
//   GET  /wallet-onboarding/config        what the default account looks like (masked) + whether sealing is available
//   POST /wallet-onboarding/seal          seal a merchant's SECRET key server-side → opaque token the browser keeps instead of the key
//   POST /wallet-onboarding/call          run ONE of the seven allowlisted Checkout.com operations for a profile (below)
//   POST /wallet-onboarding/inspect-cert  read an Apple certificate (subject, merchant id, expiry, EC/RSA) — no Checkout.com call
//
//   apple.enroll        POST /applepay/enrollments                          {domain}                                   → 204
//   apple.csr           POST /applepay/signing-requests                     {protocol_version}                         → {content}
//   apple.certificate   POST /applepay/certificates                         {content}                                  → {id, public_key_hash, valid_from, valid_until}
//   google.enroll       POST /googlepay/enrollments                         {entity_id, email_address, accept_terms…}  → 201
//   google.domain       POST /googlepay/enrollments/{entity_id}/domain      {web_domain}                               → 204
//   google.state        GET  /googlepay/enrollments/{entity_id}/state
//   google.domains      GET  /googlepay/enrollments/{entity_id}/domains
//
// Credentials, in the order the visitor sees them:
//   profile.kind "default" → the visitor's Settings account if they set one, else the server's own account (nothing sent from the browser)
//   profile.kind "merchant" → environment (+ optional account prefix) + public key (not secret, sent as is) + a SEALED secret key token.
// The secret key is never returned, never logged, and never stored on the server: the browser holds only the sealed token (AES-256-GCM,
// key derived from CONFIG_SEAL_KEY with its own label + AAD, so it cannot be used as a Settings-account token or the other way round).
// =============================================================================
const crypto = require('crypto');
const router = require('express').Router();
const axios = require('axios');
const config = require('../config');
const accountConfig = require('../account-config');

const AAD = Buffer.from('cko-wallet-onboarding');
const MAX_TTL_H = 168;

// ── validation ───────────────────────────────────────────────────────────────────────────────────
const RE = {
    entity: /^ent_[a-z0-9]{20,40}$/,
    prefix: /^[a-z0-9]{1,24}$/,
    secretKey: /^sk_(sbox_)?[A-Za-z0-9_-]{16,}$/,
    publicKey: /^pk_(sbox_)?[A-Za-z0-9_-]{16,}$/,
    email: /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/,
    hostLabel: /^(?!-)[a-z0-9-]{1,63}(?<!-)$/,
};
function cleanHost(v) {
    let s = String(v || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/[/?#].*$/, '').replace(/:\d+$/, '').replace(/\.$/, '');
    if (!s) throw badRequest('domain is required');
    const labels = s.split('.');
    if (s.length > 253 || labels.length < 2 || !labels.every(l => RE.hostLabel.test(l))) throw badRequest(`"${s}" is not a valid domain name (use e.g. shop.example.com)`);
    if (/^\d+(\.\d+){3}$/.test(s)) throw badRequest('an IP address cannot be enrolled — use a domain name');
    return s;
}
function badRequest(message, status = 400) { return Object.assign(new Error(message), { status }); }
const mask = (v) => { const s = String(v || ''); const pre = (s.match(/^[a-z]+_(?:sbox_)?/i) || [''])[0]; const rest = s.slice(pre.length); return rest.length < 12 ? `${pre}••••••••` : `${pre}••••••••${rest.slice(-4)}`; };

// ── the allowlist: the ONLY upstream calls this module can make ──────────────────────────────────
const OPS = {
    'apple.enroll':      { method: 'POST', mutating: true,  build: (p) => ({ path: '/applepay/enrollments', body: { domain: cleanHost(p.domain) } }) },
    'apple.csr':         { method: 'POST', mutating: true,  build: (p) => {
        const v = p.protocol_version || 'ec_v1';
        if (!['ec_v1', 'rsa_v1'].includes(v)) throw badRequest('protocol_version must be ec_v1 or rsa_v1');
        return { path: '/applepay/signing-requests', body: { protocol_version: v } };
    } },
    'apple.certificate': { method: 'POST', mutating: true,  build: (p) => {
        const c = String(p.content || '').replace(/-----(BEGIN|END) [A-Z ]+-----/g, '').replace(/\s+/g, '');
        if (!c || c.length < 200 || c.length > 20000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(c)) throw badRequest('content must be the base64 text of the .cer certificate Apple gave you');
        return { path: '/applepay/certificates', body: { content: c } };
    } },
    'google.enroll':     { method: 'POST', mutating: true,  build: (p) => {
        if (!RE.entity.test(String(p.entity_id || ''))) throw badRequest('entity_id must look like ent_… (the Checkout.com entity to enroll)');
        if (!RE.email.test(String(p.email_address || ''))) throw badRequest('a valid email address is required (the person who accepts the Google terms)');
        if (p.accept_terms_of_service !== true) throw badRequest('the Google terms of service must be accepted');
        return { path: '/googlepay/enrollments', body: { entity_id: p.entity_id, email_address: String(p.email_address).trim(), accept_terms_of_service: true } };
    } },
    'google.domain':     { method: 'POST', mutating: true,  build: (p) => {
        if (!RE.entity.test(String(p.entity_id || ''))) throw badRequest('entity_id must look like ent_…');
        return { path: `/googlepay/enrollments/${p.entity_id}/domain`, body: { web_domain: cleanHost(p.web_domain) } };
    } },
    'google.state':      { method: 'GET',  mutating: false, build: (p) => {
        if (!RE.entity.test(String(p.entity_id || ''))) throw badRequest('entity_id must look like ent_…');
        return { path: `/googlepay/enrollments/${p.entity_id}/state` };
    } },
    'google.domains':    { method: 'GET',  mutating: false, build: (p) => {
        if (!RE.entity.test(String(p.entity_id || ''))) throw badRequest('entity_id must look like ent_…');
        return { path: `/googlepay/enrollments/${p.entity_id}/domains` };
    } },
};

// ── sealing (own key + AAD) ──────────────────────────────────────────────────────────────────────
function sealKey() {
    const k = process.env.CONFIG_SEAL_KEY;
    return k && k.length >= 16 ? crypto.createHash('sha256').update('cko-wallet-onboarding/v1:' + k).digest() : null;
}
const b64 = (b) => Buffer.from(b).toString('base64url');
function seal(payload) {
    const key = sealKey(); if (!key) throw badRequest('Sealing is not available: CONFIG_SEAL_KEY is not set on the server.', 503);
    const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', key, iv); c.setAAD(AAD);
    const ct = Buffer.concat([c.update(JSON.stringify(payload), 'utf8'), c.final()]);
    return ['w1', b64(iv), b64(ct), b64(c.getAuthTag())].join('.');
}
function unseal(token) {
    const key = sealKey(); if (!key) throw badRequest('Sealing is not available on the server.', 503);
    const [v, iv, ct, tag] = String(token || '').split('.');
    if (v !== 'w1' || !iv || !ct || !tag) throw badRequest('This saved secret key is not valid any more — re-enter it.', 401);
    try {
        const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url')); d.setAAD(AAD); d.setAuthTag(Buffer.from(tag, 'base64url'));
        const p = JSON.parse(Buffer.concat([d.update(Buffer.from(ct, 'base64url')), d.final()]).toString('utf8'));
        if (p.kind !== 'wallet-onboarding') throw new Error('wrong kind');
        if (!(p.exp > Date.now())) throw badRequest('The saved secret key has expired — re-enter it.', 401);
        return p;
    } catch (e) { if (e.status) throw e; throw badRequest('This saved secret key could not be opened — re-enter it.', 401); }
}

// ── which account + credentials this request uses ────────────────────────────────────────────────
const baseUrl = (environment, prefix) => `https://${prefix ? prefix + '.' : ''}api.${environment === 'production' ? '' : 'sandbox.'}checkout.com`;
function resolve(profile, auth) {
    const p = profile && typeof profile === 'object' ? profile : { kind: 'default' };
    const which = auth === 'public' ? 'public' : 'secret';
    if (p.kind !== 'merchant') {                                                                   // default: Settings account → else the server's own
        const key = which === 'public' ? config.pk : config.sk;
        if (!key) throw badRequest(`No ${which} key is configured for the default account.`, 400);
        return { base: accountConfig.gwUrl(), key, which, environment: /sandbox/.test(accountConfig.gwUrl()) ? 'sandbox' : 'production', account: 'default account' };
    }
    const environment = p.environment === 'production' ? 'production' : 'sandbox';
    const prefix = p.prefix ? String(p.prefix).trim().toLowerCase() : '';
    if (prefix && !RE.prefix.test(prefix)) throw badRequest('The account prefix may only contain lowercase letters and digits.');
    let key;
    if (which === 'public') {
        key = String(p.publicKey || '').trim();
        if (!RE.publicKey.test(key)) throw badRequest('This merchant has no valid public key (pk_…) saved.');
    } else {
        const t = unseal(p.token);
        if (t.environment !== environment) throw badRequest('The saved secret key was stored for another environment — re-enter it.', 401);
        key = t.secretKey;
    }
    if ((environment === 'sandbox') !== /^(sk|pk)_sbox_/.test(key)) throw badRequest(`This ${which} key does not belong to the ${environment} environment.`);
    return { base: baseUrl(environment, prefix), key, which, environment, account: prefix ? `merchant ${prefix}` : 'merchant account' };
}

// ── routes ────────────────────────────────────────────────────────────────────────────────────────
const fail = (res, e) => res.status(e.status || 500).json({ error: e.message || 'Request failed' });

router.get('/config', (_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({
        sealingAvailable: !!sealKey(),
        default: {
            source: accountConfig.isCustomActive() && accountConfig.customValue('secretKey') ? 'settings-account' : 'server-default',
            secretKey: config.sk ? { set: true, masked: mask(config.sk) } : { set: false },
            publicKey: config.pk || '',
            environment: /sandbox/.test(accountConfig.gwUrl() || '') ? 'sandbox' : 'production',
        },
    });
});

router.post('/seal', (req, res) => {
    try {
        const { secretKey, environment, ttlHours } = req.body || {};
        const env = environment === 'production' ? 'production' : 'sandbox';
        const key = String(secretKey || '').trim();
        if (!RE.secretKey.test(key)) throw badRequest('That does not look like a Checkout.com secret key (sk_…).');
        if ((env === 'sandbox') !== /^sk_sbox_/.test(key)) throw badRequest(`This secret key does not belong to the ${env} environment.`);
        const hours = Math.min(MAX_TTL_H, Math.max(1, parseInt(ttlHours, 10) || 24));
        const exp = Date.now() + hours * 3600 * 1000;
        res.json({ token: seal({ kind: 'wallet-onboarding', iat: Date.now(), exp, environment: env, secretKey: key }), expiresAt: exp, masked: mask(key), environment: env });
    } catch (e) { fail(res, e); }
});

router.post('/call', async (req, res) => {
    const t0 = Date.now();
    try {
        const { op, params, profile, auth, confirmProduction } = req.body || {};
        const def = OPS[op];
        if (!def) throw badRequest('Unknown operation.');
        const built = def.build(params || {});
        const cred = resolve(profile, auth);
        if (cred.environment === 'production' && def.mutating && confirmProduction !== true) throw badRequest('This changes a PRODUCTION account — confirm it first.', 400);
        const url = `${cred.base}${built.path}`;
        const r = await axios({ method: def.method, url, data: built.body, headers: { Authorization: `Bearer ${cred.key}`, 'Content-Type': 'application/json' }, validateStatus: () => true, timeout: 20000 });
        res.status(r.status === 204 ? 200 : r.status).json({
            upstream: `${def.method} ${url}`, upstream_status: r.status, cko_request_id: r.headers['cko-request-id'] || null, duration_ms: Date.now() - t0,
            environment: cred.environment, account: cred.account, auth: `${cred.which} key ${mask(cred.key)}`,
            request: { method: def.method, url, ...(built.body ? { body: built.body } : {}) },
            data: r.data === '' ? null : r.data,
        });
    } catch (e) {
        if (e.status) return fail(res, e);
        console.log('[wallet-onboarding] upstream call failed:', e.message);
        res.status(502).json({ upstream_status: 0, duration_ms: Date.now() - t0, error: 'Could not reach Checkout.com: ' + (e.message || 'network error') });
    }
});

router.post('/inspect-cert', (req, res) => {
    try {
        const raw = String((req.body || {}).content || '').trim();
        if (!raw) throw badRequest('content is required');
        const b64body = raw.replace(/-----(BEGIN|END) [A-Z ]+-----/g, '').replace(/\s+/g, '');
        const cert = new crypto.X509Certificate(Buffer.from(b64body, 'base64'));
        const parts = Object.fromEntries(cert.subject.split('\n').map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; }));
        const merchantId = parts.UID || (String(parts.CN || '').match(/merchant\.[A-Za-z0-9.\-_]+/) || [''])[0] || null;
        const type = cert.publicKey.asymmetricKeyType;
        res.json({
            merchantId, commonName: parts.CN || null, organisation: parts.O || null, subject: cert.subject.split('\n').join(', '), issuer: cert.issuer.split('\n').find(l => l.startsWith('CN=')) || null,
            validFrom: cert.validFrom, validTo: cert.validTo, validToIso: new Date(cert.validTo).toISOString(), isExpired: new Date(cert.validTo) < new Date(),
            keyType: type, protocolVersion: type === 'rsa' ? 'rsa_v1' : type === 'ec' ? 'ec_v1' : null, isPaymentProcessing: /Payment Processing/i.test(parts.CN || ''),
            content: b64body,
        });
    } catch (e) { res.status(e.status || 422).json({ error: e.status ? e.message : 'This does not look like an Apple certificate (.cer / PEM). Upload the file Apple let you download.' }); }
});

module.exports = router;
module.exports._test = { cleanHost, OPS, seal, unseal, resolve };
