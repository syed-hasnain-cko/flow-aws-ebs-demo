// ─── Competitor Testing: Stripe ─────────────────────────────────────
// Native Stripe integration (separate from the Forward API tab, which
// proxies to Stripe THROUGH Checkout.com's /forward endpoint). This
// talks to Stripe directly with its own SDK client and credentials.
//
// Mounted at /competitors/stripe/* from api-route-controller.js.
// Any future partner (Adyen, Payrails, Primer...) gets its own sibling
// file here (e.g. competitors/adyen-routes.js) — never added inline
// to this file or to api-route-controller.js directly.

const Stripe = require('stripe');
const router = require('express').Router();
const config = require('../config');

// Constructed lazily (on first request) rather than at module load — a
// missing/malformed STRIPE_SECRET_KEY throws synchronously inside the
// Stripe SDK, and doing that at require() time crashes the ENTIRE app
// (every route, not just this one) since this file is required from
// api-route-controller.js at cold start. Deferring it means a bad key
// only 500s Stripe requests, and every other route stays unaffected.
let _stripe = null;
function stripe() {
    if (!_stripe) {
        if (!config.stripeSecretKey) {
            throw Object.assign(new Error('STRIPE_SECRET_KEY is not set on this Lambda'), { statusCode: 500 });
        }
        _stripe = new Stripe(config.stripeSecretKey, { apiVersion: '2026-07-29.dahlia' });
    }
    return _stripe;
}

function log(level, route, message, data = {}) {
    console.log(JSON.stringify({
        level, route, message, partner: 'stripe',
        timestamp: new Date().toISOString(),
        ...data
    }));
}

// In-memory store for webhook events, keyed by object id (PaymentIntent id, etc).
// Same 2-minute-poll-then-delete pattern as the Checkout.com /webhook-event route.
const webhookEventStore = new Map();

router.get('/config', (_req, res) => {
    res.json({ publishableKey: config.stripePublishableKey });
});

// ─── Direct API: PaymentMethod + PaymentIntent ──────────────────────
// The frontend creates the PaymentMethod client-side via Stripe.js
// (card data never reaches this backend — PCI boundary stays in the
// browser) and sends us only the resulting payment_method id plus the
// intent-level fields (amount, capture mode, save-card, shipping...).
router.post('/direct/payment-intent', async (req, res) => {
    const { amount, currency, payment_method_id, capture_method, save_card, description, shipping, force_3ds } = req.body || {};
    if (!amount || !currency || !payment_method_id) {
        return res.status(400).json({ error: 'amount, currency, and payment_method_id are required' });
    }
    try {
        const intent = await stripe().paymentIntents.create({
            amount,
            currency,
            payment_method: payment_method_id,
            confirm: true,
            capture_method: capture_method === 'manual' ? 'manual' : 'automatic',
            setup_future_usage: save_card ? 'off_session' : undefined,
            description,
            shipping,
            // Direct API mode is card-only, own-UI — no redirect step exists to
            // send the customer back from. allow_redirects:'never' tells Stripe
            // not to require a return_url even though other (redirect-based)
            // payment methods may be enabled in the Dashboard for other modes.
            automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
            // 'any' forces a 3DS challenge on this PaymentIntent regardless of
            // issuer/card network signals — used by the "Force 3DS" test toggle.
            payment_method_options: force_3ds ? { card: { request_three_d_secure: 'any' } } : undefined,
            metadata: { source: 'competitor-testing-direct-api' },
        });
        log('info', '/direct/payment-intent', 'intent_created', { id: intent.id, status: intent.status });
        res.json(intent);
    } catch (error) {
        log('error', '/direct/payment-intent', 'intent_error', { message: error.message });
        res.status(error.statusCode || 500).json({ error: error.message, code: error.code, raw: error.raw?.message });
    }
});

