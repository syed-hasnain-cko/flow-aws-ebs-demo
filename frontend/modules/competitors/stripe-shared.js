// =============================================
// Stripe Shared Helpers
// Used by BOTH the Competitor Testing → Stripe tab and the app-wide
// success.html/failure.html pages, so a Stripe payment lands on and
// renders through the exact same result pages every other payment
// method in this app uses (#payment-details-response, #action-buttons,
// #webhook-status, #details-container).
// Depends on: utils.js (showToast, formatJSON), api-log.js (addToApiLog),
//             window.APP_CONFIG (frontend-config.js)
// =============================================

(function () {
    function base() { return `${window.APP_CONFIG.apiBaseUrl}/competitors/stripe`; }

    function renderJSON(el, data) {
        el.innerHTML = typeof formatJSON === 'function' ? formatJSON(data) : `<pre>${JSON.stringify(data, null, 2)}</pre>`;
    }

    async function fetchPaymentIntent(id) {
        const res = await fetch(`${base()}/payment-intent/${id}`);
        const data = await res.json();
        await addToApiLog('GET', `get PaymentIntent: ${id} - /competitors/stripe/payment-intent/${id}`, res.ok ? 200 : res.status, {}, data);
        return { ok: res.ok, data };
    }

    async function fetchCheckoutSession(id) {
        const res = await fetch(`${base()}/checkout/session/${id}`);
        const data = await res.json();
        await addToApiLog('GET', `get Checkout Session: ${id} - /competitors/stripe/checkout/session/${id}`, res.ok ? 200 : res.status, {}, data);
        return { ok: res.ok, data };
    }

    async function doAction(route, body) {
        const res = await fetch(`${base()}/${route}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const data = await res.json();
        await addToApiLog('POST', `${route} - /competitors/stripe/${route}`, res.ok ? 200 : res.status, body, data);
        return { ok: res.ok, data };
    }

    // Same next-action logic as the tab's own Refund/Actions panel:
    // capture if authorized-only, cancel while still cancelable, refund once paid.
    function renderActionButtons(container, intent, onRefresh) {
        if (!container) return;
        container.innerHTML = '';
        const buttons = [];
        if (intent.status === 'requires_capture') {
            buttons.push(['Capture', () => doAction('capture-payment-intent', { id: intent.id })]);
        }
        if (['requires_payment_method', 'requires_confirmation', 'requires_capture', 'requires_action'].includes(intent.status)) {
            buttons.push(['Cancel', () => doAction('cancel-payment-intent', { id: intent.id })]);
        }
        if (intent.status === 'succeeded' && intent.amount_received > 0) {
            buttons.push(['Refund', () => doAction('refund', { payment_intent: intent.id })]);
        }
        buttons.forEach(([label, action]) => {
            const btn = document.createElement('button');
            btn.textContent = label;
            btn.className = 'main-button';
            btn.addEventListener('click', async () => {
                const { ok } = await action();
                if (ok) {
                    showToast(`${label} succeeded.`);
                    onRefresh();
                } else {
                    showToast(`${label} failed.`, false);
                }
            });
            container.appendChild(btn);
        });
        container.style.display = buttons.length ? 'flex' : 'none';
    }

    function startWebhookPolling(id, statusEl, onEvent) {
        let elapsed = 0;
        if (statusEl) {
            statusEl.style.display = 'block';
            statusEl.textContent = '⏳ Listening for webhook updates...';
        }
        const timer = setInterval(async () => {
            elapsed += 2000;
            const res = await fetch(`${base()}/webhook-event?id=${id}`);
            const data = await res.json();
            if (data.found) {
                clearInterval(timer);
                if (statusEl) statusEl.textContent = `Webhook: ${data.type.replace(/_/g, ' ')}`;
                await addToApiLog('INCOMING WEBHOOK', `${data.type} — /competitors/stripe/webhook`, 200, {}, data.data);
                onEvent(data);
                return;
            }
            if (elapsed >= 120000) {
                clearInterval(timer);
                if (statusEl) statusEl.style.display = 'none';
            }
        }, 2000);
        return timer;
    }

    // Detects every query-param shape Stripe can return with: our own
    // Checkout Sessions success_url (stripe_cos_id), our cancel_url
    // (stripe_cos_status=cancelled), and the redirect-based 3DS return
    // params Stripe.js appends itself (payment_intent, redirect_status)
    // when a card issuer forces a full-page challenge instead of an
    // in-page iframe modal.
    function detectReturnParams() {
        const params = new URLSearchParams(window.location.search);
        return {
            piIdFromRedirect: params.get('payment_intent'),
            redirectStatus: params.get('redirect_status'), // succeeded | failed | processing | requires_payment_method
            cosId: params.get('stripe_cos_id'),
            cosStatus: params.get('stripe_cos_status'), // 'cancelled' from our own cancel_url
        };
    }

    function isStripeReturn() {
        const p = detectReturnParams();
        return !!(p.piIdFromRedirect || p.cosId || p.cosStatus === 'cancelled');
    }

    // Renders a Stripe payment's status/details/actions into the SAME
    // #payment-details-response / #details-container / #action-buttons /
    // #webhook-status elements success.html and failure.html already use
    // for Checkout.com payments — "same format" for every partner.
    async function renderReturnPage({ detailsEl, detailsContainer, actionsEl, webhookStatusEl, paymentIdEl }) {
        const { piIdFromRedirect, redirectStatus, cosId, cosStatus } = detectReturnParams();

        async function renderIntent(intent) {
            if (paymentIdEl) paymentIdEl.textContent = intent.id;
            renderJSON(detailsEl, intent);
            detailsContainer.style.display = 'flex';
            renderActionButtons(actionsEl, intent, async () => {
                const refreshed = await fetchPaymentIntent(intent.id);
                if (refreshed.ok) await renderIntent(refreshed.data);
            });
        }

        if (cosStatus === 'cancelled') {
            if (paymentIdEl) paymentIdEl.textContent = 'Checkout cancelled';
            if (webhookStatusEl) webhookStatusEl.style.display = 'none';
            return { outcome: 'cancelled' };
        }

        let intent = null;

        if (cosId) {
            const { ok, data: session } = await fetchCheckoutSession(cosId);
            if (!ok) return { outcome: 'error', error: session.error };
            if (session.payment_intent && typeof session.payment_intent === 'object') {
                intent = session.payment_intent;
            } else if (typeof session.payment_intent === 'string') {
                const piRes = await fetchPaymentIntent(session.payment_intent);
                if (piRes.ok) intent = piRes.data;
            } else {
                // No PaymentIntent yet (e.g. still processing) — show the session itself.
                if (paymentIdEl) paymentIdEl.textContent = session.id;
                renderJSON(detailsEl, session);
                detailsContainer.style.display = 'flex';
            }
        } else if (piIdFromRedirect) {
            const { ok, data } = await fetchPaymentIntent(piIdFromRedirect);
            if (!ok) return { outcome: 'error', error: data.error };
            intent = data;
        }

        if (intent) {
            await renderIntent(intent);
            if (webhookStatusEl) {
                startWebhookPolling(intent.id, webhookStatusEl, async () => {
                    const refreshed = await fetchPaymentIntent(intent.id);
                    if (refreshed.ok) await renderIntent(refreshed.data);
                });
            }
            return { outcome: intent.status, intent };
        }

        return { outcome: redirectStatus || 'unknown' };
    }

    window.StripeShared = {
        fetchPaymentIntent,
        fetchCheckoutSession,
        doAction,
        renderActionButtons,
        startWebhookPolling,
        isStripeReturn,
        detectReturnParams,
        renderReturnPage,
    };
})();
