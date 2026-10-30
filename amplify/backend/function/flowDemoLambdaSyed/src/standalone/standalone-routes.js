// =============================================
// Standalone Checkout Suite Routes
// Mounted at /standalone via router.use() in api-route-controller.js.
//
// Covers the standalone products that are testable on their own, outside a
// normal payment: Standalone 3DS (Sessions API), Network Tokens, the
// Standalone Account Updater, and instrument creation (used by the tab's
// "new card" flow to turn a Flow tokenization token into a reusable src_ id).
// Card Metadata and payment authorization deliberately reuse the existing
// /card-metadata and /payments routes — no duplicates.
//
// AUTH
//   The Sessions API requires an OAuth access token (scopes sessions:browser /
//   sessions:app). Every other endpoint here accepts the normal secret key, so
//   each route has a default auth mode, and the frontend can override it per
//   request with the `x-auth-mode: oauth|secret` header (the tab exposes this
//   as a toggle, so you can compare behaviour/scopes for the same call).
//
// RESPONSE ENVELOPE
//   Unlike older routes, these return a uniform envelope so the frontend can
//   log exactly what happened upstream (useful when troubleshooting):
//     { upstream_status, upstream: "POST https://…", auth_mode, cko_request_id, data }
//   The HTTP status mirrors the upstream status (204 is sent as 200, with
//   upstream_status: 204 in the envelope).
//
// WEBHOOKS
//   The existing POST /webhook handler (api-route-controller.js) calls
//   recordWebhook() so every CKO event also lands in a small in-memory ring
//   buffer. GET /standalone/webhook-events reads it WITHOUT consuming events —
//   the existing /webhook-event store is single-event-per-id and delete-on-read,
//   and network_token_update / card_updated carry no data.id, so it can't serve
//   this tab. Buffer is per warm Lambda container (same limitation as the
//   existing store).
// =============================================

const axios = require('axios');
const router = require('express').Router();
const config = require('../config');

const GW_URL = process.env.GW_URL;

// ---------------------------------------------------------------------------
// OAuth access token (client_credentials), cached per scope string.
// ---------------------------------------------------------------------------
const tokenCache = {};

function oauthConfigured() {
  return !!(config.ckoAccessKeyId && config.ckoAccessKeySecret && config.ckoAccessUrl);
}

async function getAccessToken(scope) {
  const cached = tokenCache[scope];
  // Refresh 60s early so a token never expires mid-request.
  if (cached && cached.expiresAt - 60000 > Date.now()) return cached.token;

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: config.ckoAccessKeyId,
    client_secret: config.ckoAccessKeySecret,
    scope,
  });
  const resp = await axios.post(config.ckoAccessUrl, body.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  tokenCache[scope] = {
    token: resp.data.access_token,
    expiresAt: Date.now() + (resp.data.expires_in || 3600) * 1000,
  };
  return tokenCache[scope].token;
}

// ---------------------------------------------------------------------------
// Generic upstream forwarder — one place for auth, error shaping and envelope.
// ---------------------------------------------------------------------------
async function forward(req, res, { method, path, body, params, scope, defaultAuth }) {
  const requested = (req.headers['x-auth-mode'] || '').toLowerCase();
  const authMode = requested === 'oauth' || requested === 'secret' ? requested : defaultAuth;
  const upstream = `${method.toUpperCase()} ${GW_URL}${path}`;

  try {
    let bearer;
    if (authMode === 'oauth') {
      if (!oauthConfigured()) {
        return res.status(500).json({
          upstream_status: 0, upstream, auth_mode: authMode, cko_request_id: null,
          data: { error: 'OAuth is not configured — set CKO_ACCESS_KEY_ID, CKO_ACCESS_KEY_SECRET and CKO_ACCESS_URL on the Lambda.' },
        });
      }
      try {
        bearer = await getAccessToken(scope);
      } catch (tokenErr) {
        return res.status(tokenErr.response?.status || 502).json({
          upstream_status: tokenErr.response?.status || 502,
          upstream: `POST ${config.ckoAccessUrl}`,
          auth_mode: authMode, cko_request_id: null,
          data: { error: 'OAuth token request failed', scope_requested: scope, detail: tokenErr.response?.data || tokenErr.message },
        });
      }
    } else {
      bearer = config.sk;
    }

    const response = await axios({
      method,
      url: `${GW_URL}${path}`,
      data: body,
      params,
      headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
      // Never throw on 4xx/5xx — we want to relay CKO's error body verbatim.
      validateStatus: () => true,
    });

    const httpStatus = response.status === 204 ? 200 : response.status;
    return res.status(httpStatus).json({
      upstream_status: response.status,
      upstream,
      auth_mode: authMode,
      cko_request_id: response.headers['cko-request-id'] || null,
      data: response.data === '' ? null : response.data,
    });
  } catch (error) {
    console.log('[standalone] upstream call failed:', upstream, error.message);
    return res.status(502).json({
      upstream_status: 502, upstream, auth_mode: authMode, cko_request_id: null,
      data: { error: error.message || 'Upstream request failed' },
    });
  }
}