function randomSuffix(len = 8) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// ─── Checkout: hosted redirect or embedded, both via Checkout Sessions ──
router.post('/checkout/session', async (req, res) => {
    const { amount, currency, product_name, mode, return_base, force_3ds } = req.body || {};
    if (!amount || !currency || !return_base) {
        return res.status(400).json({ error: 'amount, currency, and return_base are required' });
    }
    const isEmbedded = mode === 'embedded';
    // return_base is just the app's origin (e.g. https://xxx.amplifyapp.com) —
    // every Stripe flow lands on the SAME success.html/failure.html pages
    // every other payment method in this app redirects to, not back into the
    // Competitor Testing tab.
    const successUrl = `${return_base}/success.html?stripe_cos_id={CHECKOUT_SESSION_ID}&partner=stripe`;
    const cancelUrl = `${return_base}/failure.html?stripe_cos_status=cancelled&partner=stripe`;
    try {
        const session = await stripe().checkout.sessions.create({
            mode: 'payment',
            // Stripe renamed this value on API version 2025-xx+: 'embedded' → 'embedded_page'.
            ui_mode: isEmbedded ? 'embedded_page' : undefined,
            line_items: [{
                price_data: {
                    currency,
                    unit_amount: amount,
                    product_data: { name: product_name || 'Competitor Testing — Stripe Checkout' },
                },
                quantity: 1,
            }],
            payment_method_options: force_3ds ? { card: { request_three_d_secure: 'any' } } : undefined,
            // Embedded only needs return_url for the rare case a payment method
            // requires a full-page redirect mid-checkout (e.g. a 3DS challenge
            // page instead of the in-page iframe). Completion itself is handled
            // by the embedded instance's onComplete callback on the frontend,
            // which navigates to successUrl manually.
            ...(isEmbedded
                ? { return_url: successUrl }
                : { success_url: successUrl, cancel_url: cancelUrl }),
            integration_identifier: `competitorTest${randomSuffix()}`,
        });
        log('info', '/checkout/session', 'session_created', { id: session.id, mode: isEmbedded ? 'embedded' : 'hosted' });
        res.json(session);
    } catch (error) {
        log('error', '/checkout/session', 'session_error', { message: error.message });
        res.status(error.statusCode || 500).json({ error: error.message });
    }
});

router.get('/checkout/session/:id', async (req, res) => {
    try {
        const session = await stripe().checkout.sessions.retrieve(req.params.id, { expand: ['payment_intent'] });
        res.json(session);
    } catch (error) {
        res.status(error.statusCode || 500).json({ error: error.message });
    }
});

// ─── Payment Element (Custom UI) ─────────────────────────────────────
// Also a Checkout Session under the hood (ui_mode: 'elements' — the
// current name for what used to be called 'custom'), but the frontend
// owns the surrounding layout and only mounts Stripe's Payment Element
// for the actual card/APM fields via stripe.initCheckoutElementsSdk().
// Session retrieval reuses GET /checkout/session/:id above — same object type.
router.post('/payment-element/session', async (req, res) => {
    const { amount, currency, product_name, return_base, force_3ds } = req.body || {};
    if (!amount || !currency || !return_base) {
        return res.status(400).json({ error: 'amount, currency, and return_base are required' });
    }
    try {
        const session = await stripe().checkout.sessions.create({
            mode: 'payment',
            ui_mode: 'elements',
            line_items: [{
                price_data: {
                    currency,
                    unit_amount: amount,
                    product_data: { name: product_name || 'Competitor Testing — Payment Element' },
                },
                quantity: 1,
            }],
            payment_method_options: force_3ds ? { card: { request_three_d_secure: 'any' } } : undefined,
            // Required for ui_mode: 'elements' — unlike Direct API's confirmCardPayment,
            // actions.confirm() always navigates to return_url on completion (success or
            // failure), even for card payments with no redirect-based method involved.
            return_url: `${return_base}/success.html?stripe_cos_id={CHECKOUT_SESSION_ID}&partner=stripe`,
            integration_identifier: `competitorTest${randomSuffix()}`,
        });
        log('info', '/payment-element/session', 'session_created', { id: session.id });
        res.json({ clientSecret: session.client_secret, sessionId: session.id });
    } catch (error) {
        log('error', '/payment-element/session', 'session_error', { message: error.message });
        res.status(error.statusCode || 500).json({ error: error.message });
    }
});

