'use strict';
// =============================================================================
// Test data generator — creates sample SANDBOX transactions for an account, one allowlisted Checkout.com call per request.
// The browser decides WHAT to generate and runs the batch (live progress, Stop); this file only validates + forwards each call.
//
//   GET  /testdata/config   what the default account looks like (masked), its processing channel / currency account, whether sealing works
//   POST /testdata/seal     seal a merchant's SECRET key server-side → opaque token the browser keeps instead of the key
//   POST /testdata/call     run ONE allowlisted operation for a profile:
//
//   payment        POST /payments                       card payment: CIT one-off / CIT recurring setup (stored) / MIT recurring|unscheduled
//   capture        POST /payments/{id}/captures         later capture of an authorized-only payment
//   void           POST /payments/{id}/voids
//   refund         POST /payments/{id}/refunds          full, or partial with an amount
//   token          POST /tokens                         card token for a Pay-to-Card destination (PUBLIC key — no Flow widget needed)
//   payout_card    POST /payments                       Pay to Card:  source currency_account → destination token
//   payout_bank    POST /payments                       Pay to Bank:  source currency_account → destination bank_account
//   dispute_lookup GET  /disputes?payment_id=…          has the sandbox raised the dispute yet?
//
// SANDBOX ONLY: the call is refused unless the gateway URL and the key are sandbox ones. Nothing here can touch a live account.
// Credentials, like the Wallet Onboarding tab:
//   profile.kind "default"  → the visitor's Settings account if they set one, else the server's own account (nothing sent from the browser)
//   profile.kind "merchant" → optional account prefix + public key (not secret, sent as is) + a SEALED secret key token
// The secret key is never returned, never logged and never stored on the server: AES-256-GCM, key derived from CONFIG_SEAL_KEY with
// its own label + AAD, so a token from here cannot be used by Settings / Wallet Onboarding and the other way round.
// =============================================================================
const crypto = require('crypto');
const router = require('express').Router();
const axios = require('axios');
const config = require('../config');
const accountConfig = require('../account-config');

const AAD = Buffer.from('cko-testdata');
const MAX_TTL_H = 168;

// ── validation ───────────────────────────────────────────────────────────────────────────────────
const RE = {
    pc: /^pc_[a-z0-9]{20,40}$/, ca: /^ca_[a-z0-9]{20,40}$/, pay: /^pay_[a-z0-9]{20,40}$/, tok: /^tok_[a-z0-9]{20,40}$/,
    prefix: /^[a-z0-9]{1,24}$/,
    secretKey: /^sk_sbox_[A-Za-z0-9_-]{16,}$/,
    publicKey: /^pk_sbox_[A-Za-z0-9_-]{16,}$/,
    pan: /^\d{12,19}$/, cvv: /^\d{3,4}$/, ccy: /^[A-Z]{3}$/, country: /^[A-Z]{2}$/,
    ref: /^[A-Za-z0-9 _#.:@/-]{1,50}$/, text: /^[\p{L}\p{N} .,'’&_@/-]{1,60}$/u,
    email: /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/,
    idem: /^[A-Za-z0-9_-]{8,64}$/,
    iban: /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/, bic: /^[A-Z0-9]{8}([A-Z0-9]{3})?$/, fft: /^[A-Z0-9]{2,3}$/,
};
function badRequest(message, status = 400) { return Object.assign(new Error(message), { status }); }
const mask = (v) => { const s = String(v || ''); const pre = (s.match(/^[a-z]+_(?:sbox_)?/i) || [''])[0]; const rest = s.slice(pre.length); return rest.length < 12 ? `${pre}••••••••` : `${pre}${rest.slice(0, 4)}••••${rest.slice(-4)}`; };
const maskPan = (n) => { const s = String(n || ''); return s.length < 10 ? '••••' : `${s.slice(0, 6)}••••${s.slice(-4)}`; };

function need(re, v, what) { const s = String(v === undefined || v === null ? '' : v).trim(); if (!re.test(s)) throw badRequest(`${what} is missing or not valid.`); return s; }
function amount(v, what = 'amount') {
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1 || n > 100000000) throw badRequest(`${what} must be a whole number of minor units between 1 and 100,000,000.`);
    return n;
}
function cardSource(c) {
    if (!c || typeof c !== 'object') throw badRequest('card details are required.');
    const m = Number(c.expiry_month), y = Number(c.expiry_year);
    if (!Number.isInteger(m) || m < 1 || m > 12) throw badRequest('card expiry_month must be 1–12.');
    if (!Number.isInteger(y) || y < 2024 || y > 2100) throw badRequest('card expiry_year must be a 4-digit year.');
    return { number: need(RE.pan, c.number, 'card number'), expiry_month: m, expiry_year: y, cvv: need(RE.cvv, c.cvv, 'card cvv') };
}
function customer(c) {
    if (!c) return undefined;
    const out = {};
    if (c.name) out.name = need(RE.text, c.name, 'customer name');
    if (c.email) out.email = need(RE.email, c.email, 'customer email');
    return Object.keys(out).length ? out : undefined;
}
function tags(m) {                       // only what the generator itself sets — never arbitrary metadata
    if (!m || typeof m !== 'object') return undefined;
    const out = {};
    if (m.generator) out.generator = String(m.generator).slice(0, 40).replace(/[^A-Za-z0-9 _.-]/g, '');
    if (m.batch) out.batch = String(m.batch).slice(0, 40).replace(/[^A-Za-z0-9 _.-]/g, '');
    if (m.kind) out.kind = String(m.kind).slice(0, 40).replace(/[^A-Za-z0-9 _.-]/g, '');
    return Object.keys(out).length ? out : undefined;
}
const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

