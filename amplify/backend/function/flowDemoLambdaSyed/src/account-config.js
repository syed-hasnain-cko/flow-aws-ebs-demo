'use strict';
// =============================================
// Account configuration — lets a visitor test THEIR OWN Checkout.com account from the Settings page.
//
// How it works
//   - Settings → POST /account/seal: the visitor's values are validated, sealed with AES-256-GCM (key = CONFIG_SEAL_KEY, a server-side
//     environment variable) into an opaque, expiring token and returned. Nothing is stored on the server.
//   - The browser keeps only that token and sends it as `Authorization: Bearer acct.<token>` on every call to this API.
//   - middleware() opens the token for the duration of ONE request (AsyncLocalStorage) and every credential read in the backend resolves
//     "custom value if the visitor set one, otherwise the server's env default" — field by field.
//   - Existing code keeps reading `config.sk`, `config.pk`, `config.processingChannelId`… (they are now request-aware getters), and uses
//     gwUrl() / getCko() / webhookSecrets() from here instead of process.env.GW_URL / a module-level SDK client.
//
// Safety rules enforced here
//   - Raw secrets are never returned by any route (only masked values) and never logged.
//   - Base URLs must be https://…checkout.com hosts (otherwise the backend could be pointed — with the visitor's key attached — at any host).
//   - Field formats are validated; unknown fields are ignored.
//   - Without CONFIG_SEAL_KEY sealing is refused (503) and everything keeps using the env defaults.
//   - A token can't be revoked before it expires (it is stateless) — keep the TTL short.
// =============================================

const { AsyncLocalStorage } = require('async_hooks');
const crypto = require('crypto');
const axios = require('axios');
const express = require('express');
const { Checkout } = require('checkout-sdk-node');

const als = new AsyncLocalStorage();
const AAD = Buffer.from('cko-account-config');

// ── field catalogue ───────────────────────────────────────────────────────────────────────────
const FIELDS = {
    secretKey:           { label: 'Secret API key',               secret: true,  pattern: /^sk_[A-Za-z0-9_-]{16,}$/,        hint: 'sk_sbox_…' },
    publicKey:           { label: 'Public key',                   secret: false, pattern: /^pk_[A-Za-z0-9_-]{16,}$/,        hint: 'pk_sbox_… (needed by Flow / wallets)' },
    processingChannelId: { label: 'Processing channel ID',        secret: false, pattern: /^pc_[a-z0-9]{20,}$/,             hint: 'pc_…' },
    currencyAccountId:   { label: 'Currency account ID',          secret: false, pattern: /^ca_[a-z0-9]{20,}$/,             hint: 'ca_… (payouts)' },
    gwUrl:               { label: 'API base URL',                 secret: false, kind: 'gwUrl',                              hint: 'https://[prefix.]api.sandbox.checkout.com' },
    accessKeyId:         { label: 'Access key ID',                secret: false, pattern: /^ack_[A-Za-z0-9_-]{8,}$/,        hint: 'ack_… (OAuth)' },
    accessKeySecret:     { label: 'Access key secret',            secret: true,  pattern: /^[\x21-\x7E]{8,200}$/,           hint: 'OAuth client secret' },
    accessUrl:           { label: 'Access (OAuth) token URL',     secret: false, kind: 'accessUrl',                          hint: 'https://[prefix.]access.sandbox.checkout.com/connect/token' },
    webhookSecret:       { label: 'Webhook authorization secret', secret: true,  pattern: /^[\x21-\x7E]{4,200}$/,           hint: 'the Authorization header value your workflow sends' },
};

// ── defaults (the server's env values) + request-aware getters ──────────────────────────────────
let base = {};
const ctx = () => als.getStore();
const custom = (k) => ctx()?.cfg?.[k];
const effective = (k) => custom(k) || base[k] || '';

