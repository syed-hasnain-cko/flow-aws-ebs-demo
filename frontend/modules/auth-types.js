// =============================================
// Authorization Types Testing Module
// Partial / Estimated (+ Incremental/Extend) / American Express Enhanced
// Authorization / Discover Enhanced Decisioning — all through the existing
// /payments, /capture-payment, /void-payment, /get-payment-details routes,
// plus the one new /increment-authorization route (no other new backend
// routes were needed for this feature).
// Depends on: utils.js (formatJSON, showToast, showConfirmDialog),
//             api-log.js (addToApiLog), modules/data.js (AUTH_TYPE_* consts, CURRENCIES)
// =============================================

(function () {
    const BALANCE_LABELS = [
        ['total_authorized',   'Total Authorized'],
        ['total_captured',     'Total Captured'],
        ['available_to_capture', 'Available to Capture'],
        ['total_voided',       'Total Voided'],
        ['available_to_void',  'Available to Void'],
        ['total_refunded',     'Total Refunded'],
        ['available_to_refund', 'Available to Refund'],
    ];

    let _selectedType = null; // 'partial' | 'estimated' | 'amex' | 'discover'
    let _currentPaymentId = null;
    let _currentScheme = null;
    let _actionPollInterval = null;

    function apiBase() { return window.APP_CONFIG.apiBaseUrl; }

    function $(id) { return document.getElementById(id); }

    function stopActionPoll() {
        if (_actionPollInterval) { clearInterval(_actionPollInterval); _actionPollInterval = null; }
    }

    function startActionWebhookPoll(paymentId, label) {
        stopActionPoll();
        const statusEl = $('at-action-webhook-status');
        statusEl.style.display = 'block';
        statusEl.textContent = `Waiting for a webhook confirming "${label}" (up to 2 minutes)…`;
        const startTime = Date.now();
        _actionPollInterval = setInterval(async () => {
            if (Date.now() - startTime > 2 * 60 * 1000) {
                statusEl.textContent = 'No webhook received within 2 minutes — refreshing anyway.';
                stopActionPoll();
                refreshPayment();
                return;
            }
            try {
                const res = await fetch(`${apiBase()}/webhook-event?paymentId=${paymentId}`);
                if (res.status === 404) return;
                const event = await res.json();
                if (!event.found) return;
                await addToApiLog('WEBHOOK', `${event.type} — /webhook`, 200, {}, event.data);
                statusEl.textContent = `Webhook received: ${event.type}`;
                stopActionPoll();
                refreshPayment();
            } catch (e) { /* retry next tick */ }
        }, 3000);
    }

    // ─── Type selection ───────────────────────────────────────────────────
    function selectType(type) {
        _selectedType = type;
        document.querySelectorAll('.at-type-card').forEach(el => el.classList.remove('active'));
        $(`at-type-${type}`).classList.add('active');

        ['partial', 'estimated', 'amex', 'discover'].forEach(t => {
            $(`at-info-${t}`).style.display = t === type ? 'block' : 'none';
        });

        $('at-select-type-hint').style.display = 'none';
        $('at-form-section').style.display = 'block';

        renderTypeCards(type);
        configureFormForType(type);
    }

    function fillCard(card) {
        $('at-card-number').value = card.number;
        $('at-card-cvv').value = card.cvv;
    }

    function renderTypeCards(type) {
        const row = $('at-cards-row');
        row.innerHTML = '';
        let cards;
        let note = '';
        if (type === 'partial') {
            cards = AUTH_TYPE_PARTIAL_CARDS;
            note = 'Click a card, then set Amount to 10000 or 1000 — both already wired to the Amount field below.';
        } else if (type === 'amex') {
            cards = AUTH_TYPE_STANDARD_CARDS.filter(c => c.scheme === 'American Express');
            note = 'Amex Enhanced Authorization is US-only and scheme-specific — use this Amex card to test it.';
        } else if (type === 'discover') {
            cards = AUTH_TYPE_STANDARD_CARDS.filter(c => c.scheme === 'Discover');
            note = 'Discover Enhanced Decisioning is scheme-specific — use this Discover card to test it.';
        } else {
            cards = AUTH_TYPE_STANDARD_CARDS;
            note = 'Any scheme works for an Estimated authorization — Incremental Authorization support varies by scheme once the payment is created (see Section 3).';
        }

        const noteEl = document.createElement('p');
        noteEl.style.cssText = 'font-size:11.5px; color:var(--text-muted); margin:0 0 8px; width:100%;';
        noteEl.textContent = note;
        row.appendChild(noteEl);

        cards.forEach(card => {
            const chip = document.createElement('span');
            chip.className = 'at-chip';
            chip.innerHTML = `<span class="at-chip-scheme">${card.scheme}</span> ${card.number} · CVV ${card.cvv}`;
            chip.addEventListener('click', () => {
                fillCard(card);
                if (type === 'partial') {
                    $('at-amount').value = AUTH_TYPE_PARTIAL_AMOUNTS[0];
                }
                showToast(`${card.scheme} test card filled in.`);
            });
            row.appendChild(chip);
        });

        // Amex/Discover only ever offer one scheme-specific card for their
        // flow — pre-fill it immediately instead of making the user click,
        // since there's no meaningful choice to make.
        if ((type === 'amex' || type === 'discover') && cards.length > 0) {
            fillCard(cards[0]);
        }
    }

    const ENHANCED_FIELD_GROUPS = [
        'at-field-email-group', 'at-field-phone-group', 'at-field-phone-cc-group', 'at-field-ip-group',
        'at-field-ship-fname-group', 'at-field-ship-lname-group', 'at-field-ship-addr1-group', 'at-field-ship-city-group',
        'at-field-ship-country-group', 'at-field-ship-zip-group', 'at-field-ship-method-group', 'at-field-ship-timeframe-group',
        'at-field-item-ref-group',
    ];
    // Fields specific to Amex (not part of Discover Enhanced Decisioning's field list).
    const AMEX_ONLY_FIELD_GROUPS = ['at-field-ship-method-group', 'at-field-ship-timeframe-group', 'at-field-item-ref-group'];
    // Discover's documented minimum (customer.email + payment_ip) — highlighted "required".
    const DISCOVER_REQUIRED_FIELD_GROUPS = ['at-field-email-group', 'at-field-ip-group'];

    function configureFormForType(type) {
        const isEnhanced = type === 'amex' || type === 'discover';
        $('at-enhanced-fields').style.display = isEnhanced ? 'block' : 'none';

        ENHANCED_FIELD_GROUPS.forEach(id => {
            const el = $(id);
            el.classList.remove('at-highlight-field');
            const existingBadge = el.querySelector('.at-required-badge');
            if (existingBadge) existingBadge.remove();
        });

        if (isEnhanced) {
            ENHANCED_FIELD_GROUPS.forEach(id => {
                // Amex-only fields don't apply to Discover — leave those un-highlighted (but still visible/optional).
                if (type === 'discover' && AMEX_ONLY_FIELD_GROUPS.includes(id)) return;
                const el = $(id);
                el.classList.add('at-highlight-field');
                if (type === 'discover' && DISCOVER_REQUIRED_FIELD_GROUPS.includes(id)) {
                    const label = el.querySelector('label');
                    const badge = document.createElement('span');
                    badge.className = 'at-field-badge required at-required-badge';
                    badge.textContent = 'required';
                    label.appendChild(badge);
                }
            });
        }

        // Amount note (partial only)
        const amountNote = $('at-amount-note');
        if (type === 'partial') {
            amountNote.style.display = 'block';
            amountNote.textContent = 'Must be exactly 10000 or 1000 (minor units) to trigger the sandbox partial-approval simulation.';
            $('at-amount').value = AUTH_TYPE_PARTIAL_AMOUNTS[0];
        } else {
            amountNote.style.display = 'none';
            if (type === 'estimated') $('at-amount').value = 10000;
            else $('at-amount').value = 6540;
        }

        // Capture toggle (auto-disabled + locked for Estimated; recommended off for Partial; free otherwise)
        const captureToggle = $('at-capture-toggle');
        const captureNote = $('at-capture-note');
        if (type === 'estimated') {
            captureToggle.checked = false;
            captureToggle.disabled = true;
            captureNote.style.display = 'block';
            captureNote.textContent = 'Checkout.com automatically disables capture-on-authorization for Estimated authorizations, regardless of this toggle.';
        } else if (type === 'partial') {
            captureToggle.checked = false;
            captureToggle.disabled = false;
            captureNote.style.display = 'block';
            captureNote.textContent = 'Recommended off — capture only after the customer confirms they accept the partially-approved amount.';
        } else {
            captureToggle.disabled = false;
            captureNote.style.display = 'none';
        }
    }

    // ─── Build request body ────────────────────────────────────────────────
    function buildPaymentBody() {
        const currency = $('at-currency').value;
        const amount = parseInt($('at-amount').value, 10);

        const body = {
            source: {
                number: $('at-card-number').value.trim(),
                expiry_month: parseInt($('at-card-expiry-month').value, 10),
                expiry_year: parseInt($('at-card-expiry-year').value, 10),
                cvv: $('at-card-cvv').value.trim(),
                name: $('at-card-name').value.trim(),
            },
            amount,
            currency,
            capture: $('at-capture-toggle').checked,
            reference: `#AuthType_${_selectedType}_${Math.floor(Math.random() * 10000)}`,
            processing_channel_id: window.APP_CONFIG.processingChannelId,
        };

        if (_selectedType === 'partial') {
            body.partial_authorization = { enabled: true };
        } else if (_selectedType === 'estimated') {
            body.authorization_type = 'Estimated';
        } else if (_selectedType === 'amex' || _selectedType === 'discover') {
            body.customer = {
                email: $('at-customer-email').value.trim(),
                phone: {
                    number: $('at-customer-phone').value.trim(),
                    country_code: $('at-customer-phone-cc').value.trim(),
                },
            };
            body.payment_ip = $('at-payment-ip').value.trim();
            body.shipping = {
                first_name: $('at-ship-first-name').value.trim(),
                last_name: $('at-ship-last-name').value.trim(),
                address: {
                    address_line1: $('at-ship-address1').value.trim(),
                    city: $('at-ship-city').value.trim(),
                    country: $('at-ship-country').value.trim().toUpperCase(),
                    zip: $('at-ship-zip').value.trim(),
                },
            };
            if (_selectedType === 'amex') {
                body.shipping.method = $('at-ship-method').value;
                body.shipping.timeframe = $('at-ship-timeframe').value;
                body.items = [{
                    name: 'Test Item',
                    quantity: 1,
                    unit_price: amount,
                    reference: $('at-item-reference').value.trim(),
                }];
            }
        }

        return body;
    }

    // ─── Result rendering ───────────────────────────────────────────────────
    function renderBalances(balances) {
        const tbody = document.querySelector('#at-balances-table tbody');
        tbody.innerHTML = '';
        if (!balances) {
            tbody.innerHTML = '<tr><td colspan="2" style="color:var(--text-muted);">No balances object on this response.</td></tr>';
            return;
        }
        BALANCE_LABELS.forEach(([key, label]) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${label}</td><td>${balances[key] != null ? balances[key] : '—'}</td>`;
            tbody.appendChild(tr);
        });
    }

    function renderPaymentResult(payment) {
        $('at-payment-result-panel').style.display = 'block';
        $('at-payment-result-response').innerHTML = formatJSON(payment);
        renderBalances(payment.balances);
    }

    // There's no response flag for either enhanced-data feature (confirmed
    // against CKO's docs — neither page defines one), so this checklist of
    // what was actually in the REQUEST we sent is the closest thing to a
    // pass/fail signal available in sandbox.
    const ENHANCED_CHECKLIST_FIELDS = {
        amex: [
            ['customer.email', b => b.customer?.email],
            ['customer.phone.number', b => b.customer?.phone?.number],
            ['customer.phone.country_code', b => b.customer?.phone?.country_code],
            ['payment_ip', b => b.payment_ip],
            ['shipping.first_name', b => b.shipping?.first_name],
            ['shipping.last_name', b => b.shipping?.last_name],
            ['shipping.address.address_line1', b => b.shipping?.address?.address_line1],
            ['shipping.address.country', b => b.shipping?.address?.country],
            ['shipping.method', b => b.shipping?.method],
            ['shipping.timeframe', b => b.shipping?.timeframe],
            ['items[].reference', b => b.items?.[0]?.reference],
        ],
        discover: [
            ['customer.email', b => b.customer?.email],
            ['payment_ip', b => b.payment_ip],
            ['customer.phone.number', b => b.customer?.phone?.number],
            ['customer.phone.country_code', b => b.customer?.phone?.country_code],
            ['shipping.first_name', b => b.shipping?.first_name],
            ['shipping.last_name', b => b.shipping?.last_name],
            ['shipping.address.address_line1', b => b.shipping?.address?.address_line1],
            ['shipping.address.country', b => b.shipping?.address?.country],
            ['shipping.address.city', b => b.shipping?.address?.city],
            ['shipping.address.zip', b => b.shipping?.address?.zip],
        ],
    };

    function renderEnhancedChecklist(requestBody) {
        const panel = $('at-enhanced-checklist-panel');
        if (_selectedType !== 'amex' && _selectedType !== 'discover') {
            panel.style.display = 'none';
            return;
        }
        const list = $('at-enhanced-checklist');
        list.innerHTML = '';
        ENHANCED_CHECKLIST_FIELDS[_selectedType].forEach(([label, getter]) => {
            const value = getter(requestBody);
            const row = document.createElement('div');
            row.className = `at-checklist-row ${value ? 'sent' : 'missing'}`;
            row.innerHTML = `
                <span class="at-checklist-icon">${value ? '✅' : '❌'}</span>
                <span class="at-checklist-field">${label}</span>
                ${value ? `<span class="at-checklist-value">${value}</span>` : '<span style="color:var(--error); font-size:11px;">not sent</span>'}
            `;
            list.appendChild(row);
        });
        panel.style.display = 'block';
    }

    function updateSummaryBar() {
        $('at-summary-bar').style.display = 'flex';
        const typeLabel = { partial: 'Partial Authorization', estimated: 'Estimated Authorization', amex: 'Amex Enhanced Auth', discover: 'Discover Enhanced Decisioning' }[_selectedType];
        $('at-summary-text').textContent = `Testing: ${typeLabel} — ${_currentScheme || 'card'} — payment ${_currentPaymentId}`;
    }

    function collapseSetupSections() {
        $('at-setup-sections').style.display = 'none';
    }

    function resetAuthTypeTest() {
        stopActionPoll();
        _currentPaymentId = null;
        _currentScheme = null;
        $('at-setup-sections').style.display = 'block';
        $('at-summary-bar').style.display = 'none';
        $('at-payment-result-panel').style.display = 'none';
        $('at-actions-panel').style.display = 'none';
        $('at-actions-empty').style.display = 'block';
        $('at-action-webhook-status').style.display = 'none';
        $('at-increment-section').style.display = 'none';
        $('at-enhanced-checklist-panel').style.display = 'none';
    }

    function incrementalSupportFor(scheme) {
        return AUTH_TYPE_INCREMENTAL_SUPPORT[scheme] || { increaseAmount: false, extendValidity: false };
    }

    function updateActionsForPayment(payment) {
        _currentPaymentId = payment.id;
        _currentScheme = payment.source?.scheme;

        $('at-actions-empty').style.display = 'none';
        $('at-actions-panel').style.display = 'block';
        $('at-capture-amount').value = payment.balances?.available_to_capture ?? '';

        const canCapture = (payment.balances?.available_to_capture || 0) > 0;
        const canVoid = (payment.balances?.available_to_void || 0) > 0;
        $('at-capture-btn').style.display = canCapture ? '' : 'none';
        $('at-void-btn').style.display = canVoid ? '' : 'none';

        // Incremental Authorization only applies to a still-open Estimated
        // authorization — once any amount has been captured, CKO no longer
        // allows further increments.
        const isEstimatedOpen = _selectedType === 'estimated' && payment.status === 'Authorized' && (payment.balances?.total_captured || 0) === 0;
        $('at-increment-section').style.display = isEstimatedOpen ? 'block' : 'none';
        if (isEstimatedOpen) {
            const support = incrementalSupportFor(_currentScheme);
            $('at-increment-btn').disabled = !support.increaseAmount;
            $('at-extend-btn').disabled = !support.extendValidity;
            $('at-increment-scheme-note').textContent = `${_currentScheme || 'This scheme'}: ${support.increaseAmount ? 'can increase amount' : 'cannot increase amount'}; ${support.extendValidity ? 'can extend validity' : 'cannot extend validity'}.`;
        }
    }

    async function refreshPayment() {
        if (!_currentPaymentId) return;
        try {
            const res = await fetch(`${apiBase()}/get-payment-details?paymentId=${_currentPaymentId}`);
            const data = await res.json();
            await addToApiLog('GET', `get payment details: ${_currentPaymentId} - /payments/${_currentPaymentId}`, res.ok ? 200 : res.status, {}, data);
            renderPaymentResult(data);
            updateActionsForPayment(data);
        } catch (e) {
            showToast('Failed to refresh payment.', 'error');
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        // Currency dropdown (shared CURRENCIES data, same pattern as other tabs)
        const currencySelect = $('at-currency');
        CURRENCIES.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.iso4217;
            opt.textContent = c.iso4217;
            if (c.iso4217 === 'GBP') opt.selected = true; // matches CKO's own partial-auth doc examples
            currencySelect.appendChild(opt);
        });

        document.querySelectorAll('.at-type-card').forEach(card => {
            card.addEventListener('click', () => selectType(card.dataset.type));
        });

        $('at-new-test-btn').addEventListener('click', resetAuthTypeTest);

        $('at-pay-btn').addEventListener('click', async () => {
            if (!_selectedType) {
                showToast('Select an authorization type first.', 'error');
                return;
            }
            const body = buildPaymentBody();
            if (!body.source.number || !body.source.expiry_month || !body.source.expiry_year || !body.amount) {
                showToast('Fill in card number, expiry, and amount first (click a test card, or enter manually).', 'error');
                return;
            }

            const btn = $('at-pay-btn');
            btn.disabled = true;
            btn.textContent = 'Processing…';
            try {
                const res = await fetch(`${apiBase()}/payments`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                });
                const data = await res.json();
                const payment = data.payment || data; // error responses aren't wrapped in { payment }
                await addToApiLog('POST', `create ${_selectedType} authorization payment - /payments`, res.ok ? 201 : res.status, body, data);

                if (!res.ok || !payment?.id) {
                    showToast(`Payment request failed (${res.status}) — see API log for the response_code/response_summary.`, 'error');
                    return;
                }

                renderPaymentResult(payment);
                renderEnhancedChecklist(body);
                updateActionsForPayment(payment);
                updateSummaryBar();
                collapseSetupSections();
                startActionWebhookPoll(payment.id, 'payment_approved / payment_declined');

                if (payment.response_code === '10010') {
                    showToast('Partial authorization approved — "Partial Value Approved".');
                } else if (payment.status === 'Authorized') {
                    showToast('Authorization approved.');
                } else {
                    showToast(`Payment status: ${payment.status}.`, payment.status === 'Declined' ? 'error' : undefined);
                }
            } catch (e) {
                showToast('Payment request failed.', 'error');
            } finally {
                btn.disabled = false;
                btn.textContent = 'Create Payment';
            }
        });

        $('at-refresh-btn').addEventListener('click', refreshPayment);

        $('at-capture-btn').addEventListener('click', async () => {
            if (!_currentPaymentId) return;
            const amountVal = $('at-capture-amount').value.trim();
            const body = amountVal ? { amount: parseInt(amountVal, 10) } : {};
            try {
                const res = await fetch(`${apiBase()}/capture-payment?paymentId=${_currentPaymentId}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                });
                const data = await res.json().catch(() => ({}));
                await addToApiLog('POST', `capture payment${amountVal ? ' (partial)' : ''}: ${_currentPaymentId} - /payments/${_currentPaymentId}/captures`, res.status, body, data);
                if (res.ok) {
                    showToast('Capture requested.');
                    startActionWebhookPoll(_currentPaymentId, 'payment_captured / payment_capture_declined');
                } else {
                    showToast(`Capture failed (${res.status}) — see API log.`, 'error');
                }
            } catch (e) {
                showToast('Capture request failed.', 'error');
            }
        });

        $('at-void-btn').addEventListener('click', async () => {
            if (!_currentPaymentId) return;
            const confirmed = await showConfirmDialog(
                'This voids the full remaining authorized amount and cannot be undone.',
                { title: 'Void Payment?', confirmLabel: 'Void Payment' }
            );
            if (!confirmed) return;
            try {
                const res = await fetch(`${apiBase()}/void-payment?paymentId=${_currentPaymentId}`, { method: 'POST' });
                const data = await res.json().catch(() => ({}));
                await addToApiLog('POST', `void payment: ${_currentPaymentId} - /payments/${_currentPaymentId}/voids`, res.status, {}, data);
                if (res.ok) {
                    showToast('Void requested.');
                    startActionWebhookPoll(_currentPaymentId, 'payment_voided / payment_void_declined');
                } else {
                    showToast(`Void failed (${res.status}) — see API log.`, 'error');
                }
            } catch (e) {
                showToast('Void request failed.', 'error');
            }
        });

        $('at-increment-btn').addEventListener('click', async () => {
            if (!_currentPaymentId) return;
            const amount = parseInt($('at-increment-amount').value, 10);
            if (!amount) { showToast('Enter an increment amount first.', 'error'); return; }
            try {
                const res = await fetch(`${apiBase()}/increment-authorization?paymentId=${_currentPaymentId}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ amount, reference: `#Increment_${Math.floor(Math.random() * 10000)}` }),
                });
                const data = await res.json().catch(() => ({}));
                await addToApiLog('POST', `increment authorization: ${_currentPaymentId} - /payments/${_currentPaymentId}/authorizations`, res.status, { amount }, data);
                if (res.ok) {
                    showToast('Authorization incremented.');
                    startActionWebhookPoll(_currentPaymentId, 'payment_authorization_incremented / _declined');
                } else {
                    showToast(`Increment failed (${res.status}) — see API log.`, 'error');
                }
            } catch (e) {
                showToast('Increment request failed.', 'error');
            }
        });

        $('at-extend-btn').addEventListener('click', async () => {
            if (!_currentPaymentId) return;
            try {
                const res = await fetch(`${apiBase()}/increment-authorization?paymentId=${_currentPaymentId}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ amount: 0, reference: `#ExtendValidity_${Math.floor(Math.random() * 10000)}` }),
                });
                const data = await res.json().catch(() => ({}));
                await addToApiLog('POST', `extend authorization validity: ${_currentPaymentId} - /payments/${_currentPaymentId}/authorizations`, res.status, { amount: 0 }, data);
                if (res.ok) {
                    showToast('Validity period extended.');
                    startActionWebhookPoll(_currentPaymentId, 'payment_authorization_incremented / _declined');
                } else {
                    showToast(`Extend failed (${res.status}) — see API log.`, 'error');
                }
            } catch (e) {
                showToast('Extend request failed.', 'error');
            }
        });
    });
})();