// ── the allowlist: the ONLY upstream calls this module can make ──────────────────────────────────
const OPS = {
    payment: { method: 'POST', auth: 'secret', build: (p) => {
        const type = p.payment_type || 'Regular';
        if (!['Regular', 'Recurring', 'Unscheduled'].includes(type)) throw badRequest('payment_type must be Regular, Recurring or Unscheduled.');
        const mit = p.merchant_initiated === true;
        const body = clean({
            source: clean({ type: 'card', ...cardSource(p.card), name: p.card_name ? need(RE.text, p.card_name, 'cardholder name') : undefined, stored: p.stored === true ? true : undefined }),
            amount: amount(p.amount), currency: need(RE.ccy, p.currency, 'currency'),
            reference: need(RE.ref, p.reference, 'reference'),
            payment_type: type, capture: p.capture !== false,
            processing_channel_id: need(RE.pc, p.processing_channel_id, 'processing channel'),
            '3ds': { enabled: false },                                                  // nobody is there to complete a challenge
            merchant_initiated: mit ? true : undefined,
            previous_payment_id: p.previous_payment_id ? need(RE.pay, p.previous_payment_id, 'previous_payment_id') : undefined,
            customer: customer(p.customer), metadata: tags(p.metadata),
            processing: p.pan_preference === 'fpan' ? { pan_preference: 'fpan' } : undefined,   // use the real test card number, not a network token (needed for the card-number decline simulation on accounts with network tokens)
        });
        if (mit && type === 'Regular') throw badRequest('A merchant-initiated payment must be Recurring or Unscheduled.');
        return { path: '/payments', body };
    } },
    capture: { method: 'POST', auth: 'secret', build: (p) => ({ path: `/payments/${need(RE.pay, p.payment_id, 'payment_id')}/captures`, body: clean({ amount: p.amount ? amount(p.amount) : undefined, reference: p.reference ? need(RE.ref, p.reference, 'reference') : undefined }) }) },
    void:    { method: 'POST', auth: 'secret', build: (p) => ({ path: `/payments/${need(RE.pay, p.payment_id, 'payment_id')}/voids`, body: clean({ reference: p.reference ? need(RE.ref, p.reference, 'reference') : undefined }) }) },
    refund:  { method: 'POST', auth: 'secret', build: (p) => ({ path: `/payments/${need(RE.pay, p.payment_id, 'payment_id')}/refunds`, body: clean({ amount: p.amount ? amount(p.amount) : undefined, reference: p.reference ? need(RE.ref, p.reference, 'reference') : undefined }) }) },
    token:   { method: 'POST', auth: 'public', build: (p) => ({ path: '/tokens', body: clean({ type: 'card', ...cardSource(p.card), name: p.card_name ? need(RE.text, p.card_name, 'cardholder name') : undefined }) }) },
    payout_card: { method: 'POST', auth: 'secret', build: (p) => {
        const h = p.account_holder || {};
        return { path: '/payments', body: clean({
            source: { type: 'currency_account', id: need(RE.ca, p.currency_account_id, 'currency account') },
            destination: { type: 'token', token: need(RE.tok, p.token, 'card token'),
                account_holder: clean({ type: 'individual', first_name: need(RE.text, h.first_name, 'first name'), last_name: need(RE.text, h.last_name, 'last name'),
                    billing_address: { country: need(RE.country, h.country, 'country') } }) },
            amount: amount(p.amount), currency: need(RE.ccy, p.currency, 'currency'),
            reference: need(RE.ref, p.reference, 'reference'),
            instruction: { funds_transfer_type: need(RE.fft, p.funds_transfer_type, 'funds transfer type') },
            processing_channel_id: need(RE.pc, p.processing_channel_id, 'processing channel'),
            metadata: tags(p.metadata),
        }) };
    } },
    payout_bank: { method: 'POST', auth: 'secret', build: (p) => {
        const h = p.account_holder || {}, d = p.destination || {};
        const iban = String(d.iban || '').replace(/\s+/g, '').toUpperCase();
        if (!RE.iban.test(iban)) throw badRequest('destination IBAN is missing or not valid.');
        return { path: '/payments', body: clean({
            source: { type: 'currency_account', id: need(RE.ca, p.currency_account_id, 'currency account') },
            destination: clean({ type: 'bank_account', country: need(RE.country, d.country, 'destination country'), account_type: ['savings', 'current', 'cash'].includes(d.account_type) ? d.account_type : 'current',
                iban, swift_bic: d.swift_bic ? need(RE.bic, String(d.swift_bic).toUpperCase(), 'swift_bic') : undefined,
                account_holder: { type: 'individual', first_name: need(RE.text, h.first_name, 'first name'), last_name: need(RE.text, h.last_name, 'last name'),
                    billing_address: clean({ address_line1: need(RE.text, h.address_line1, 'address line 1'), city: need(RE.text, h.city, 'city'), zip: need(RE.text, h.zip, 'zip'), country: need(RE.country, h.country, 'country') }) } }),
            amount: amount(p.amount), currency: need(RE.ccy, p.currency, 'currency'),
            reference: need(RE.ref, p.reference, 'reference'),
            billing_descriptor: { reference: String(p.descriptor || 'TestPayout').replace(/[^A-Za-z0-9 ]/g, '').slice(0, 11) || 'TestPayout' },
            processing_channel_id: need(RE.pc, p.processing_channel_id, 'processing channel'),
            metadata: tags(p.metadata),
        }) };
    } },
    dispute_lookup: { method: 'GET', auth: 'secret', build: (p) => ({ path: `/disputes?payment_id=${need(RE.pay, p.payment_id, 'payment_id')}&limit=1` }) },
};