function install(config) {
    base = {
        secretKey: config.sk, publicKey: config.pk, processingChannelId: config.processingChannelId, currencyAccountId: config.currencyAccountId,
        accessKeyId: config.ckoAccessKeyId, accessKeySecret: config.ckoAccessKeySecret, accessUrl: config.ckoAccessUrl,
        gwUrl: process.env.GW_URL, webhookSecret: process.env.WEBHOOK_SECRET,
    };
    const map = { sk: 'secretKey', pk: 'publicKey', processingChannelId: 'processingChannelId', currencyAccountId: 'currencyAccountId', ckoAccessKeyId: 'accessKeyId', ckoAccessKeySecret: 'accessKeySecret', ckoAccessUrl: 'accessUrl' };
    Object.entries(map).forEach(([prop, field]) => {
        Object.defineProperty(config, prop, { configurable: true, enumerable: true, get: () => effective(field), set: (v) => { base[field] = v; } });
    });
    return config;
}

const gwUrl = () => effective('gwUrl');
const customValue = (k) => custom(k) || '';           // the visitor's own value for a field on THIS request ('' when they use the server default)
const isCustomActive = () => !!ctx()?.cfg;

// ── webhook secrets: the default one plus those of accounts currently being tested ────────────────
const webhookRegistry = new Map();                                     // secret → expiry ms (kept in this container's memory only)
function registerWebhook(secret, until) {
    if (!secret) return;
    webhookRegistry.set(secret, until || Date.now() + 8 * 3600 * 1000);
    if (webhookRegistry.size > 50) [...webhookRegistry.keys()].slice(0, webhookRegistry.size - 50).forEach(k => webhookRegistry.delete(k));
}
// While any custom account is active (sealed or used recently) incoming webhooks are accepted WITHOUT checking the
// secret: a custom account's webhooks are signed/authorised for its own processing channel, which this app can't know.
const customSeen = new Map();                                            // token tail → expiry ms (this container only)
function markCustom(until) {
    customSeen.set(String(until), until || Date.now() + 8 * 3600 * 1000);
    if (customSeen.size > 50) customSeen.delete(customSeen.keys().next().value);
}
function customAccountActive() {
    const now = Date.now(); let any = false;
    for (const [k, exp] of customSeen) { if (exp > now) any = true; else customSeen.delete(k); }
    return any;
}
function webhookSecrets() {
    const now = Date.now(), out = [base.webhookSecret];
    for (const [s, exp] of webhookRegistry) { if (exp > now) out.push(s); else webhookRegistry.delete(s); }
    return out.filter(Boolean);
}

// ── Checkout SDK client per credential set ────────────────────────────────────────────────────────
const clients = new Map();
function subdomainOf(url) { const m = String(url || '').match(/^https:\/\/([a-z0-9]+)\.api\.(?:sandbox\.)?checkout\.com\/?$/i); return m ? m[1].toLowerCase() : null; }
function getCko(config) {
    const c = config || require('./config');
    const sub = custom('gwUrl') ? subdomainOf(custom('gwUrl')) : null;          // defaults keep today's behaviour exactly
    const key = `${c.sk}|${c.pk}|${sub || ''}`;
    if (!clients.has(key)) clients.set(key, new Checkout(c.sk, { pk: c.pk, timeout: 10000, ...(sub ? { subdomain: sub } : {}) }));
    if (clients.size > 20) clients.delete(clients.keys().next().value);
    return clients.get(key);
}

// ── sealing ───────────────────────────────────────────────────────────────────────────────────────
const b64 = (b) => Buffer.from(b).toString('base64url');
function sealKey() {
    const k = process.env.CONFIG_SEAL_KEY;
    return k && k.length >= 16 ? crypto.createHash('sha256').update('cko-account-config/v1:' + k).digest() : null;
}
function seal(payload) {
    const key = sealKey(); if (!key) throw Object.assign(new Error('CONFIG_SEAL_KEY is not set on the server'), { status: 503 });
    const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', key, iv);
    c.setAAD(AAD);
    const ct = Buffer.concat([c.update(JSON.stringify(payload), 'utf8'), c.final()]);
    return ['v1', b64(iv), b64(ct), b64(c.getAuthTag())].join('.');
}
function unseal(token) {
    const key = sealKey(); if (!key) throw new Error('no key');
    const [v, iv, ct, tag] = String(token).split('.');
    if (v !== 'v1' || !iv || !ct || !tag) throw new Error('bad token');
    const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
    d.setAAD(AAD); d.setAuthTag(Buffer.from(tag, 'base64url'));
    return JSON.parse(Buffer.concat([d.update(Buffer.from(ct, 'base64url')), d.final()]).toString('utf8'));
}