function requireQuery(req, res, name) {
  const value = req.query[name];
  if (!value) {
    res.status(400).json({ upstream_status: 400, upstream: null, auth_mode: null, cko_request_id: null, data: { error: `${name} query param is required` } });
    return null;
  }
  return encodeURIComponent(value);
}

// ---------------------------------------------------------------------------
// Config — lets the UI show a "credentials missing" banner instead of a
// confusing 500 on the first call.
// ---------------------------------------------------------------------------
router.get('/config', (_req, res) => {
  res.json({
    oauthConfigured: oauthConfigured(),
    processingChannelId: config.processingChannelId,
    gwUrlSet: !!GW_URL,
  });
});

// ---------------------------------------------------------------------------
// Standalone 3DS (Sessions API) — OAuth by default
// ---------------------------------------------------------------------------
router.post('/sessions', (req, res) =>
  forward(req, res, { method: 'post', path: '/sessions', body: req.body, scope: 'sessions:browser sessions:app', defaultAuth: 'oauth' }));

router.get('/session', (req, res) => {
  const id = requireQuery(req, res, 'id'); if (!id) return;
  return forward(req, res, { method: 'get', path: `/sessions/${id}`, scope: 'sessions:browser sessions:app', defaultAuth: 'oauth' });
});

// ---------------------------------------------------------------------------
// Network Tokens — secret key by default
// ---------------------------------------------------------------------------
router.post('/network-tokens', (req, res) =>
  forward(req, res, { method: 'post', path: '/network-tokens', body: req.body, scope: 'vault:network-tokens', defaultAuth: 'secret' }));

router.get('/network-token', (req, res) => {
  const id = requireQuery(req, res, 'id'); if (!id) return;
  return forward(req, res, { method: 'get', path: `/network-tokens/${id}`, scope: 'vault:network-tokens', defaultAuth: 'secret' });
});

router.post('/network-token-cryptogram', (req, res) => {
  const id = requireQuery(req, res, 'id'); if (!id) return;
  return forward(req, res, { method: 'post', path: `/network-tokens/${id}/cryptograms`, body: req.body, scope: 'vault:network-tokens', defaultAuth: 'secret' });
});

router.post('/network-token-delete', (req, res) => {
  const id = requireQuery(req, res, 'id'); if (!id) return;
  return forward(req, res, { method: 'patch', path: `/network-tokens/${id}/delete`, body: req.body, scope: 'vault:network-tokens', defaultAuth: 'secret' });
});

// ---------------------------------------------------------------------------
// Standalone Account Updater — secret key by default
// ---------------------------------------------------------------------------
router.post('/account-updater', (req, res) =>
  forward(req, res, { method: 'post', path: '/account-updater/cards', body: req.body, scope: 'vault:real-time-account-updater', defaultAuth: 'secret' }));

// ---------------------------------------------------------------------------
// Instruments — turns a Flow tokenization token (tok_…) into a reusable src_…
// ---------------------------------------------------------------------------
router.post('/instruments', (req, res) =>
  forward(req, res, { method: 'post', path: '/instruments', body: req.body, scope: 'vault:instruments', defaultAuth: 'secret' }));