// ── sealing (own key + AAD) ──────────────────────────────────────────────────────────────────────
function sealKey() {
    const k = process.env.CONFIG_SEAL_KEY;
    return k && k.length >= 16 ? crypto.createHash('sha256').update('cko-testdata/v1:' + k).digest() : null;
}
const b64 = (b) => Buffer.from(b).toString('base64url');
function seal(payload) {
    const key = sealKey(); if (!key) throw badRequest('Sealing is not available: CONFIG_SEAL_KEY is not set on the server.', 503);
    const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', key, iv); c.setAAD(AAD);
    const ct = Buffer.concat([c.update(JSON.stringify(payload), 'utf8'), c.final()]);
    return ['d1', b64(iv), b64(ct), b64(c.getAuthTag())].join('.');
}
function unseal(token) {
    const key = sealKey(); if (!key) throw badRequest('Sealing is not available on the server.', 503);
    const [v, iv, ct, tag] = String(token || '').split('.');
    if (v !== 'd1' || !iv || !ct || !tag) throw badRequest('This saved secret key is not valid any more — re-enter it.', 401);
    try {
        const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url')); d.setAAD(AAD); d.setAuthTag(Buffer.from(tag, 'base64url'));
        const p = JSON.parse(Buffer.concat([d.update(Buffer.from(ct, 'base64url')), d.final()]).toString('utf8'));
        if (p.kind !== 'testdata') throw new Error('wrong kind');
        if (!(p.exp > Date.now())) throw badRequest('The saved secret key has expired — re-enter it.', 401);
        return p;
    } catch (e) { if (e.status) throw e; throw badRequest('This saved secret key could not be opened — re-enter it.', 401); }
}

