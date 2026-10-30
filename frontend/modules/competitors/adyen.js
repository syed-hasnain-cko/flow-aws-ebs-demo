// =============================================
// Competitor Testing → Adyen module
// Modes: Drop-in (Sessions), Components/Card (Sessions), Hosted Checkout,
//        Advanced flow (/paymentMethods + /payments + /payments/details),
//        Pay by Link. Shared Capture/Cancel/Refund panel + webhook log.
// Depends on: utils.js (showToast), api-log.js (addToApiLog),
//             payment-setup.js (setStatus), window.APP_CONFIG (frontend-config.js),
//             Adyen Web SDK v6 (window.AdyenWeb, loaded in index.html)
// =============================================

(function () {
    const ADYEN_BASE = () => `${window.APP_CONFIG.apiBaseUrl}/competitors/adyen`;

    let adyenConfig = null;
    let activeInstance = null; // currently mounted Drop-in / Component, destroyed on re-create
    const webhookTimers = [];
    const seenWebhookEvents = new Set();

    async function getConfig() {
        if (adyenConfig) return adyenConfig;
        const res = await fetch(`${ADYEN_BASE()}/config`);
        adyenConfig = await res.json();
        return adyenConfig;
    }

    // Single backend call helper — every request goes through the API log sidebar.
    async function call(method, route, body, label) {
        const res = await fetch(`${ADYEN_BASE()}/${route}`, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: body ? JSON.stringify(body) : undefined,
        });
        const data = await res.json();
        await addToApiLog(method, withUpstream(res, label || route, `/competitors/adyen/${route.split('?')[0]}`), res.ok ? 200 : res.status, body || {}, data);
        return { ok: res.ok, data };
    }

    function readCommon(prefix) {
        return {
            amount: parseInt(document.getElementById(`adyen-${prefix}-amount`).value, 10),
            currency: document.getElementById(`adyen-${prefix}-currency`).value,
            country_code: document.getElementById(`adyen-${prefix}-country`).value,
            manual_capture: !!document.getElementById(`adyen-${prefix}-manual-capture`)?.checked,
        };
    }

    function ensureSdk(statusEl) {
        if (!window.AdyenWeb) {
            setStatus(statusEl, 'error', 'Adyen Web SDK failed to load (check the script tag in index.html / network).');
            return false;
        }
        return true;
    }

    async function ensureClientKey(statusEl) {
        const cfg = await getConfig();
        if (!cfg.clientKey || !cfg.merchantAccount) {
            setStatus(statusEl, 'error', 'ADYEN_CLIENT_KEY / ADYEN_MERCHANT_ACCOUNT is not set — add to .env / Lambda env vars.');
            return null;
        }
        return cfg;
    }

    // ─── Theme bridge (partner-theme.js) ────────────────────────────────────
    // Everything Adyen draws outside the card iframes follows --adyen-sdk-* CSS variables, which PartnerTheme keeps
    // on :root — so a theme change restyles Drop-in / Components instantly. The card number / expiry / CVC fields are
    // secured iframes; only the `styles` option reaches them, and it is read at mount time, hence the re-mount below.
    // Every use is guarded so a theming problem can never stop a payment flow.
    const themed = (fn, fallback) => { try { return window.PartnerTheme ? fn(window.PartnerTheme) : fallback; } catch (e) { console.warn('[adyen theme]', e); return fallback; } };
    let activeRemount = null;        // re-mounts the live component with fresh field styles
    let paymentSubmitted = false;    // advanced flow: once the shopper has submitted, never replace the component

    function destroyActive() {
        if (activeInstance && activeInstance.unmount) activeInstance.unmount();
        activeInstance = null;
        activeRemount = null;
        paymentSubmitted = false;
    }

    if (window.PartnerTheme) {
        window.PartnerTheme.onChange(() => {
            if (!activeRemount || paymentSubmitted) return;
            // A 3DS / challenge frame means a payment is mid-action — leave it alone.
            if (document.querySelector('[id^="adyen-"][id$="-container"] iframe[name*="threeDS" i], [id^="adyen-"][id$="-container"] iframe[src*="3ds" i]')) return;
            try { activeRemount(); } catch (e) { console.warn('[adyen theme] re-mount failed', e); }
        });
    }

    function goToResult(ok, params) {
        const q = new URLSearchParams({ partner: 'adyen', ...params });
        window.location.href = `${ok ? 'success' : 'failure'}.html?${q.toString()}`;
    }

    // ─── Sessions flow: Drop-in and Components (Card) ─────────────────────
    async function onCreateSessionSdk(mode) {
        const statusEl = document.getElementById(`adyen-${mode}-status`);
        if (!ensureSdk(statusEl)) return;
        const cfg = await ensureClientKey(statusEl);
        if (!cfg) return;

        const common = readCommon(mode);
        if (!common.amount || !common.currency || !common.country_code) {
            setStatus(statusEl, 'error', 'Amount, currency and country are required.');
            return;
        }

        setStatus(statusEl, 'action', 'Creating session...');
        const body = { ...common, return_base: window.location.origin, mode };
        const { ok, data: session } = await call('POST', 'sessions', body, 'create session');
        if (!ok) {
            setStatus(statusEl, 'error', session.message || session.error || 'Session creation failed.');
            return;
        }

        destroyActive();
        const container = document.getElementById(`adyen-${mode}-container`);
        container.innerHTML = '';

        const { AdyenCheckout, Dropin, Card } = window.AdyenWeb;
        const checkout = await AdyenCheckout({
            environment: cfg.environment,
            clientKey: cfg.clientKey,
            amount: { value: common.amount, currency: common.currency },
            countryCode: common.country_code,
            locale: 'en-US',
            session: { id: session.id, sessionData: session.sessionData },
            onPaymentCompleted: async (result) => {
                await addToApiLog('POST', 'AdyenCheckout onPaymentCompleted (client-side)', 200, {}, result);
                goToResult(true, { adyen_ref: session.reference, sessionId: session.id, adyen_result: result.resultCode, ...(result.sessionResult ? { adyen_sr: result.sessionResult } : {}) });
            },
            onPaymentFailed: async (result) => {
                await addToApiLog('POST', 'AdyenCheckout onPaymentFailed (client-side)', 402, {}, result);
                goToResult(false, { adyen_ref: session.reference, sessionId: session.id, adyen_result: result.resultCode, ...(result.sessionResult ? { adyen_sr: result.sessionResult } : {}) });
            },
            onError: async (error) => {
                await addToApiLog('POST', 'AdyenCheckout onError (client-side)', 500, {}, { name: error.name, message: error.message });
                setStatus(statusEl, 'error', error.message);
            },
        });

        const mountSession = () => {
            const styles = themed(t => t.adyenFieldStyles(), undefined);
            container.innerHTML = '';
            return mode === 'component'
                ? new Card(checkout, styles ? { styles } : {}).mount(container)
                : new Dropin(checkout, styles ? { paymentMethodsConfiguration: { card: { styles } } } : {}).mount(container);
        };
        activeInstance = mountSession();
        activeRemount = () => { if (activeInstance && activeInstance.unmount) activeInstance.unmount(); activeInstance = mountSession(); };

        setStatus(statusEl, 'ready', `${mode === 'component' ? 'Card component' : 'Drop-in'} mounted (session ${session.id}). Watching for webhook...`);
        startWebhookPolling(session.reference);
    }

    // ─── Hosted Checkout ──────────────────────────────────────────────────
    async function onCreateHosted() {
        const statusEl = document.getElementById('adyen-hosted-status');
        const common = readCommon('hosted');
        const shopper_email = document.getElementById('adyen-hosted-email').value.trim();
        const shopper_reference = document.getElementById('adyen-hosted-shopper-ref').value.trim();
        const theme_id = document.getElementById('adyen-hosted-theme').value.trim();
        if (!common.amount || !common.currency || !common.country_code || !shopper_email || !shopper_reference || !theme_id) {
            setStatus(statusEl, 'error', 'Amount, currency, country, shopper email, shopper reference and theme ID are all required for Hosted Checkout.');
            return;
        }
        setStatus(statusEl, 'action', 'Creating hosted session...');
        const body = { ...common, return_base: window.location.origin, mode: 'hosted', shopper_email, shopper_reference, theme_id };
        const { ok, data } = await call('POST', 'sessions', body, 'create hosted session');
        if (!ok || !data.url) {
            setStatus(statusEl, 'error', data.message || data.error || 'Hosted session creation failed.');
            return;
        }
        setStatus(statusEl, 'action', 'Redirecting to Adyen-hosted Checkout...');
        window.location.href = data.url;
    }

    // ─── Advanced flow ────────────────────────────────────────────────────
    function showAdvancedResult(data) {
        document.getElementById('adyen-advanced-result-container').style.display = 'block';
        document.getElementById('adyen-advanced-result').textContent = JSON.stringify(data, null, 2);
    }

    async function onCreateAdvanced() {
        const statusEl = document.getElementById('adyen-advanced-status');
        if (!ensureSdk(statusEl)) return;
        const cfg = await ensureClientKey(statusEl);
        if (!cfg) return;

        const common = readCommon('advanced');
        if (!common.amount || !common.currency || !common.country_code) {
            setStatus(statusEl, 'error', 'Amount, currency and country are required.');
            return;
        }

        setStatus(statusEl, 'action', 'Fetching payment methods...');
        const pm = await call('POST', 'payment-methods', common, 'get payment methods');
        if (!pm.ok) {
            setStatus(statusEl, 'error', pm.data.message || pm.data.error || '/paymentMethods failed.');
            return;
        }

        destroyActive();
        const container = document.getElementById('adyen-advanced-container');
        container.innerHTML = '';
        let reference = null; // set by the first /payments response, reused for /payments/details + result page

        const { AdyenCheckout, Dropin } = window.AdyenWeb;
        const checkout = await AdyenCheckout({
            environment: cfg.environment,
            clientKey: cfg.clientKey,
            amount: { value: common.amount, currency: common.currency },
            countryCode: common.country_code,
            locale: 'en-US',
            paymentMethodsResponse: pm.data,
            onSubmit: async (state, component, actions) => {
                paymentSubmitted = true;
                const { ok, data } = await call('POST', 'payments', {
                    ...common,
                    return_base: window.location.origin,
                    reference: reference || undefined,
                    state_data: state.data,
                }, 'create payment');
                showAdvancedResult(data);
                if (!ok) return actions.reject();
                reference = data.reference;
                if (data.pspReference) prefillActionPanel(data.pspReference, common.amount, common.currency);
                startWebhookPolling(reference);
                actions.resolve({ resultCode: data.resultCode, action: data.action, order: data.order, donationToken: data.donationToken });
            },
            onAdditionalDetails: async (state, component, actions) => {
                const { ok, data } = await call('POST', 'payments-details', { state_data: state.data }, 'submit payment details');
                showAdvancedResult(data);
                if (!ok) return actions.reject();
                if (data.pspReference) prefillActionPanel(data.pspReference, common.amount, common.currency);
                actions.resolve({ resultCode: data.resultCode, action: data.action, order: data.order, donationToken: data.donationToken });
            },
            onPaymentCompleted: async (result) => {
                await addToApiLog('POST', 'AdyenCheckout onPaymentCompleted (client-side)', 200, {}, result);
                goToResult(true, { adyen_ref: reference, adyen_result: result.resultCode });
            },
            onPaymentFailed: async (result) => {
                await addToApiLog('POST', 'AdyenCheckout onPaymentFailed (client-side)', 402, {}, result);
                goToResult(false, { adyen_ref: reference, adyen_result: result.resultCode });
            },
            onError: async (error) => {
                await addToApiLog('POST', 'AdyenCheckout onError (client-side)', 500, {}, { name: error.name, message: error.message });
                setStatus(statusEl, 'error', error.message);
            },
        });

        const mountAdvanced = () => {
            const styles = themed(t => t.adyenFieldStyles(), undefined);
            container.innerHTML = '';
            return new Dropin(checkout, styles ? { paymentMethodsConfiguration: { card: { styles } } } : {}).mount(container);
        };
        paymentSubmitted = false;
        activeInstance = mountAdvanced();
        activeRemount = () => { if (activeInstance && activeInstance.unmount) activeInstance.unmount(); activeInstance = mountAdvanced(); };
        setStatus(statusEl, 'ready', 'Drop-in mounted using your own /paymentMethods, /payments and /payments/details calls.');
    }

    // ─── Pay by Link ──────────────────────────────────────────────────────
    let lastLinkId = null;

    async function onCreateLink() {
        const statusEl = document.getElementById('adyen-links-status');
        const amount = parseInt(document.getElementById('adyen-links-amount').value, 10);
        const currency = document.getElementById('adyen-links-currency').value;
        const country_code = document.getElementById('adyen-links-country').value;
        if (!amount || !currency) {
            setStatus(statusEl, 'error', 'Amount and currency are required.');
            return;
        }
        setStatus(statusEl, 'action', 'Creating Payment Link...');
        const body = {
            amount, currency, country_code,
            description: document.getElementById('adyen-links-description').value,
            reusable: document.getElementById('adyen-links-reusable').checked,
        };
        const { ok, data } = await call('POST', 'payment-links', body, 'create payment link');
        if (!ok) {
            setStatus(statusEl, 'error', data.message || data.error || 'Payment Link creation failed.');
            return;
        }
        lastLinkId = data.id;
        setStatus(statusEl, 'ready', `Payment Link created (${data.id}). Watching for webhook...`);
        document.getElementById('adyen-links-result').style.display = 'block';
        document.getElementById('adyen-links-url').value = data.url;
        document.getElementById('adyen-links-open-btn').href = data.url;
        document.getElementById('adyen-links-json').textContent = JSON.stringify(data, null, 2);
        startWebhookPolling(data.reference);
    }

    async function onCheckLink() {
        if (!lastLinkId) return;
        const { ok, data } = await call('GET', `payment-link/${lastLinkId}`, null, `get payment link: ${lastLinkId}`);
        document.getElementById('adyen-links-json').textContent = JSON.stringify(data, null, 2);
        if (ok) showToast(`Link status: ${data.status}`);
    }

    // ─── Capture / Cancel / Refund ────────────────────────────────────────
    function prefillActionPanel(pspReference, amount, currency) {
        document.getElementById('adyen-action-psp').value = pspReference;
        if (amount) document.getElementById('adyen-action-amount').value = amount;
        if (currency) document.getElementById('adyen-action-currency').value = currency;
    }

    async function onAction(route) {
        const statusEl = document.getElementById('adyen-actions-status');
        const psp_reference = document.getElementById('adyen-action-psp').value.trim();
        const amount = parseInt(document.getElementById('adyen-action-amount').value, 10);
        const currency = document.getElementById('adyen-action-currency').value;
        if (!psp_reference) {
            setStatus(statusEl, 'error', 'Enter the payment pspReference.');
            return;
        }
        if (route !== 'cancel' && !amount) {
            setStatus(statusEl, 'error', 'Amount is required for capture and refund.');
            return;
        }
        const body = route === 'cancel' ? { psp_reference } : { psp_reference, amount, currency };
        const { ok, data } = await call('POST', route, body, route);
        document.getElementById('adyen-actions-result-container').style.display = 'block';
        document.getElementById('adyen-actions-result').textContent = JSON.stringify(data, null, 2);
        if (ok) {
            setStatus(statusEl, 'ready', `${route} requested (status: ${data.status}). Watching for the webhook...`);
            startWebhookPolling(psp_reference);
        } else {
            setStatus(statusEl, 'error', data.message || data.error || `${route} failed.`);
        }
    }

    // ─── Webhook polling (2 minutes, same pattern as every other partner) ─
    function startWebhookPolling(key) {
        if (!key) return;
        const statusEl = document.getElementById('adyen-webhook-status');
        statusEl.style.display = 'block';
        statusEl.textContent = `Polling for webhook events (${key})...`;

        let elapsed = 0;
        const timer = setInterval(async () => {
            elapsed += 2000;
            const res = await fetch(`${ADYEN_BASE()}/webhook-event?id=${encodeURIComponent(key)}`);
            const data = await res.json();
            if (data.found) {
                const dedupeKey = `${data.type}:${data.data.pspReference}:${data.data.eventDate}`;
                if (!seenWebhookEvents.has(dedupeKey)) {
                    seenWebhookEvents.add(dedupeKey);
                    statusEl.textContent = `Webhook received: ${data.type} (success: ${data.success})`;
                    logWebhookEntry(data);
                    if (data.type === 'AUTHORISATION' && data.success === 'true') {
                        prefillActionPanel(data.data.pspReference, data.data.amount?.value, data.data.amount?.currency);
                    }
                }
            }
            if (elapsed >= 120000) {
                clearInterval(timer);
                statusEl.textContent = 'Webhook polling window ended (2 minutes).';
            }
        }, 2000);
        webhookTimers.push(timer);
    }

    function stopWebhookPolling() {
        webhookTimers.splice(0).forEach(clearInterval);
    }
    window.stopAdyenWebhookPolling = stopWebhookPolling;

    function logWebhookEntry(event) {
        const container = document.getElementById('adyen-webhook-log');
        const entry = document.createElement('div');
        entry.style.padding = '6px 0';
        entry.style.borderBottom = '1px solid var(--border)';
        entry.style.fontSize = '12px';
        const d = event.data;
        entry.innerHTML = `<strong>${event.type}</strong> — pspReference <code>${d.pspReference}</code>` +
            `${d.originalReference ? `, original <code>${d.originalReference}</code>` : ''} (success: ${event.success}${d.reason ? `, ${d.reason}` : ''})`;
        container.prepend(entry);
        addToApiLog('INCOMING WEBHOOK', `${event.type} — /competitors/adyen/webhook`, 200, {}, d);
    }

    // ─── Test cards (data + per-section messaging live in modules/data.js) ──
    function renderTestCards() {
        document.querySelectorAll('.adyen-test-cards').forEach(container => {
            const ctx = ADYEN_TEST_CARD_CONTEXT[container.dataset.context];
            if (!ctx) return;
            const chip = (label, value) =>
                `<span class="adyen-tc-chip" data-copy="${value}" title="Click to copy">${label}</span>`;
            const rows = ADYEN_TEST_CARDS.map(c => `
                <div class="adyen-tc-row">
                    <span class="adyen-tc-label"><strong>${c.scheme}</strong> · ${c.type} · ${c.country}<br>${c.tests}</span>
                    ${chip(c.number.replace(/(\d{4})(?=\d)/g, '$1 '), c.number)}
                    ${chip(`exp ${c.expiry}`, c.expiry)}
                    ${chip(`cvc ${c.cvc}`, c.cvc)}
                </div>`).join('');
            container.innerHTML = `
                <div class="adyen-tc-panel">
                    <h3>Adyen test cards</h3>
                    <p><strong>How to use:</strong> ${ctx.entry}</p>
                    <p><strong>What this section tests:</strong> ${ctx.tests}</p>
                    ${rows}
                    <div class="adyen-tc-note">Sandbox cards from Adyen's docs (Test card numbers); they only work on Adyen's test platform.
                    3D Secure 2 cards and refusal/outcome-trigger test rules are not listed here — see Adyen's testing docs.</div>
                </div>`;
        });
    }

    // One delegated listener copies any chip's value (container is re-rendered, not re-bound).
    document.addEventListener('click', async (e) => {
        const chip = e.target.closest('.adyen-tc-chip');
        if (!chip) return;
        try {
            await navigator.clipboard.writeText(chip.dataset.copy);
            showToast(`Copied ${chip.dataset.copy}`);
        } catch (err) {
            showToast('Copy failed — select the value manually.', false);
        }
    });

    // ─── Wiring ───────────────────────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', () => {
        const dropinBtn = document.getElementById('adyen-dropin-create-btn');
        if (!dropinBtn) return; // tab not yet loaded on this page

        renderTestCards();

        const urlDisplay = document.getElementById('adyen-webhook-url-display');
        if (urlDisplay && window.APP_CONFIG?.apiBaseUrl) {
            urlDisplay.textContent = `${window.APP_CONFIG.apiBaseUrl}/competitors/adyen/webhook`;
        }

        // The partner-selector click handling (showing #partner-panel-adyen) is
        // bound generically in stripe.js for every non-disabled partner option.
        document.querySelectorAll('#adyen-mode-selector .wallet-option').forEach(opt => {
            opt.addEventListener('click', () => {
                document.querySelectorAll('#adyen-mode-selector .wallet-option').forEach(o => o.classList.remove('active'));
                opt.classList.add('active');
                document.querySelectorAll('[id^="adyen-mode-panel-"]').forEach(p => p.style.display = 'none');
                const panel = document.getElementById(`adyen-mode-panel-${opt.dataset.mode}`);
                if (panel) panel.style.display = 'block';
                destroyActive();
            });
        });

        dropinBtn.addEventListener('click', () => onCreateSessionSdk('dropin'));
        document.getElementById('adyen-component-create-btn').addEventListener('click', () => onCreateSessionSdk('component'));
        document.getElementById('adyen-hosted-create-btn').addEventListener('click', onCreateHosted);
        document.getElementById('adyen-advanced-create-btn').addEventListener('click', onCreateAdvanced);
        document.getElementById('adyen-links-create-btn').addEventListener('click', onCreateLink);
        document.getElementById('adyen-links-check-btn').addEventListener('click', onCheckLink);
        document.getElementById('adyen-links-copy-btn').addEventListener('click', async () => {
            await navigator.clipboard.writeText(document.getElementById('adyen-links-url').value);
            showToast('Payment Link copied.');
        });
        document.getElementById('adyen-capture-btn').addEventListener('click', () => onAction('capture'));
        document.getElementById('adyen-cancel-btn').addEventListener('click', () => onAction('cancel'));
        document.getElementById('adyen-refund-btn').addEventListener('click', () => onAction('refund'));
    });
})();