// ---------------------------------------------------------------------------
// Vault proxy — Customers + Instruments management (get / update / delete / create customer)
//   POST /standalone/vault  { method, path, body }
// One allowlisted route instead of one API Gateway method per operation. Only these upstream calls pass:
//   POST   /customers | /instruments            (collection create)
//   GET    /customers/{id|email} | /instruments/{id}
//   PATCH  /customers/{id|email} | /instruments/{id}
//   DELETE /customers/{id|email} | /instruments/{id}
//   GET    /validation/bank-accounts/{country}/{currency}
// Instrument CREATION from the UI keeps using the existing POST /standalone/instruments route.
// ---------------------------------------------------------------------------
const VAULT_ITEM = /^\/(customers|instruments)\/[A-Za-z0-9_.@%+\-]{1,255}$/;
const VAULT_COLLECTION = /^\/(customers|instruments)$/;
const VAULT_VALIDATION = /^\/validation\/bank-accounts\/[A-Za-z]{2}\/[A-Za-z]{3}$/;

router.post('/vault', (req, res) => {
  const { method, path, body } = req.body || {};
  const m = String(method || '').toUpperCase();
  const p = String(path || '');
  const allowed =
    (m === 'POST' && VAULT_COLLECTION.test(p)) ||
    (['GET', 'PATCH', 'DELETE'].includes(m) && VAULT_ITEM.test(p)) ||
    (m === 'GET' && VAULT_VALIDATION.test(p));
  if (!allowed || p.includes('..')) {
    return res.status(400).json({ upstream_status: 400, upstream: null, auth_mode: null, cko_request_id: null,
      data: { error: `vault proxy does not allow ${m || '?'} ${p || '?'}` } });
  }
  return forward(req, res, {
    method: m.toLowerCase(), path: p, body: ['POST', 'PATCH'].includes(m) ? (body || {}) : undefined,
    scope: 'vault vault:instruments vault:customers', defaultAuth: 'secret',
  });
});

// ---------------------------------------------------------------------------
// Webhook ring buffer (non-consuming)
// ---------------------------------------------------------------------------
const WEBHOOK_BUFFER_MAX = 200;
const webhookBuffer = [];
let webhookSeq = 0;

// Called from the existing POST /webhook handler once it has authenticated the
// request. Never throws — a buffer problem must not fail CKO's delivery.
function recordWebhook(event) {
  try {
    if (!event || !event.type) return;
    webhookSeq += 1;
    webhookBuffer.push({
      seq: webhookSeq,
      received_at: new Date().toISOString(),
      event_id: event.id || null,
      type: event.type,
      created_on: event.created_on || null,
      data: event.data || null,
    });
    if (webhookBuffer.length > WEBHOOK_BUFFER_MAX) webhookBuffer.shift();
  } catch (e) {
    console.log('[standalone] recordWebhook failed:', e.message);
  }
}

// GET /standalone/webhook-events?since=<seq>&types=a,b&match=<substring>
//   since — only events newer than this seq (UI passes the last seq it saw)
//   types — comma list of exact event types, or prefixes ending in "*"
//   match — comma-separated substrings; an event passes if its JSON contains
//           ANY of them (correlate by payment id, session id, nt id, src_ id…)
router.get('/webhook-events', (req, res) => {
  const since = parseInt(req.query.since || '0', 10) || 0;
  const types = (req.query.types || '').split(',').map(s => s.trim()).filter(Boolean);
  const matches = (req.query.match || '').toString().split(',').map(s => s.trim()).filter(Boolean);

  const typeOk = (t) => !types.length || types.some(p => (p.endsWith('*') ? t.startsWith(p.slice(0, -1)) : t === p));
  const events = webhookBuffer.filter(e =>
    e.seq > since && typeOk(e.type) && (!matches.length || matches.some(m => JSON.stringify(e.data).includes(m))));

  res.json({ events, last_seq: webhookSeq, buffered: webhookBuffer.length });
});

module.exports = router;
module.exports.recordWebhook = recordWebhook;
