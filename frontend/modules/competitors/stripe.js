// =============================================
// Competitor Testing → Stripe module
// Direct API mode: PaymentMethod (Stripe.js) + PaymentIntent (backend).
// Depends on: utils.js (showToast), api-log.js (addToApiLog),
//             window.APP_CONFIG (frontend-config.js), Stripe.js SDK (index.html)
// =============================================

(function () {
    const STRIPE_BASE = () => `${window.APP_CONFIG.apiBaseUrl}/competitors/stripe`;

    let stripeClient = null;
    let cardNumberElement = null;
    let webhookPollTimer = null;

    async function stripeConfigFetch() {
        const res = await fetch(`${STRIPE_BASE()}/config`);
        const data = await res.json();
        await addToApiLog('GET', 'stripe config - /competitors/stripe/config', res.ok ? 200 : res.status, {}, data);
        return data;
    }

    // Always uses the split multi-field layout (separate number/expiry/cvc
    // elements) rather than the single inline 'card' element — never switch
    // this back to the combined field.
    async function mountCardElement() {
        const { publishableKey } = await stripeConfigFetch();
        if (!publishableKey) {
            setStatus(document.getElementById('stripe-direct-status'), 'error', 'STRIPE_PUBLISHABLE_KEY is not set — add it to .env / Lambda env vars.');
            return;
        }
        stripeClient = Stripe(publishableKey);
        const elements = stripeClient.elements();

        cardNumberElement = elements.create('cardNumber');
        cardNumberElement.mount('#stripe-card-number');

        const cardExpiryElement = elements.create('cardExpiry');
        cardExpiryElement.mount('#stripe-card-expiry');

        const cardCvcElement = elements.create('cardCvc');
        cardCvcElement.mount('#stripe-card-cvc');

        const errorsEl = document.getElementById('stripe-card-errors');
        [cardNumberElement, cardExpiryElement, cardCvcElement].forEach(el => {
            el.on('change', (event) => {
                if (event.error) errorsEl.textContent = event.error.message;
                else if (!event.error) errorsEl.textContent = '';
            });
        });
    }

    function buildBillingDetails() {
        return {
            name: document.getElementById('stripe-name').value || undefined,
            email: document.getElementById('stripe-email').value || undefined,
            address: {
                line1: document.getElementById('stripe-billing-line1').value || undefined,
                city: document.getElementById('stripe-billing-city').value || undefined,
                postal_code: document.getElementById('stripe-billing-zip').value || undefined,
                country: document.getElementById('stripe-billing-country').value || undefined,
            },
        };
    }

    function buildShipping() {
        if (!document.getElementById('stripe-shipping-toggle').checked) return undefined;
        return {
            name: document.getElementById('stripe-shipping-name').value || '',
            address: {
                line1: document.getElementById('stripe-shipping-line1').value || '',
                city: document.getElementById('stripe-shipping-city').value || '',
                postal_code: document.getElementById('stripe-shipping-zip').value || '',
                country: document.getElementById('stripe-shipping-country').value || '',
            },
        };
    }

    async function onPaySubmit() {
        const statusEl = document.getElementById('stripe-direct-status');
        const amount = parseInt(document.getElementById('stripe-amount').value, 10);
        const currency = document.getElementById('stripe-currency').value;
        if (!amount || !currency) {
            setStatus(statusEl, 'error', 'Amount and currency are required.');
            return;
        }

        setStatus(statusEl, 'action', 'Creating PaymentMethod with Stripe.js...');
        const billingDetails = buildBillingDetails();

        const pmResult = await stripeClient.createPaymentMethod({
            type: 'card',
            card: cardNumberElement,
            billing_details: billingDetails,
        });

        // Client-side Stripe.js call — logged manually since it never touches our backend fetch layer.
        await addToApiLog('POST', 'stripe.js createPaymentMethod (client-side, card data never leaves the browser)',
            pmResult.error ? 402 : 200,
            { type: 'card', billing_details: billingDetails },
            pmResult.error ? pmResult.error : pmResult.paymentMethod);

        if (pmResult.error) {
            setStatus(statusEl, 'error', pmResult.error.message);
            return;
        }

        setStatus(statusEl, 'action', 'Creating PaymentIntent...');
        const captureMode = document.querySelector('input[name="stripe-capture-mode"]:checked').value;
        const body = {
            amount,
            currency,
            payment_method_id: pmResult.paymentMethod.id,
            capture_method: captureMode,
            save_card: document.getElementById('stripe-save-card').checked,
            shipping: buildShipping(),
        };

        const res = await fetch(`${STRIPE_BASE()}/direct/payment-intent`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const intent = await res.json();
        await addToApiLog('POST', `create+confirm PaymentIntent - /competitors/stripe/direct/payment-intent`, res.ok ? 200 : res.status, body, intent);

        if (!res.ok) {
            setStatus(statusEl, 'error', intent.error || 'PaymentIntent creation failed.');
            return;
        }

        await handleIntentResult(intent);
    }

    async function handleIntentResult(intent) {
        const statusEl = document.getElementById('stripe-direct-status');
        renderResult('stripe-direct-result-container', 'stripe-direct-result', intent);

        if (intent.status === 'requires_action' || intent.status === 'requires_source_action') {
            setStatus(statusEl, 'action', 'Additional authentication required (3DS)...');
            const { paymentIntent, error } = await stripeClient.confirmCardPayment(intent.client_secret);
            await addToApiLog('POST', 'stripe.js confirmCardPayment (3DS, client-side)', error ? 402 : 200, {}, error || paymentIntent);
            if (error) {
                setStatus(statusEl, 'error', error.message);
                return;
            }
            renderResult('stripe-direct-result-container', 'stripe-direct-result', paymentIntent);
            intent = paymentIntent;
        }

        if (intent.status === 'succeeded' || intent.status === 'requires_capture') {
            setStatus(statusEl, 'ready', `PaymentIntent ${intent.status === 'succeeded' ? 'succeeded' : 'authorized — awaiting capture'} (${intent.id}). Watching for webhook...`);
            showToast('Payment submitted to Stripe.');
            startWebhookPolling(intent.id);
        } else if (intent.status === 'processing') {
            setStatus(statusEl, 'action', `PaymentIntent processing (${intent.id}). Watching for webhook...`);
            startWebhookPolling(intent.id);
        } else {
            setStatus(statusEl, 'error', `PaymentIntent ended in status: ${intent.status}`);
        }
    }

    function renderResult(containerId, preId, data) {
        document.getElementById(containerId).style.display = 'block';
        document.getElementById(preId).textContent = JSON.stringify(data, null, 2);
    }

    // ─── Webhook polling (2 minutes, same pattern as Payouts/CKO tabs) ──
    function startWebhookPolling(intentId) {
        stopWebhookPolling();
        const el = document.getElementById('stripe-webhook-status');
        el.style.display = 'block';
        el.textContent = 'Polling for webhook event...';

        let elapsed = 0;
        webhookPollTimer = setInterval(async () => {
            elapsed += 2000;
            const res = await fetch(`${STRIPE_BASE()}/webhook-event?id=${intentId}`);
            const data = await res.json();
            if (data.found) {
                stopWebhookPolling();
                el.textContent = `Webhook received: ${data.type}`;
                logWebhookEntry(data.type, data.data);
                return;
            }
            if (elapsed >= 120000) {
                stopWebhookPolling();
                el.textContent = 'No webhook received after 2 minutes.';
            }
        }, 2000);
    }

    function stopWebhookPolling() {
        if (webhookPollTimer) clearInterval(webhookPollTimer);
        webhookPollTimer = null;
    }
    window.stopStripeWebhookPolling = stopWebhookPolling;

    function logWebhookEntry(type, data) {
        const container = document.getElementById('stripe-webhook-log');
        const entry = document.createElement('div');
        entry.style.padding = '6px 0';
        entry.style.borderBottom = '1px solid var(--border)';
        entry.style.fontSize = '12px';
        entry.innerHTML = `<strong>${type}</strong> — <code>${data.id}</code> (${data.status || ''})`;
        container.prepend(entry);
    }

    // ─── Refund / Actions panel ──────────────────────────────────────────
    async function onLookup() {
        const id = document.getElementById('stripe-lookup-id').value.trim();
        const statusEl = document.getElementById('stripe-actions-status');
        if (!id) {
            setStatus(statusEl, 'error', 'Enter a PaymentIntent ID.');
            return;
        }
        const res = await fetch(`${STRIPE_BASE()}/payment-intent/${id}`);
        const intent = await res.json();
        await addToApiLog('GET', `get PaymentIntent: ${id} - /competitors/stripe/payment-intent/${id}`, res.ok ? 200 : res.status, {}, intent);

        if (!res.ok) {
            setStatus(statusEl, 'error', intent.error || 'Not found.');
            document.getElementById('stripe-actions-buttons').style.display = 'none';
            return;
        }

        setStatus(statusEl, 'ready', `Status: ${intent.status}`);
        renderResult('stripe-actions-result-container', 'stripe-actions-result', intent);
        renderActionButtons(intent);
    }

    function renderActionButtons(intent) {
        const container = document.getElementById('stripe-actions-buttons');
        container.innerHTML = '';
        container.style.display = 'flex';

        if (intent.status === 'requires_capture') {
            container.appendChild(makeActionButton('Capture', () => doAction('capture-payment-intent', { id: intent.id })));
        }
        if (['requires_payment_method', 'requires_confirmation', 'requires_capture', 'requires_action'].includes(intent.status)) {
            container.appendChild(makeActionButton('Cancel', () => doAction('cancel-payment-intent', { id: intent.id })));
        }
        if (intent.status === 'succeeded' && intent.amount_received > 0) {
            container.appendChild(makeActionButton('Refund', () => doAction('refund', { payment_intent: intent.id })));
        }
        if (!container.children.length) {
            container.style.display = 'none';
        }
    }

    function makeActionButton(label, onClick) {
        const btn = document.createElement('button');
        btn.textContent = label;
        btn.className = 'main-button';
        btn.addEventListener('click', onClick);
        return btn;
    }

    async function doAction(route, body) {
        const res = await fetch(`${STRIPE_BASE()}/${route}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const data = await res.json();
        await addToApiLog('POST', `${route} - /competitors/stripe/${route}`, res.ok ? 200 : res.status, body, data);

        if (res.ok) {
            showToast(`${route.replace(/-/g, ' ')} succeeded.`);
            renderResult('stripe-actions-result-container', 'stripe-actions-result', data);
            renderActionButtons(data.status ? data : { status: null });
        } else {
            showToast(`${route.replace(/-/g, ' ')} failed.`, false);
        }
    }

    // ─── Wiring ───────────────────────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', () => {
        const payBtn = document.getElementById('stripe-pay-btn');
        if (!payBtn) return; // tab not yet loaded on this page

        mountCardElement();

        const urlDisplay = document.getElementById('stripe-webhook-url-display');
        if (urlDisplay && window.APP_CONFIG?.apiBaseUrl) {
            urlDisplay.textContent = `${window.APP_CONFIG.apiBaseUrl}/competitors/stripe/webhook`;
        }

        payBtn.addEventListener('click', onPaySubmit);
        document.getElementById('stripe-lookup-btn').addEventListener('click', onLookup);
        document.getElementById('stripe-shipping-toggle').addEventListener('change', (e) => {
            document.getElementById('stripe-shipping-fields').style.display = e.target.checked ? 'block' : 'none';
        });

        document.querySelectorAll('#stripe-mode-selector .wallet-option:not(.disabled)').forEach(opt => {
            opt.addEventListener('click', () => {
                document.querySelectorAll('#stripe-mode-selector .wallet-option').forEach(o => o.classList.remove('active'));
                opt.classList.add('active');
            });
        });

        document.querySelectorAll('#competitor-partner-selector .wallet-option:not(.disabled)').forEach(opt => {
            opt.addEventListener('click', () => {
                document.querySelectorAll('#competitor-partner-selector .wallet-option').forEach(o => o.classList.remove('active'));
                opt.classList.add('active');
                document.querySelectorAll('.partner-panel').forEach(p => p.style.display = 'none');
                document.getElementById(`partner-panel-${opt.dataset.partner}`).style.display = 'block';
            });
        });
    });
})();
