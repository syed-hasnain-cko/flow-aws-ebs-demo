// ─── Competitor Testing: Adyen ──────────────────────────────────────
// Native Adyen integration. Talks to the Adyen Checkout API (test
// environment) directly over axios — deliberately NO Adyen npm SDK, so
// no Lambda Layer is needed for this partner.
//
// Mounted at /competitors/adyen/* from api-route-controller.js.
//
// API version v72 is used for every call (verified from Adyen docs for
// /sessions (hosted), /paymentLinks, /payments/{id}/captures). The Web
// SDK v6 requires Checkout API v69+.

const axios = require('axios');
const crypto = require('crypto');
const router = require('express').Router();
const config = require('../config');

const ADYEN_API_VERSION = 'v72';
const ADYEN_BASE = `https://checkout-test.adyen.com/${ADYEN_API_VERSION}`;

function log(level, route, message, data = {}) {
    console.log(JSON.stringify({
        level, route, message, partner: 'adyen',
        timestamp: new Date().toISOString(),
        ...data
    }));
}

// Config is checked lazily inside handlers (never at require() time) — a
// missing env var must only fail Adyen requests, never crash the whole
// Lambda at cold start. Secret values are never logged.
function requireConfig() {
    if (!config.adyenApiKey || !config.adyenMerchantAccount) {
        throw Object.assign(
            new Error('ADYEN_API_KEY / ADYEN_MERCHANT_ACCOUNT is not set on this Lambda'),
            { statusCode: 500 }
        );
    }
}

async function adyenCall(method, path, data) {
    requireConfig();
    const response = await axios({
        method,
        url: `${ADYEN_BASE}${path}`,
        data,
        headers: { 'x-API-key': config.adyenApiKey, 'Content-Type': 'application/json' },
    });
    return response.data;
}

function sendError(res, route, error) {
    const status = error.response?.status || error.statusCode || 500;
    const body = error.response?.data || { error: error.message };
    log('error', route, 'adyen_error', { status, message: error.message });
    res.status(status).json(body);
}

