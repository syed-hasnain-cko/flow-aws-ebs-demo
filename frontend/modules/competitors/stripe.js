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
            force_3ds: document.getElementById('stripe-force-3ds').checked,
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
            // return_url is a safety net for the rare card/issuer combination that
            // forces a full-page redirect instead of an in-page iframe challenge —
            // if that happens, the browser navigates to success.html with
            // payment_intent/redirect_status query params, which stripe-shared.js
            // picks up. Most test cards resolve the challenge in-page and never redirect.
            const { paymentIntent, error } = await stripeClient.confirmCardPayment(intent.client_secret, {
                return_url: `${window.location.origin}/success.html?partner=stripe`,
            });
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

    // ─── Checkout mode (hosted / embedded) ────────────────────────────────
    let checkoutUiMode = 'hosted';
    let embeddedCheckoutInstance = null;

    async function onCreateCheckoutSession() {
        const statusEl = document.getElementById('stripe-checkout-status');
        const amount = parseInt(document.getElementById('stripe-checkout-amount').value, 10);
        const currency = document.getElementById('stripe-checkout-currency').value;
        const productName = document.getElementById('stripe-checkout-product').value;
        if (!amount || !currency) {
            setStatus(statusEl, 'error', 'Amount and currency are required.');
            return;
        }

        setStatus(statusEl, 'action', 'Creating Checkout Session...');
        const body = {
            amount,
            currency,
            product_name: productName,
            mode: checkoutUiMode,
            // Just the origin — the backend appends /success.html or /failure.html
            // itself, so every Stripe flow lands on the same result pages every
            // other payment method in this app uses.
            return_base: window.location.origin,
            force_3ds: document.getElementById('stripe-checkout-force-3ds').checked,
        };
        const res = await fetch(`${STRIPE_BASE()}/checkout/session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const session = await res.json();
        await addToApiLog('POST', 'create Checkout Session - /competitors/stripe/checkout/session', res.ok ? 200 : res.status, body, session);

        if (!res.ok) {
            setStatus(statusEl, 'error', session.error || 'Checkout Session creation failed.');
            return;
        }

        renderResult('stripe-checkout-result-container', 'stripe-checkout-result', session);

        if (checkoutUiMode === 'embedded') {
            setStatus(statusEl, 'ready', 'Embedded Checkout mounted below.');
            if (embeddedCheckoutInstance) embeddedCheckoutInstance.destroy();
            // Renamed in the dahlia release: initEmbeddedCheckout() → createEmbeddedCheckoutPage().
            // Never switch this back — the old name throws IntegrationError on this Stripe.js build.
            embeddedCheckoutInstance = await stripeClient.createEmbeddedCheckoutPage({
                clientSecret: session.client_secret,
                // Embedded Checkout doesn't navigate on its own when payment
                // completes — it fires this callback instead. We navigate manually
                // so the result lands on the same success.html every other flow uses.
                onComplete: () => {
                    window.location.href = `success.html?stripe_cos_id=${session.id}&partner=stripe`;
                },
            });
            embeddedCheckoutInstance.mount('#stripe-checkout-embedded-container');
        } else {
            setStatus(statusEl, 'action', 'Redirecting to Stripe-hosted Checkout...');
            window.location.href = session.url;
        }
    }

    // ─── Payment Element (Custom UI) mode ─────────────────────────────────
    // A Checkout Session under the hood (ui_mode: 'elements' — current name
    // for what used to be 'custom'). Uses stripe.initCheckoutElementsSdk(),
    // NOT stripe.elements({clientSecret}) — that's the older PaymentIntent-
    // only Elements API and doesn't understand Checkout Sessions.
    let peCheckoutInstance = null;

    async function onLoadPaymentElement() {
        const statusEl = document.getElementById('stripe-pe-status');
        const amount = parseInt(document.getElementById('stripe-pe-amount').value, 10);
        const currency = document.getElementById('stripe-pe-currency').value;
        const productName = document.getElementById('stripe-pe-product').value;
        if (!amount || !currency) {
            setStatus(statusEl, 'error', 'Amount and currency are required.');
            return;
        }

        setStatus(statusEl, 'action', 'Creating Checkout Session...');
        const body = {
            amount,
            currency,
            product_name: productName,
            return_base: window.location.origin,
            force_3ds: document.getElementById('stripe-pe-force-3ds').checked,
        };
        const res = await fetch(`${STRIPE_BASE()}/payment-element/session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const data = await res.json();
        await addToApiLog('POST', 'create Payment Element session - /competitors/stripe/payment-element/session', res.ok ? 200 : res.status, body, data);

        if (!res.ok) {
            setStatus(statusEl, 'error', data.error || 'Session creation failed.');
            return;
        }

        setStatus(statusEl, 'ready', 'Payment Element mounted below.');
        document.getElementById('stripe-pe-form-container').style.display = 'block';

        peCheckoutInstance = stripeClient.initCheckoutElementsSdk({ clientSecret: data.clientSecret });
        // Not gating the Pay button on session.canConfirm — with only the Payment
        // Element mounted (no Address/Contact Element), canConfirm can stay false
        // even with valid card details entered, permanently disabling the button
        // with no visible error. Let actions.confirm() itself be the validator —
        // it returns a proper error result we already surface below.
        peCheckoutInstance.on('change', (session) => {
            document.getElementById('stripe-pe-pay-btn').textContent = `Pay ${session.total?.total?.amount ?? ''}`.trim();
        });
        const paymentElement = peCheckoutInstance.createPaymentElement();
        paymentElement.mount('#stripe-pe-payment-element');
    }

    async function onPaymentElementSubmit() {
        const statusEl = document.getElementById('stripe-pe-status');
        const errorsEl = document.getElementById('stripe-pe-errors');
        errorsEl.textContent = '';
        setStatus(statusEl, 'action', 'Confirming payment...');

        try {
            const email = document.getElementById('stripe-pe-email').value;
            if (!email) {
                errorsEl.textContent = 'Email is required to confirm this Checkout Session.';
                setStatus(statusEl, 'error', 'Email is required to confirm this Checkout Session.');
                return;
            }
            const { actions } = await peCheckoutInstance.loadActions();
            const confirmResult = await actions.confirm({ email });

            // A successful confirm navigates the browser to return_url (success.html)
            // before this line would even run — reaching here means an immediate error.
            await addToApiLog('POST', 'checkout.loadActions().confirm() (client-side)', confirmResult.type === 'error' ? 402 : 200, {}, confirmResult);
            if (confirmResult.type === 'error') {
                errorsEl.textContent = confirmResult.error.message;
                setStatus(statusEl, 'error', confirmResult.error.message);
            }
        } catch (err) {
            // loadActions()/confirm() throwing (vs. resolving with type:'error') was
            // previously silent — surface it instead of leaving the button inert.
            await addToApiLog('POST', 'checkout.loadActions().confirm() (client-side)', 500, {}, { message: err.message });
            errorsEl.textContent = err.message;
            setStatus(statusEl, 'error', err.message);
        }
    }

    // ─── Payment Links (no-code, hosted URL) ──────────────────────────────
    async function onCreatePaymentLink() {
        const statusEl = document.getElementById('stripe-link-status');
        const amount = parseInt(document.getElementById('stripe-link-amount').value, 10);
        const currency = document.getElementById('stripe-link-currency').value;
        const productName = document.getElementById('stripe-link-product').value;
        if (!amount || !currency) {
            setStatus(statusEl, 'error', 'Amount and currency are required.');
            return;
        }

        setStatus(statusEl, 'action', 'Creating Payment Link...');
        const body = {
            amount,
            currency,
            product_name: productName,
            return_base: window.location.origin,
        };
        const res = await fetch(`${STRIPE_BASE()}/payment-links`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const link = await res.json();
        await addToApiLog('POST', 'create Payment Link - /competitors/stripe/payment-links', res.ok ? 200 : res.status, body, link);

        if (!res.ok) {
            setStatus(statusEl, 'error', link.error || 'Payment Link creation failed.');
            return;
        }

        setStatus(statusEl, 'ready', 'Payment Link created.');
        document.getElementById('stripe-link-result').style.display = 'block';
        document.getElementById('stripe-link-url').value = link.url;
        document.getElementById('stripe-link-open-btn').href = link.url;
        renderResult('stripe-link-result-container', 'stripe-link-result-json', link);
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
                document.querySelectorAll('[id^="stripe-mode-panel-"]').forEach(p => p.style.display = 'none');
                const panel = document.getElementById(`stripe-mode-panel-${opt.dataset.mode}`);
                if (panel) panel.style.display = 'block';
            });
        });

        document.querySelectorAll('#stripe-checkout-ui-selector .wallet-option').forEach(opt => {
            opt.addEventListener('click', () => {
                document.querySelectorAll('#stripe-checkout-ui-selector .wallet-option').forEach(o => o.classList.remove('active'));
                opt.classList.add('active');
                checkoutUiMode = opt.dataset.checkoutUi;
                document.getElementById('stripe-checkout-embedded-container').innerHTML = '';
            });
        });
        document.getElementById('stripe-checkout-create-btn')?.addEventListener('click', onCreateCheckoutSession);
        document.getElementById('stripe-pe-init-btn')?.addEventListener('click', onLoadPaymentElement);
        document.getElementById('stripe-pe-pay-btn')?.addEventListener('click', onPaymentElementSubmit);
        document.getElementById('stripe-link-create-btn')?.addEventListener('click', onCreatePaymentLink);
        document.getElementById('stripe-link-copy-btn')?.addEventListener('click', async () => {
            await navigator.clipboard.writeText(document.getElementById('stripe-link-url').value);
            showToast('Payment Link copied.');
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