// ─── Payment Links (no-code, hosted URL) ────────────────────────────
router.post('/payment-links', async (req, res) => {
    const { amount, currency, product_name, return_base } = req.body || {};
    if (!amount || !currency) {
        return res.status(400).json({ error: 'amount and currency are required' });
    }
    try {
        const link = await stripe().paymentLinks.create({
            line_items: [{
                price_data: {
                    currency,
                    unit_amount: amount,
                    product_data: { name: product_name || 'Competitor Testing — Stripe Payment Link' },
                },
                quantity: 1,
            }],
            // Optional — if not provided, the buyer sees Stripe's default
            // confirmation page instead of landing on our success.html.
            ...(return_base ? {
                after_completion: {
                    type: 'redirect',
                    redirect: { url: `${return_base}/success.html?stripe_cos_id={CHECKOUT_SESSION_ID}&partner=stripe` },
                },
            } : {}),
        });
        log('info', '/payment-links', 'link_created', { id: link.id });
        res.json(link);
    } catch (error) {
        log('error', '/payment-links', 'link_error', { message: error.message });
        res.status(error.statusCode || 500).json({ error: error.message });
    }
});

// Used after a requires_action (3DS) round-trip on the client resolves,
// or to re-fetch state for the Refund/Actions panel.
router.get('/payment-intent/:id', async (req, res) => {
    try {
        const intent = await stripe().paymentIntents.retrieve(req.params.id);
        res.json(intent);
    } catch (error) {
        res.status(error.statusCode || 500).json({ error: error.message });
    }
});

// ─── Refund / Actions (shared across every acceptance mode) ────────
router.post('/capture-payment-intent', async (req, res) => {
    const { id, amount_to_capture } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id is required' });
    try {
        const intent = await stripe().paymentIntents.capture(id, amount_to_capture ? { amount_to_capture } : undefined);
        log('info', '/capture-payment-intent', 'captured', { id, status: intent.status });
        res.json(intent);
    } catch (error) {
        res.status(error.statusCode || 500).json({ error: error.message });
    }
});

router.post('/cancel-payment-intent', async (req, res) => {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id is required' });
    try {
        const intent = await stripe().paymentIntents.cancel(id);
        log('info', '/cancel-payment-intent', 'canceled', { id, status: intent.status });
        res.json(intent);
    } catch (error) {
        res.status(error.statusCode || 500).json({ error: error.message });
    }
});

router.post('/refund', async (req, res) => {
    const { payment_intent, amount, reason } = req.body || {};
    if (!payment_intent) return res.status(400).json({ error: 'payment_intent is required' });
    try {
        const refund = await stripe().refunds.create({ payment_intent, amount, reason });
        log('info', '/refund', 'refunded', { payment_intent, refundId: refund.id, amount: refund.amount });
        res.json(refund);
    } catch (error) {
        res.status(error.statusCode || 500).json({ error: error.message });
    }
});

// ─── Webhooks ────────────────────────────────────────────────────────
// Signature verification requires the raw request body bytes, captured
// via the bodyParser.json({ verify }) hook added in app.js — req.rawBody.
router.post('/webhook', (req, res) => {
    let event;
    try {
        event = stripe().webhooks.constructEvent(req.rawBody, req.headers['stripe-signature'], config.stripeWebhookSecret);
    } catch (err) {
        log('error', '/webhook', 'signature_verification_failed', { message: err.message });
        return res.status(400).send(`Webhook signature verification failed: ${err.message}`);
    }

    const obj = event.data.object;
    if (obj?.id) {
        webhookEventStore.set(obj.id, { type: event.type, data: obj, receivedAt: Date.now() });
        log('info', '/webhook', 'event_stored', { type: event.type, id: obj.id });
    }
    res.sendStatus(200);
});

router.get('/webhook-event', (req, res) => {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id query param is required' });

    const event = webhookEventStore.get(id);
    if (!event) return res.status(404).json({ found: false });

    webhookEventStore.delete(id);
    res.json({ found: true, ...event });
});

module.exports = router;
