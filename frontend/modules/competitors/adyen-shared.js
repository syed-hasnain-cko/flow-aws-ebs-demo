// =============================================
// Adyen Shared Helpers
// Used by BOTH the Competitor Testing → Adyen tab and the app-wide
// success.html/failure.html pages, so an Adyen payment lands on and
// renders through the exact same result pages every other payment
// method in this app uses (#payment-details-response, #action-buttons,
// #webhook-status, #details-container).
// Depends on: utils.js (showToast, formatJSON), api-log.js (addToApiLog),
//             window.APP_CONFIG (frontend-config.js)
// =============================================

(function () {
    function base() { return `${window.APP_CONFIG.apiBaseUrl}/competitors/adyen`; }

    function renderJSON(el, data) {
        el.innerHTML = typeof formatJSON === 'function' ? formatJSON(data) : `<pre>${JSON.stringify(data, null, 2)}</pre>`;
    }

    // Adyen's returnUrl is built by our backend as
    //   success.html?partner=adyen&adyen_ref=<ref>[&adyen_flow=advanced]
    // and Adyen appends: sessionId + redirectResult (Drop-in/Components),
    // sessionId + sessionResult (Hosted Checkout), or redirectResult only
    // (Advanced flow).
    function detectReturnParams() {
        const p = new URLSearchParams(window.location.search);
        return {
            partner: p.get('partner'),
            ref: p.get('adyen_ref'),
            flow: p.get('adyen_flow'), // 'advanced' | null
            sessionId: p.get('sessionId'),
            sessionResult: p.get('sessionResult'),
            redirectResult: p.get('redirectResult'),
            sdkResult: p.get('adyen_result'), // resultCode from the Web SDK's own completion callback
        };
    }

    function isAdyenReturn() {
        const p = detectReturnParams();
        return p.partner === 'adyen' && !!p.ref;
    }

    async function post(route, body) {
        const res = await fetch(`${base()}/${route}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const data = await res.json();
        await addToApiLog('POST', `${route} - /competitors/adyen/${route}`, res.ok ? 200 : res.status, body, data);
        return { ok: res.ok, data };
    }

    async function doAction(route, body) {
        return post(route, body);
    }

    // Adyen has no "get payment" endpoint, so capture/cancel/refund can't be
    // gated on a fetched status — all three are offered once the original
    // authorisation's pspReference + amount are known (from /payments/details
    // or the AUTHORISATION webhook). Adyen rejects the ones that don't apply.
    function renderActionButtons(container, payment, onRefresh) {
        if (!container) return;
        container.innerHTML = '';
        if (!payment?.pspReference) {
            container.style.display = 'none';
            return;
        }
        const buttons = [
            ['Capture', () => doAction('capture', { psp_reference: payment.pspReference, amount: payment.amount, currency: payment.currency })],
            ['Cancel', () => doAction('cancel', { psp_reference: payment.pspReference })],
            ['Refund', () => doAction('refund', { psp_reference: payment.pspReference, amount: payment.amount, currency: payment.currency })],
        ];
        buttons.forEach(([label, action]) => {
            const btn = document.createElement('button');
            btn.textContent = label;
            btn.className = 'main-button';
            btn.addEventListener('click', async () => {
                const { ok, data } = await action();
                if (ok) {
                    showToast(`${label} requested (${data.status}) — outcome arrives via webhook.`);
                    if (onRefresh) onRefresh();
                } else {
                    showToast(`${label} failed.`, false);
                }
            });
            container.appendChild(btn);
        });
        container.style.display = 'flex';
    }

    function startWebhookPolling(id, statusEl, onEvent) {
        let elapsed = 0;
        if (statusEl) {
            statusEl.style.display = 'block';
            statusEl.textContent = '⏳ Listening for webhook updates...';
        }
        const timer = setInterval(async () => {
            elapsed += 2000;
            const res = await fetch(`${base()}/webhook-event?id=${encodeURIComponent(id)}`);
            const data = await res.json();
            if (data.found) {
                if (statusEl) statusEl.textContent = `Webhook: ${data.type.replace(/_/g, ' ').toLowerCase()} (success: ${data.success})`;
                await addToApiLog('INCOMING WEBHOOK', `${data.type} — /competitors/adyen/webhook`, 200, {}, data.data);
                onEvent(data);
                return; // keep polling: AUTHORISATION is often followed by CAPTURE etc.
            }
            if (elapsed >= 120000) {
                clearInterval(timer);
            }
        }, 2000);
        return timer;
    }

    // Resolves the outcome ONCE per return and caches it in sessionStorage so
    // the failure.html handoff doesn't re-submit single-use redirect data.
    async function resolveStatus(params) {
        const cacheKey = `adyen_result_${params.ref}`;
        const cached = sessionStorage.getItem(cacheKey);
        if (cached) return JSON.parse(cached);

        let result = { failed: false, summary: { reference: params.ref }, payment: null };

        if (params.flow === 'advanced' && params.redirectResult) {
            const { ok, data } = await post('payments-details', { state_data: { details: { redirectResult: params.redirectResult } } });
            result.summary.paymentsDetails = data;
            result.failed = !ok || !['Authorised', 'Received', 'Pending'].includes(data.resultCode);
            if (ok && data.pspReference) result.payment = { pspReference: data.pspReference, amount: data.amount?.value, currency: data.amount?.currency };
        } else if (params.sessionId && params.sessionResult) {
            const res = await fetch(`${base()}/session-result?sessionId=${encodeURIComponent(params.sessionId)}&sessionResult=${encodeURIComponent(params.sessionResult)}`);
            const data = await res.json();
            await addToApiLog('GET', `get session result: ${params.sessionId} - /competitors/adyen/session-result`, res.ok ? 200 : res.status, {}, data);
            result.summary.sessionResult = data;
            result.failed = !res.ok || ['canceled', 'expired'].includes(data.status);
        } else {
            // Drop-in/Components redirect (sessionId + redirectResult only): the SDK
            // that created the session isn't loaded on this page, so the AUTHORISATION
            // webhook is the source of truth for the outcome.
            if (params.sdkResult) result.summary.sdkResultCode = params.sdkResult;
            result.summary.note = 'Outcome confirmed by the AUTHORISATION webhook — waiting for it.';
        }

        sessionStorage.setItem(cacheKey, JSON.stringify(result));
        return result;
    }

    // Renders into the SAME elements success.html / failure.html already use
    // for Checkout.com payments. `handoffOnFailure` is true only on success.html.
    async function renderReturnPage({ detailsEl, detailsContainer, actionsEl, webhookStatusEl, paymentIdEl, handoffOnFailure }) {
        const params = detectReturnParams();
        const result = await resolveStatus(params);

        if (result.failed && handoffOnFailure) {
            window.location.replace('failure.html' + window.location.search);
            return { outcome: 'handoff' };
        }

        if (paymentIdEl) paymentIdEl.textContent = result.payment?.pspReference || params.ref;

        const state = { ...result.summary, webhookEvents: [] };
        let payment = result.payment;
        const refresh = () => {
            renderJSON(detailsEl, state);
            detailsContainer.style.display = 'flex';
            renderActionButtons(actionsEl, payment, () => {});
        };
        refresh();

        if (webhookStatusEl) {
            startWebhookPolling(params.ref, webhookStatusEl, (event) => {
                state.webhookEvents.push({ eventCode: event.type, success: event.success, pspReference: event.data.pspReference, reason: event.data.reason });
                if (event.type === 'AUTHORISATION' && event.data.pspReference) {
                    payment = { pspReference: event.data.pspReference, amount: event.data.amount?.value, currency: event.data.amount?.currency };
                    if (paymentIdEl) paymentIdEl.textContent = payment.pspReference;
                }
                refresh();
            });
        }
        return { outcome: result.failed ? 'failed' : 'ok' };
    }

    window.AdyenShared = {
        detectReturnParams,
        isAdyenReturn,
        doAction,
        renderActionButtons,
        startWebhookPolling,
        renderReturnPage,
    };
})();