// ── validation ────────────────────────────────────────────────────────────────────────────────────
function validateUrl(kind, v) {
    let u; try { u = new URL(v); } catch (e) { return 'not a valid URL'; }
    if (u.protocol !== 'https:') return 'must start with https://';
    if (u.username || u.password || u.port) return 'must not contain credentials or a port';
    const h = u.hostname.toLowerCase();
    if (kind === 'gwUrl') {
        if (!/^([a-z0-9]+\.)?api\.(sandbox\.)?checkout\.com$/.test(h)) return 'must be https://[prefix.]api.sandbox.checkout.com (or api.checkout.com)';
        if (u.pathname !== '/' && u.pathname !== '') return 'must not contain a path';
        return null;
    }
    if (!/^([a-z0-9]+\.)?access\.(sandbox\.)?checkout\.com$/.test(h)) return 'must be https://[prefix.]access.sandbox.checkout.com/connect/token';
    if (u.pathname !== '/connect/token') return 'the path must be /connect/token';
    return null;
}
const normalize = (k, v) => (FIELDS[k].kind === 'gwUrl' ? v.replace(/\/+$/, '') : v);
function validate(input) {
    const clean = {}, errors = {};
    Object.entries(input || {}).forEach(([k, raw]) => {
        const f = FIELDS[k]; if (!f || typeof raw !== 'string') return;
        const v = raw.trim(); if (!v) return;
        const err = f.kind ? validateUrl(f.kind, v) : (f.pattern.test(v) ? null : `unexpected format (expected ${f.hint})`);
        if (err) errors[k] = err; else clean[k] = normalize(k, v);
    });
    return { clean, errors };
}

// ── masking: only a prefix and the last 4 characters are ever shown ───────────────────────────────
function mask(k, v) {
    if (!v) return '';
    const s = String(v), f = FIELDS[k];
    if (f.kind) {
        try { const u = new URL(s); const parts = u.hostname.split('.'); if (parts[0] !== 'api' && parts[0] !== 'access') parts[0] = '••••' + parts[0].slice(-4); return `${u.protocol}//${parts.join('.')}${u.pathname === '/' ? '' : u.pathname}`; }
        catch (e) { return '••••'; }
    }
    const pre = (s.match(/^[a-z]+_(?:sbox_)?/i) || [''])[0], rest = s.slice(pre.length);
    return rest.length < 12 ? `${pre}••••••••` : `${pre}••••••••${rest.slice(-4)}`;
}
const maskedSet = (get) => Object.fromEntries(Object.keys(FIELDS).map(k => { const v = get(k); return [k, v ? { set: true, masked: mask(k, v) } : { set: false }]; }));

// ── middleware: open the token for this request only ──────────────────────────────────────────────
function middleware(req, res, next) {
    const m = String(req.headers.authorization || '').match(/^Bearer acct\.(.+)$/);
    if (!m) return next();
    res.setHeader('Access-Control-Expose-Headers', 'x-account-config');
    let p = null, status = 'invalid';
    try { p = unseal(m[1]); status = p.exp > Date.now() ? 'ok' : 'expired'; } catch (e) { /* tampered / wrong key / no key */ }
    if (status !== 'ok') { res.setHeader('x-account-config', status); return next(); }       // fall back to the env defaults and tell the browser
    res.setHeader('x-account-config', 'active');
    if (p.cfg.webhookSecret) registerWebhook(p.cfg.webhookSecret, p.exp);
    markCustom(p.exp);
    als.run({ cfg: p.cfg, exp: p.exp }, next);
}

// ── routes (mounted at /account) ──────────────────────────────────────────────────────────────────
const router = express.Router();
const fieldList = () => Object.entries(FIELDS).map(([key, f]) => ({ key, label: f.label, secret: f.secret, hint: f.hint, url: !!f.kind }));

router.get('/config', (_req, res) => {
    const cfg = ctx()?.cfg || {};
    res.json({
        sealingAvailable: !!sealKey(),
        active: isCustomActive(), expiresAt: ctx()?.exp || null,
        fields: fieldList(),
        defaults: maskedSet(k => base[k]),
        custom: maskedSet(k => cfg[k]),
        effective: Object.fromEntries(Object.keys(FIELDS).map(k => [k, cfg[k] ? 'custom' : (base[k] ? 'default' : 'unset')])),
    });
});

