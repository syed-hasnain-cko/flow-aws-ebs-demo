// =============================================
// Wallets via Flow — Tokenize Mode Module
// Apple Pay / Google Pay rendered through Flow's applepay/googlepay
// components in `mode: 'tokenize'`. On wallet authorization the component
// exchanges the wallet payload for a Checkout.com token via onTokenized
// (without submitting a payment). That token is then forwarded to the
// existing /payments route (source.type: "token") — the same route the
// Payment Setup tab's direct-card flow already uses.
//
// Fully independent of the direct Apple/Google Pay SDK integration in
// wallets.js / apple-pay.js / google-pay.js — mounts into its own
// #flow-wallet-container and never touches #google-container.
//
// Depends on: utils.js (getFlowAppearance, formatJSON, showToast)
//             api-log.js (addToApiLog)
//             payment-actions.js (capturePayment/voidPayment/refundPayment)
//             modules/data.js (CURRENCIES)
// =============================================

(function () {
    const FAILED_STATUSES_FLOW_WALLET = ['Declined', 'Canceled', 'Expired', 'Failed'];

    let _webhookPollInterval = null;
    // Captured from onAuthorized so onTokenized/submit can enrich the
    // /payments customer object with the wallet-provided contact details.
    let _lastAuthorizedContact = null;

    function logStep(html) {
        const log = document.getElementById('flow-wallet-log');
        if (!log) return;
        const line = document.createElement('div');
        const time = new Date().toLocaleTimeString();
        line.innerHTML = `<span style="color:var(--text-muted);">[${time}]</span> ${html}`;
        log.appendChild(line);
    }

    function resetPanels() {
        ['flow-wallet-contact-panel', 'flow-wallet-token-panel', 'flow-wallet-payment-panel'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
        const log = document.getElementById('flow-wallet-log');
        if (log) log.innerHTML = '';
        const actions = document.getElementById('flow-wallet-action-buttons');
        if (actions) actions.innerHTML = '';
        const webhookStatus = document.getElementById('flow-wallet-webhook-status');
        if (webhookStatus) webhookStatus.textContent = '';
        _lastAuthorizedContact = null;
        stopWebhookPolling();
    }

    function renderContactPanel(contact) {
        const panel = document.getElementById('flow-wallet-contact-panel');
        const target = document.getElementById('flow-wallet-contact-response');
        if (!panel || !target) return;
        target.innerHTML = formatJSON(contact || { note: 'No contact data returned by the wallet.' });
        panel.style.display = 'block';
    }

    function renderTokenPanel(tokenData) {
        const panel = document.getElementById('flow-wallet-token-panel');
        const target = document.getElementById('flow-wallet-token-response');
        if (!panel || !target) return;
        target.innerHTML = formatJSON(tokenData);
        panel.style.display = 'block';
    }

    function renderPaymentPanel(payment) {
        const panel = document.getElementById('flow-wallet-payment-panel');
        const target = document.getElementById('flow-wallet-payment-response');
        if (!panel || !target) return;
        target.innerHTML = formatJSON(payment);
        panel.style.display = 'block';
    }

    function renderActionButtons(payment) {
        const container = document.getElementById('flow-wallet-action-buttons');
        if (!container) return;
        container.innerHTML = '';
        const makeBtn = (label, fn) => {
            const btn = document.createElement('button');
            btn.className = 'main-button';
            btn.textContent = label;
            btn.addEventListener('click', async () => { await fn(payment.id); });
            container.appendChild(btn);
        };
        if (payment._links?.capture) makeBtn('Capture', capturePayment);
        if (payment._links?.void) makeBtn('Void', voidPayment);
        if (payment._links?.refund) makeBtn('Refund', refundPayment);
    }

    // Normalizes the wallet-specific onAuthorized payload into a common shape
    // for display. Apple Pay's authorizeResult wraps the Apple Pay JS SDK's
    // ApplePayPaymentAuthorizedEvent.payment (billingContact/shippingContact);
    // Google Pay's authorizeResult follows Google's PaymentData shape
    // (email/shippingAddress/paymentMethodData.info.billingAddress).
    function extractWalletContact(walletType, authorizeResult) {
        if (!authorizeResult) return null;
        if (walletType === 'apple') {
            const payment = authorizeResult.payment || authorizeResult;
            return {
                billingContact: payment.billingContact || null,
                shippingContact: payment.shippingContact || null,
            };
        }
        return {
            email: authorizeResult.email || null,
            shippingAddress: authorizeResult.shippingAddress || null,
            billingAddress: authorizeResult.paymentMethodData?.info?.billingAddress || null,
        };
    }

    function deriveCustomerFromContact(walletType, contact, fallbackEmail, fallbackName) {
        if (!contact) return { email: fallbackEmail, name: fallbackName };
        if (walletType === 'apple') {
            const bc = contact.billingContact || contact.shippingContact || {};
            const name = [bc.givenName, bc.familyName].filter(Boolean).join(' ') || fallbackName;
            return { email: bc.emailAddress || fallbackEmail, name };
        }
        return { email: contact.email || fallbackEmail, name: fallbackName };
    }

    // Same fields Flow's own payment-session body uses today (see flow.js) —
    // just sourced from the wallets tab's shared inputs instead of the Flow
    // tab's. No enabled/disabled method filtering beyond the existing
    // remember_me default, so this session behaves like every other one.
    function buildSessionBody() {
        const currencySelect = document.getElementById('currency-select-google-pay');
        const countrySelect  = document.getElementById('country-select-google-pay');
        const amountInput    = document.getElementById('amount-input-google');
        const emailInput     = document.getElementById('email-input-google');
        const nameInput      = document.getElementById('name-input-google');
        const paymentTypeSel = document.getElementById('payment-type-select-google');
        const threeDsToggle  = document.getElementById('3ds-toggle-google');
        const captureToggle  = document.getElementById('capture-toggle-google');

        const currency = CURRENCIES.find(c => c.iso4217 == currencySelect.value) || { base: 100 };
        const amountMinor = parseInt(amountInput.value * currency.base);

        return {
            locale: 'en-GB',
            currency: currencySelect.value,
            amount: amountMinor,
            payment_type: paymentTypeSel.value,
            capture: captureToggle.checked,
            reference: `#WalletFlow_${Math.floor(Math.random() * 10000)}`,
            billing: {
                address: {
                    country: countrySelect.value
                }
            },
            payment_method_configuration: {
                card: { store_payment_details: 'collect_consent' }
            },
            disabled_payment_methods: ['remember_me'],
            processing_channel_id: window.APP_CONFIG.processingChannelId,
            success_url: `${window.location.protocol}//${window.location.host}/success.html`,
            failure_url: `${window.location.protocol}//${window.location.host}/failure.html`,
            customer: {
                email: emailInput.value,
                name: nameInput.value
            },
            '3ds': { enabled: threeDsToggle.checked },
            processing: { pan_preference: 'fpan' },
            items: [
                {
                    name: 'Digital Goods',
                    quantity: 1,
                    unit_price: amountMinor,
                    total_amount: amountMinor,
                    reference: 'digital-goods'
                }
            ]
        };
    }

    function stopWebhookPolling() {
        if (_webhookPollInterval) { clearInterval(_webhookPollInterval); _webhookPollInterval = null; }
    }

    function startWebhookPolling(paymentId) {
        stopWebhookPolling();
        const startTime = Date.now();
        const statusEl = document.getElementById('flow-wallet-webhook-status');
        if (statusEl) statusEl.textContent = 'Waiting for webhook (up to 2 minutes)…';

        _webhookPollInterval = setInterval(async () => {
            if (Date.now() - startTime > 120000) {
                if (statusEl) statusEl.textContent = 'No webhook received within 2 minutes.';
                stopWebhookPolling();
                return;
            }
            try {
                const res = await fetch(`${window.APP_CONFIG.apiBaseUrl}/webhook-event?paymentId=${paymentId}`);
                if (res.status === 404) return;
                const event = await res.json();
                if (!event.found) return;
                addToApiLog('WEBHOOK', `${event.type} — /webhook`, 200, {}, event.data);
                if (statusEl) statusEl.textContent = `Webhook received: ${event.type}`;
                stopWebhookPolling();
            } catch { /* ignore, retry next tick */ }
        }, 2000);
    }

    // Submits the wallet-derived token to the existing /payments route with
    // source.type: "token" — the same route Payment Setup's direct-card flow
    // uses (payment-setup.js). Including `customer` (email/name captured
    // from the wallet's onAuthorized contact where available) lets Checkout.com
    // upsert a Customer record tied to this email for future payments.
    async function submitWalletTokenPayment(walletType, tokenizeResult, sessionBody) {
        logStep('📤 Submitting token to backend <code>/payments</code> (source.type: "token")…');

        const customer = deriveCustomerFromContact(
            walletType,
            _lastAuthorizedContact,
            sessionBody.customer.email,
            sessionBody.customer.name
        );

        const paymentBody = {
            source: { type: 'token', token: tokenizeResult.data.token },
            amount: sessionBody.amount,
            currency: sessionBody.currency,
            payment_type: sessionBody.payment_type,
            capture: sessionBody.capture,
            processing_channel_id: window.APP_CONFIG.processingChannelId,
            reference: `#WalletFlowPay_${Math.floor(Math.random() * 10000)}`,
            success_url: sessionBody.success_url,
            failure_url: sessionBody.failure_url,
            customer,
        };

        let payData;
        try {
            const payRes = await fetch(`${window.APP_CONFIG.apiBaseUrl}/payments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(paymentBody),
            });
            payData = await payRes.json();
        } catch (e) {
            logStep('❌ Payment submission request failed.');
            showToast('Payment submission failed. Please try again.', 'error');
            return;
        }

        const payment = payData.payment;
        addToApiLog('POST', `wallet tokenize payment (${walletType}) - /payments`, payment?.id ? 201 : 422, paymentBody, payData);

        if (!payment?.id) {
            logStep('❌ Payment submission failed — see the API log entry for details.');
            showToast('Payment submission failed.', 'error');
            return;
        }

        if (payment._links?.redirect) {
            logStep('↪️ Additional authentication required — redirecting to the challenge URL…');
            window.location.href = payment._links.redirect.href;
            return;
        }

        renderPaymentPanel(payment);
        renderActionButtons(payment);

        if (FAILED_STATUSES_FLOW_WALLET.includes(payment.status)) {
            logStep(`❌ Payment <b>${payment.status}</b> (id: ${payment.id}).`);
            showToast(`Payment ${payment.status}.`, 'error');
        } else {
            logStep(`✅ Payment <b>${payment.status}</b> (id: ${payment.id}). Polling for webhook…`);
            showToast('Wallet payment submitted successfully!');
            startWebhookPolling(payment.id);
        }
    }

    async function mountFlowWallet(walletType) {
        resetPanels();

        const container = document.getElementById('flow-wallet-container');
        const resultBlock = document.getElementById('flow-wallet-result');
        if (!container || !resultBlock) return;
        container.innerHTML = '';
        container.style.display = 'flex';
        resultBlock.style.display = 'block';

        const walletLabel = walletType === 'apple' ? 'Apple Pay' : 'Google Pay';
        logStep(`Creating Flow payment session for the ${walletLabel} tokenize flow…`);

        const sessionBody = buildSessionBody();

        let session;
        try {
            const res = await fetch(`${window.APP_CONFIG.apiBaseUrl}/payment-sessions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(sessionBody),
            });
            session = await res.json();
            await addToApiLog('POST', `create tokenize-mode wallet session: ${session.id} - /payment-sessions`, session.id ? 201 : 422, sessionBody, session);
        } catch (e) {
            logStep('❌ Failed to create payment session.');
            showToast('Failed to create payment session for the wallet tokenize flow.', 'error');
            return;
        }

        if (!session.id) {
            logStep('❌ Payment session creation failed — see the API log entry for details.');
            showToast('Payment session creation failed.', 'error');
            return;
        }
        logStep(`✅ Payment session created: <span class="token-value" style="padding:1px 6px;">${session.id}</span>`);

        const onAuthorized = async (_self, authorizeResult) => {
            logStep('🔓 Wallet authorized — reading contact/shipping/billing data captured by the component…');
            _lastAuthorizedContact = extractWalletContact(walletType, authorizeResult);
            renderContactPanel(_lastAuthorizedContact);
            return { continue: true };
        };

        const onTokenized = async (_self, tokenizeResult) => {
            logStep(`🔑 Wallet token received via <code>onTokenized</code> (type: ${tokenizeResult.type}).`);
            renderTokenPanel(tokenizeResult.data);
            await submitWalletTokenPayment(walletType, tokenizeResult, sessionBody);
        };

        const onError = (_self, error) => {
            logStep(`❌ Flow error: ${error.message || error.details?.error_type || 'Unknown error'}.`);
            showToast(error.message || `${walletLabel} tokenization failed.`, 'error');
        };

        let checkout;
        try {
            checkout = await CheckoutWebComponents({
                publicKey: window.APP_CONFIG.publicKey,
                environment: 'sandbox',
                paymentSession: session,
                appearance: getFlowAppearance(),
                onError,
            });
        } catch (e) {
            console.error('CheckoutWebComponents init error:', e);
            logStep('❌ Failed to initialize Checkout Web Components.');
            return;
        }

        const componentType = walletType === 'apple' ? 'applepay' : 'googlepay';
        const component = checkout.create(componentType, {
            mode: 'tokenize',
            captureBillingAddress: true,
            onAuthorized,
            onTokenized,
        });

        if (await component.isAvailable()) {
            component.mount(container);
            logStep(`${walletLabel} button mounted in tokenize mode — authorize the payment in the wallet sheet to continue.`);
        } else {
            logStep(`⚠️ ${walletLabel} isn't available in this browser/device/session.`);
            showToast(`${walletLabel} isn't available here — try Safari for Apple Pay, or Chrome with a saved card for Google Pay.`, 'error');
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        const appleFlowOption  = document.getElementById('select-apple-pay-flow');
        const googleFlowOption = document.getElementById('select-google-pay-flow');

        const selectFlowWallet = (walletType, activeEl) => {
            document.querySelectorAll('#flow-wallet-section .wallet-option').forEach(el => el.classList.remove('active'));
            if (activeEl) activeEl.classList.add('active');
            mountFlowWallet(walletType);
        };

        if (appleFlowOption)  appleFlowOption.addEventListener('click',  () => selectFlowWallet('apple', appleFlowOption));
        if (googleFlowOption) googleFlowOption.addEventListener('click', () => selectFlowWallet('google', googleFlowOption));
    });
})();