// ── which account + credentials this request uses (sandbox only) ─────────────────────────────────
const baseUrl = (prefix) => `https://${prefix ? prefix + '.' : ''}api.sandbox.checkout.com`;
function resolve(profile, auth) {
    const p = profile && typeof profile === 'object' ? profile : { kind: 'default' };
    const which = auth === 'public' ? 'public' : 'secret';
    if (p.kind !== 'merchant') {                                                                   // default: Settings account → else the server's own
        const key = which === 'public' ? config.pk : config.sk;
        if (!key) throw badRequest(`No ${which} key is configured for the default account.`);
        const base = accountConfig.gwUrl();
        if (!/sandbox/.test(String(base || '')) || !/^(sk|pk)_sbox_/.test(String(key))) throw badRequest('Test data can only be generated in a SANDBOX account — this account is not one.', 403);
        return { base, key, which, account: 'default account' };
    }
    const prefix = p.prefix ? String(p.prefix).trim().toLowerCase() : '';
    if (prefix && !RE.prefix.test(prefix)) throw badRequest('The account prefix may only contain lowercase letters and digits.');
    let key;
    if (which === 'public') {
        key = String(p.publicKey || '').trim();
        if (!RE.publicKey.test(key)) throw badRequest('This merchant has no valid sandbox public key (pk_sbox_…) saved — it is needed to create card tokens for Pay to Card.');
    } else {
        key = unseal(p.token).secretKey;
        if (!RE.secretKey.test(key)) throw badRequest('This secret key is not a sandbox key — test data can only be generated in the sandbox.', 403);
    }
    return { base: baseUrl(prefix), key, which, account: prefix ? `merchant ${prefix}` : 'merchant account' };
}

// ── routes ────────────────────────────────────────────────────────────────────────────────────────
const fail = (res, e) => res.status(e.status || 500).json({ error: e.message || 'Request failed' });

router.get('/config', (_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({
        sealingAvailable: !!sealKey(),
        default: {
            source: accountConfig.isCustomActive && accountConfig.isCustomActive() && accountConfig.customValue && accountConfig.customValue('secretKey') ? 'settings-account' : 'server-default',
            secretKey: config.sk ? { set: true, masked: mask(config.sk) } : { set: false },
            publicKey: config.pk || '',
            processingChannelId: config.processingChannelId || '',
            currencyAccountId: config.currencyAccountId || '',
            sandbox: /sandbox/.test(accountConfig.gwUrl() || '') && /^sk_sbox_/.test(String(config.sk || '')),
        },
    });
});

router.post('/seal', (req, res) => {
    try {
        const { secretKey, ttlHours } = req.body || {};
        const key = String(secretKey || '').trim();
        if (!/^sk_/.test(key)) throw badRequest('That does not look like a Checkout.com secret key (sk_…).');
        if (!RE.secretKey.test(key)) throw badRequest('Only SANDBOX secret keys (sk_sbox_…) can be used here — test data is never generated in a live account.', 403);
        const hours = Math.min(MAX_TTL_H, Math.max(1, parseInt(ttlHours, 10) || 24));
        const exp = Date.now() + hours * 3600 * 1000;
        res.json({ token: seal({ kind: 'testdata', iat: Date.now(), exp, secretKey: key }), expiresAt: exp, masked: mask(key) });
    } catch (e) { fail(res, e); }
});

router.post('/call', async (req, res) => {
    const t0 = Date.now();
    try {
        const { op, params, profile, idempotencyKey } = req.body || {};
        const def = Object.prototype.hasOwnProperty.call(OPS, op) ? OPS[op] : null;
        if (!def) throw badRequest('Unknown operation.');
        const built = def.build(params || {});
        const cred = resolve(profile, def.auth);
        const url = `${cred.base}${built.path}`;
        const headers = { Authorization: `Bearer ${cred.key}`, 'Content-Type': 'application/json' };
        if (idempotencyKey) headers['Cko-Idempotency-Key'] = need(RE.idem, idempotencyKey, 'idempotencyKey');
        const r = await axios({ method: def.method, url, data: def.method === 'GET' ? undefined : built.body, headers, validateStatus: () => true, timeout: 25000 });
        const shown = built.body ? JSON.parse(JSON.stringify(built.body)) : undefined;           // the request as shown to the visitor: the card number is masked
        if (shown && shown.source && shown.source.number) { shown.source.number = maskPan(shown.source.number); delete shown.source.cvv; }
        if (shown && shown.number) { shown.number = maskPan(shown.number); delete shown.cvv; }
        res.status(200).json({
            upstream: `${def.method} ${url}`, upstream_status: r.status, cko_request_id: r.headers['cko-request-id'] || null, duration_ms: Date.now() - t0,
            account: cred.account, auth: `${cred.which} key ${mask(cred.key)}`,
            request: { method: def.method, url, ...(shown ? { body: shown } : {}) },
            data: r.data === '' ? null : r.data,
        });
    } catch (e) {
        if (e.status) return fail(res, e);
        console.log('[testdata] upstream call failed:', e.message);
        res.status(502).json({ upstream_status: 0, duration_ms: Date.now() - t0, error: 'Could not reach Checkout.com: ' + (e.message || 'network error') });
    }
});

module.exports = router;
module.exports._test = { OPS, RE };