// merge the visitor's change into whatever custom config is already active
function nextConfig(req) {
    const current = { ...(ctx()?.cfg || {}) };
    const { set, clear } = req.body || {};
    (Array.isArray(clear) ? clear : []).forEach(k => { if (k in FIELDS) delete current[k]; });
    const { clean, errors } = validate(set);
    return { merged: { ...current, ...clean }, errors };
}

router.post('/seal', (req, res) => {
    if (!sealKey()) return res.status(503).json({ error: 'Custom account configuration is not available: CONFIG_SEAL_KEY is not set on the server.' });
    const { merged, errors } = nextConfig(req);
    if (Object.keys(errors).length) return res.status(422).json({ errors });
    if (!Object.keys(merged).length) return res.json({ token: null, active: false });          // everything back to defaults
    const hours = Math.min(168, Math.max(1, parseInt(req.body?.ttlHours, 10) || 8));
    const exp = Date.now() + hours * 3600 * 1000;
    const token = seal({ v: 1, iat: Date.now(), exp, cfg: merged });
    registerWebhook(merged.webhookSecret, exp);
    markCustom(exp);
    res.json({
        token, expiresAt: exp, active: true, custom: maskedSet(k => merged[k]),
        // non-secret values the browser needs to initialise Flow / wallets for this account
        publicValues: { publicKey: merged.publicKey || null, processingChannelId: merged.processingChannelId || null, currencyAccountId: merged.currencyAccountId || null },
    });
});

// Try the credentials without saving anything. Only the secret key and the OAuth client can be proven by a real call.
router.post('/test', async (req, res) => {
    const { merged, errors } = nextConfig(req);
    if (Object.keys(errors).length) return res.status(422).json({ errors });
    const get = (k) => merged[k] || base[k] || '';
    const results = [];
    const gw = get('gwUrl') || 'https://api.sandbox.checkout.com';
    if (get('secretKey')) {
        try {
            const r = await axios.get(`${gw}/payments/pay_${'0'.repeat(26)}`, { headers: { Authorization: `Bearer ${get('secretKey')}` }, validateStatus: () => true, timeout: 9000 });
            results.push({ check: 'secretKey', ok: r.status === 404, detail: r.status === 404 ? 'accepted by Checkout.com' : r.status === 401 ? 'rejected (401) — wrong key, or a key from another environment than the base URL' : r.status === 403 ? 'accepted, but this key lacks payment scopes (403)' : `unexpected answer (HTTP ${r.status})` });
        } catch (e) { results.push({ check: 'secretKey', ok: false, detail: 'could not reach the API base URL' }); }
    }
    if (get('accessKeyId') && get('accessKeySecret') && get('accessUrl')) {
        try {
            const body = new URLSearchParams({ grant_type: 'client_credentials', client_id: get('accessKeyId'), client_secret: get('accessKeySecret'), scope: 'gateway' });
            const r = await axios.post(get('accessUrl'), body.toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, validateStatus: () => true, timeout: 9000 });
            const err = r.data?.error;
            results.push({ check: 'accessKey', ok: r.status === 200 || err === 'invalid_scope', detail: r.status === 200 ? 'access token issued' : err === 'invalid_scope' ? 'client authenticated (scope “gateway” not granted — expected for some clients)' : err === 'invalid_client' || r.status === 401 ? 'rejected — wrong key id / secret / URL' : `unexpected answer (HTTP ${r.status}${err ? ', ' + err : ''})` });
        } catch (e) { results.push({ check: 'accessKey', ok: false, detail: 'could not reach the access URL' }); }
    }
    ['publicKey', 'processingChannelId', 'currencyAccountId', 'webhookSecret'].forEach(k => { if (merged[k]) results.push({ check: k, ok: true, detail: 'format valid (cannot be proven by an API call)', neutral: true }); });
    res.json({ results });
});

module.exports = { install, middleware, router, gwUrl, customValue, getCko, webhookSecrets, customAccountActive, isCustomActive, FIELDS, _test: { seal, unseal, validate, mask } };