function newReference(prefix = 'cko-demo') {
    return `${prefix}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
}

// Webhook events are kept per lookup key (pspReference AND merchantReference
// AND originalReference, so a poller can use whichever id it has). Each key
// holds a queue so AUTHORISATION followed by CAPTURE both get delivered.
// Same 2-minute poll-then-delete idea as every other partner.
const webhookEventStore = new Map();
const WEBHOOK_TTL_MS = 5 * 60 * 1000;

function storeWebhookEvent(key, event) {
    if (!key) return;
    const queue = webhookEventStore.get(key) || [];
    queue.push(event);
    webhookEventStore.set(key, queue);
}

function pruneWebhookStore() {
    const cutoff = Date.now() - WEBHOOK_TTL_MS;
    for (const [key, queue] of webhookEventStore) {
        const fresh = queue.filter(e => e.receivedAt >= cutoff);
        if (fresh.length) webhookEventStore.set(key, fresh);
        else webhookEventStore.delete(key);
    }
}

router.get('/config', (_req, res) => {
    // clientKey is browser-exposed by design (restricted by allowed origins).
    res.json({
        clientKey: config.adyenClientKey,
        merchantAccount: config.adyenMerchantAccount,
        environment: 'test',
    });
});

// ─── Sessions flow: Drop-in, Components, Hosted Checkout ─────────────
// One /sessions call. `mode: 'hosted'` returns a `url` to redirect to;
// otherwise the response carries id + sessionData for the Web SDK.
router.post('/sessions', async (req, res) => {
    const { amount, currency, country_code, return_base, mode, shopper_email, shopper_reference, theme_id, manual_capture } = req.body || {};
    if (!amount || !currency || !country_code || !return_base) {
        return res.status(400).json({ error: 'amount, currency, country_code, and return_base are required' });
    }
    const isHosted = mode === 'hosted';
    if (isHosted && (!shopper_email || !shopper_reference || !theme_id)) {
        return res.status(400).json({ error: 'Hosted Checkout requires shopper_email, shopper_reference and theme_id (create a theme in the Adyen Customer Area).' });
    }
    try {
        const reference = newReference();
        const body = {
            merchantAccount: config.adyenMerchantAccount,
            amount: { value: amount, currency },
            reference,
            countryCode: country_code,
            // Every Adyen flow lands on the SAME success.html every other payment
            // method uses; adyen_ref lets that page find the webhook event later.
            returnUrl: `${return_base}/success.html?partner=adyen&adyen_ref=${encodeURIComponent(reference)}`,
            ...(shopper_email ? { shopperEmail: shopper_email } : {}),
            ...(shopper_reference ? { shopperReference: shopper_reference } : {}),
            ...(isHosted ? { mode: 'hosted', themeId: theme_id } : { channel: 'Web' }),
            ...(manual_capture ? { additionalData: { manualCapture: 'true' } } : {}),
        };
        const session = await adyenCall('post', '/sessions', body);
        log('info', '/sessions', 'session_created', { id: session.id, mode: isHosted ? 'hosted' : 'sdk' });
        res.json({ ...session, reference });
    } catch (error) {
        sendError(res, '/sessions', error);
    }
});

// Result of a session after the shopper returns (Hosted: sessionResult is
// appended to returnUrl by Adyen). status: completed | paymentPending |
// canceled | expired. Not for polling — use the webhook for updates.
router.get('/session-result', async (req, res) => {
    const { sessionId, sessionResult } = req.query;
    if (!sessionId || !sessionResult) {
        return res.status(400).json({ error: 'sessionId and sessionResult are required' });
    }
    try {
        const result = await adyenCall('get', `/sessions/${encodeURIComponent(sessionId)}?sessionResult=${encodeURIComponent(sessionResult)}`);
        res.json(result);
    } catch (error) {
        sendError(res, '/session-result', error);
    }
});

// ─── Advanced flow: /paymentMethods, /payments, /payments/details ────
router.post('/payment-methods', async (req, res) => {
    const { amount, currency, country_code } = req.body || {};
    if (!amount || !currency || !country_code) {
        return res.status(400).json({ error: 'amount, currency, and country_code are required' });
    }
    try {
        const methods = await adyenCall('post', '/paymentMethods', {
            merchantAccount: config.adyenMerchantAccount,
            countryCode: country_code,
            amount: { currency, value: amount },
            channel: 'Web',
        });
        res.json(methods);
    } catch (error) {
        sendError(res, '/payment-methods', error);
    }
});

router.post('/payments', async (req, res) => {
    const { amount, currency, country_code, return_base, state_data, reference, shopper_email, manual_capture } = req.body || {};
    if (!amount || !currency || !return_base || !state_data?.paymentMethod) {
        return res.status(400).json({ error: 'amount, currency, return_base and state_data.paymentMethod are required' });
    }
    try {
        const ref = reference || newReference();
        const body = {
            merchantAccount: config.adyenMerchantAccount,
            amount: { value: amount, currency },
            reference: ref,
            paymentMethod: state_data.paymentMethod,
            // adyen_flow=advanced tells the result page to finalise the redirect via
            // /payments/details (the Sessions flow finalises inside the Web SDK instead).
            returnUrl: `${return_base}/success.html?partner=adyen&adyen_ref=${encodeURIComponent(ref)}&adyen_flow=advanced`,
            channel: 'Web',
            origin: return_base,
            ...(country_code ? { countryCode: country_code } : {}),
            ...(shopper_email ? { shopperEmail: shopper_email } : {}),
            // Only forward the extra state.data fields the Web SDK is documented to
            // collect — never spread the whole object into the request.
            ...(state_data.browserInfo ? { browserInfo: state_data.browserInfo } : {}),
            ...(state_data.riskData ? { riskData: state_data.riskData } : {}),
            ...(manual_capture ? { additionalData: { manualCapture: 'true' } } : {}),
        };
        const payment = await adyenCall('post', '/payments', body);
        log('info', '/payments', 'payment_created', { pspReference: payment.pspReference, resultCode: payment.resultCode });
        res.json({ ...payment, reference: ref });
    } catch (error) {
        sendError(res, '/payments', error);
    }
});

// Redirect return: { details: { redirectResult } }. Non-redirect actions
// (3DS challenge): the full state.data from onAdditionalDetails.
router.post('/payments-details', async (req, res) => {
    const { state_data } = req.body || {};
    if (!state_data) return res.status(400).json({ error: 'state_data is required' });
    try {
        const result = await adyenCall('post', '/payments/details', state_data);
        res.json(result);
    } catch (error) {
        sendError(res, '/payments-details', error);
    }
});

// ─── Pay by Link ─────────────────────────────────────────────────────
// The create response has no `status`; GET /payment-link/:id returns it
// (active | completed | expired | paymentPending). No returnUrl is sent —
// its behaviour was not verifiable from the docs available, so the shopper
// completes on Adyen's page and the result is tracked via webhook/reference.
router.post('/payment-links', async (req, res) => {
    const { amount, currency, country_code, description, reusable } = req.body || {};
    if (!amount || !currency) {
        return res.status(400).json({ error: 'amount and currency are required' });
    }
    try {
        const reference = newReference('cko-link');
        const link = await adyenCall('post', '/paymentLinks', {
            merchantAccount: config.adyenMerchantAccount,
            reference,
            amount: { value: amount, currency },
            ...(country_code ? { countryCode: country_code } : {}),
            ...(description ? { description } : {}),
            ...(reusable ? { reusable: true } : {}),
        });
        log('info', '/payment-links', 'link_created', { id: link.id });
        res.json({ ...link, reference });
    } catch (error) {
        sendError(res, '/payment-links', error);
    }
});

router.get('/payment-link/:id', async (req, res) => {
    try {
        res.json(await adyenCall('get', `/paymentLinks/${encodeURIComponent(req.params.id)}`));
    } catch (error) {
        sendError(res, '/payment-link', error);
    }
});

// ─── Capture / Cancel / Refund (shared across every mode) ────────────
// All three are asynchronous: the response is status "received" and the
// real outcome arrives as a CAPTURE / CANCELLATION / REFUND webhook.
// Adyen has no "get payment" endpoint, so these take the pspReference of
// the original authorisation (shown on the result page / webhook log).
function actionRoute(name, path, withAmount) {
    router.post(`/${name}`, async (req, res) => {
        const { psp_reference, amount, currency, reference } = req.body || {};
        if (!psp_reference) return res.status(400).json({ error: 'psp_reference is required' });
        if (withAmount && (!amount || !currency)) {
            return res.status(400).json({ error: 'amount and currency are required' });
        }
        try {
            const body = {
                merchantAccount: config.adyenMerchantAccount,
                reference: reference || newReference(name),
                ...(withAmount ? { amount: { value: amount, currency } } : {}),
            };
            const result = await adyenCall('post', `/payments/${encodeURIComponent(psp_reference)}/${path}`, body);
            log('info', `/${name}`, 'requested', { psp_reference, status: result.status });
            res.json(result);
        } catch (error) {
            sendError(res, `/${name}`, error);
        }
    });
}
actionRoute('capture', 'captures', true);
actionRoute('refund', 'refunds', true);
actionRoute('cancel', 'cancels', false);

// ─── Webhooks ────────────────────────────────────────────────────────
// Standard webhooks sign a colon-joined string of 8 fields with
// HMAC-SHA256 (key is hex-decoded, result base64). The official page
// lists the fields and delimiter; it does not describe value escaping,
// which is not applied here (this app only generates references with no
// ':' or '\').
function expectedHmac(item, hmacKeyHex) {
    const signingString = [
        item.pspReference,
        item.originalReference,
        item.merchantAccountCode,
        item.merchantReference,
        item.amount?.value,
        item.amount?.currency,
        item.eventCode,
        item.success,
    ].map(v => (v === undefined || v === null ? '' : String(v))).join(':');
    return crypto.createHmac('sha256', Buffer.from(hmacKeyHex, 'hex')).update(signingString, 'utf8').digest('base64');
}

function hmacValid(item) {
    const received = item.additionalData?.hmacSignature;
    if (!received || !config.adyenHmacKey) return false;
    const a = Buffer.from(expectedHmac(item, config.adyenHmacKey));
    const b = Buffer.from(received);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

router.post('/webhook', (req, res) => {
    const items = req.body?.notificationItems;
    if (!Array.isArray(items)) return res.status(400).send('Invalid notification payload');

    // Reject the whole request if any item fails verification — Adyen retries
    // non-accepted webhooks, so a transient misconfiguration is recoverable.
    for (const wrapper of items) {
        if (!hmacValid(wrapper.NotificationRequestItem || {})) {
            log('error', '/webhook', 'signature_verification_failed');
            return res.status(401).send('Invalid HMAC signature');
        }
    }

    pruneWebhookStore();
    for (const wrapper of items) {
        const item = wrapper.NotificationRequestItem;
        const event = { type: item.eventCode, success: item.success, data: item, receivedAt: Date.now() };
        [item.pspReference, item.merchantReference, item.originalReference].forEach(key => storeWebhookEvent(key, event));
        log('info', '/webhook', 'event_stored', { eventCode: item.eventCode, pspReference: item.pspReference });
    }
    res.status(200).send('[accepted]');
});

router.get('/webhook-event', (req, res) => {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id query param is required' });

    const queue = webhookEventStore.get(id);
    if (!queue || !queue.length) return res.status(404).json({ found: false });

    const event = queue.shift();
    if (!queue.length) webhookEventStore.delete(id);
    res.json({ found: true, ...event });
});

module.exports = router;
