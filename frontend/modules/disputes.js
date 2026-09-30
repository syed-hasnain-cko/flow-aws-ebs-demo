// =============================================
// Disputes Testing Module
// Wires the "magic amount" scenario picker, the raw-card trigger-payment
// form, dispute polling, and the text-only evidence workflow.
// Depends on: utils.js (formatJSON, showToast), api-log.js (addToApiLog),
//             modules/data.js (DISPUTE_TEST_SCENARIOS, DISPUTE_TEST_CARDS, DISPUTE_EXPIRY)
// =============================================

(function () {
    let _pollInterval = null;
    let _currentDisputeId = null;

    function apiBase() { return window.APP_CONFIG.apiBaseUrl; }

    function fillForm(cardKey, row, scenarioLabel) {
        const card = DISPUTE_TEST_CARDS[cardKey];
        document.getElementById('dispute-card-number').value = card.number;
        document.getElementById('dispute-card-expiry-month').value = DISPUTE_EXPIRY.month;
        document.getElementById('dispute-card-expiry-year').value = DISPUTE_EXPIRY.year;
        document.getElementById('dispute-card-cvv').value = card.cvv;
        document.getElementById('dispute-amount').value = row.amount;
        document.getElementById('dispute-selected-scenario').value = `${scenarioLabel} — ${card.scheme} (${row.reasonCode} ${row.reasonCategory})`;
    }

    function renderScenarioGroups(containerId, groups) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = '';
        groups.forEach(group => {
            const el = document.createElement('div');
            el.className = 'dispute-scenario-group';
            el.innerHTML = `
                <div class="dispute-scenario-header">
                    <div class="dispute-scenario-title">
                        ${group.label}
                        <span class="dispute-status-pill status-${group.status}">${group.status}</span>
                    </div>
                    <span style="font-size:10px; color:var(--text-muted); font-family:monospace;">chargeback: ${group.chargebackCode}</span>
                </div>
                <div style="padding:8px 16px 4px;"><span class="dispute-scenario-desc">${group.description}</span></div>
            `;
            group.rows.forEach(row => {
                const card = DISPUTE_TEST_CARDS[row.card];
                const rowEl = document.createElement('div');
                rowEl.className = 'dispute-row-table';
                rowEl.innerHTML = `
                    <span class="drt-scheme">${card.scheme}</span>
                    <span class="drt-amount">${row.amount} (£${(row.amount / 100).toFixed(2)})</span>
                    <span class="drt-reason">${row.reasonCode}</span>
                    <span class="drt-reason">${row.reasonCategory}</span>
                    <span class="drt-fill-hint">↗ fill form</span>
                `;
                rowEl.addEventListener('click', () => {
                    fillForm(row.card, row, group.label);
                    showToast(`Filled form for "${group.label}" (${card.scheme}) — scroll down and click Pay.`);
                });
                el.appendChild(rowEl);
            });
            container.appendChild(el);
        });
    }

    function renderBaseCards() {
        const container = document.getElementById('dispute-base-cards');
        if (!container) return;
        container.innerHTML = '';
        Object.entries(DISPUTE_TEST_CARDS).forEach(([key, card]) => {
            const chip = document.createElement('span');
            chip.className = 'dc-chip';
            chip.innerHTML = `<span class="dc-scheme-label">${card.scheme}</span> ${card.number} · CVV ${card.cvv}`;
            chip.addEventListener('click', () => {
                document.getElementById('dispute-card-number').value = card.number;
                document.getElementById('dispute-card-cvv').value = card.cvv;
                document.getElementById('dispute-card-expiry-month').value = 12;
                document.getElementById('dispute-card-expiry-year').value = 2099;
                document.getElementById('dispute-selected-scenario').value = `(none — manual ${card.scheme} payment)`;
                showToast(`${card.scheme} test card filled in.`);
            });
            container.appendChild(chip);
        });
    }

    function renderPaymentResult(payment) {
        const panel = document.getElementById('dispute-payment-result');
        const target = document.getElementById('dispute-payment-result-response');
        target.innerHTML = formatJSON(payment);
        panel.style.display = 'block';
    }

    function setPollingLabel(text) {
        const label = document.getElementById('dispute-polling-label');
        if (label) label.textContent = text;
    }

    function stopPolling() {
        if (_pollInterval) { clearInterval(_pollInterval); _pollInterval = null; }
    }

    function startDisputePolling(paymentId) {
        stopPolling();
        const panel = document.getElementById('dispute-polling-panel');
        panel.style.display = 'block';
        setPollingLabel('Waiting for Checkout.com to generate the test dispute (can take a few minutes)…');

        const startTime = Date.now();
        _pollInterval = setInterval(async () => {
            if (Date.now() - startTime > 6 * 60 * 1000) {
                setPollingLabel('No dispute appeared within 6 minutes — use "Fetch Recent Disputes" below to check manually later.');
                stopPolling();
                return;
            }
            try {
                const res = await fetch(`${apiBase()}/disputes?payment_id=${paymentId}&limit=1`);
                const data = await res.json();

                // Don't log empty polls — only log the tick that actually finds
                // something (a dispute) or a genuine failure, same as the
                // webhook-polling pattern used elsewhere in this app.
                if (!res.ok) {
                    await addToApiLog('GET', `poll disputes for payment ${paymentId} - /disputes`, res.status, {}, data);
                    setPollingLabel(`Polling failed (${res.status}) — check API Gateway route setup. Stopped polling.`);
                    stopPolling();
                    return;
                }

                if (data.total_count > 0 && data.data?.[0]) {
                    await addToApiLog('GET', `poll disputes for payment ${paymentId} - /disputes`, 200, {}, data);
                    setPollingLabel(`Dispute found: ${data.data[0].id}`);
                    stopPolling();
                    renderDisputeDetail(data.data[0]);
                }
            } catch (e) { /* ignore, retry next tick */ }
        }, 10000);
    }

    function renderDisputeDetail(dispute) {
        _currentDisputeId = dispute.id;
        document.getElementById('dispute-detail-empty').style.display = 'none';
        document.getElementById('dispute-detail-panel').style.display = 'block';
        const pill = document.getElementById('dispute-detail-status-pill');
        pill.className = `dispute-status-pill status-${dispute.status}`;
        pill.textContent = dispute.status;
        document.getElementById('dispute-detail-response').innerHTML = formatJSON(dispute);
        document.getElementById('dispute-evidence-result').innerHTML = '';
    }

    async function refreshDisputeDetail() {
        if (!_currentDisputeId) return;
        try {
            const res = await fetch(`${apiBase()}/disputes/${_currentDisputeId}`);
            const data = await res.json();
            await addToApiLog('GET', `get dispute details: ${_currentDisputeId} - /disputes/${_currentDisputeId}`, res.ok ? 200 : res.status, {}, data);
            renderDisputeDetail(data);
        } catch (e) {
            showToast('Failed to refresh dispute.', 'error');
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        renderScenarioGroups('dispute-scenario-core', DISPUTE_TEST_SCENARIOS.core);
        renderScenarioGroups('dispute-scenario-extended', DISPUTE_TEST_SCENARIOS.extended);
        renderBaseCards();

        const showMoreBtn = document.getElementById('dispute-show-more-btn');
        const extendedContainer = document.getElementById('dispute-scenario-extended');
        if (showMoreBtn && extendedContainer) {
            showMoreBtn.addEventListener('click', () => {
                const showing = extendedContainer.style.display !== 'none';
                extendedContainer.style.display = showing ? 'none' : 'block';
                showMoreBtn.textContent = showing
                    ? 'Show more scenarios (resolved, evidence under review, arbitration)'
                    : 'Hide extra scenarios';
            });
        }

        document.getElementById('dispute-pay-btn').addEventListener('click', async () => {
            const number = document.getElementById('dispute-card-number').value.trim();
            const expiry_month = parseInt(document.getElementById('dispute-card-expiry-month').value, 10);
            const expiry_year = parseInt(document.getElementById('dispute-card-expiry-year').value, 10);
            const cvv = document.getElementById('dispute-card-cvv').value.trim();
            const name = document.getElementById('dispute-card-name').value.trim();
            const amount = parseInt(document.getElementById('dispute-amount').value, 10);

            if (!number || !expiry_month || !expiry_year || !amount) {
                showToast('Fill in card number, expiry, and amount first (click a scenario row, or a base card chip).', 'error');
                return;
            }

            const body = {
                source: { number, expiry_month, expiry_year, cvv, name },
                amount,
                currency: 'GBP',
                reference: `#Dispute_Test_${Math.floor(Math.random() * 10000)}`,
            };

            const btn = document.getElementById('dispute-pay-btn');
            btn.disabled = true;
            btn.textContent = 'Processing…';
            try {
                const res = await fetch(`${apiBase()}/disputes/create-test-payment`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                });
                const data = await res.json();
                await addToApiLog('POST', `trigger test payment - /disputes/create-test-payment`, data.payment?.id ? 201 : 422, body, data);

                if (!data.payment?.id) {
                    showToast('Payment request failed — see API log.', 'error');
                    return;
                }
                renderPaymentResult(data.payment);
                if (data.payment.status === 'Authorized' || data.payment.status === 'Captured') {
                    showToast('Payment succeeded — polling for the test dispute to appear…');
                    startDisputePolling(data.payment.id);
                } else {
                    showToast(`Payment status: ${data.payment.status} — a dispute won't be generated unless it's captured.`, 'error');
                }
            } catch (e) {
                showToast('Test payment request failed.', 'error');
            } finally {
                btn.disabled = false;
                btn.textContent = 'Pay & Trigger Dispute';
            }
        });

        document.getElementById('dispute-refresh-btn').addEventListener('click', refreshDisputeDetail);

        document.getElementById('dispute-accept-btn').addEventListener('click', async () => {
            if (!_currentDisputeId) return;
            if (!confirm('Accept this dispute? This closes it with no further financial implications and cannot be undone.')) return;
            try {
                const res = await fetch(`${apiBase()}/disputes/${_currentDisputeId}/accept`, { method: 'POST' });
                const data = await res.json().catch(() => ({}));
                await addToApiLog('POST', `accept dispute: ${_currentDisputeId} - /disputes/${_currentDisputeId}/accept`, res.status, {}, data);
                if (res.ok) {
                    showToast('Dispute accepted.');
                    refreshDisputeDetail();
                } else {
                    showToast('Failed to accept dispute — see API log.', 'error');
                }
            } catch (e) {
                showToast('Accept dispute request failed.', 'error');
            }
        });

        document.getElementById('dispute-save-evidence-btn').addEventListener('click', async () => {
            if (!_currentDisputeId) return;
            const body = {};
            const map = {
                'ev-proof-delivery': 'proof_of_delivery_or_service_text',
                'ev-proof-delivery-date': 'proof_of_delivery_or_service_date_text',
                'ev-invoice': 'invoice_or_receipt_text',
                'ev-customer-comms': 'customer_communication_text',
                'ev-refund-policy': 'refund_or_cancellation_policy_text',
                'ev-additional': 'additional_evidence_text',
            };
            Object.entries(map).forEach(([id, field]) => {
                const val = document.getElementById(id).value.trim();
                if (val) body[field] = val;
            });
            if (Object.keys(body).length === 0) {
                showToast('Fill in at least one evidence field first.', 'error');
                return;
            }
            try {
                const res = await fetch(`${apiBase()}/disputes/${_currentDisputeId}/evidence`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                });
                const data = await res.json().catch(() => ({}));
                await addToApiLog('PUT', `provide dispute evidence: ${_currentDisputeId} - /disputes/${_currentDisputeId}/evidence`, res.status, body, data);
                const resultEl = document.getElementById('dispute-evidence-result');
                if (res.ok) {
                    resultEl.innerHTML = '<span style="color:var(--success);">✅ Evidence saved. Nothing sent to the scheme yet — click Submit when ready.</span>';
                    showToast('Evidence saved.');
                } else {
                    resultEl.innerHTML = `<span style="color:var(--error);">❌ Failed to save evidence — see API log.</span>`;
                }
            } catch (e) {
                showToast('Save evidence request failed.', 'error');
            }
        });

        document.getElementById('dispute-submit-evidence-btn').addEventListener('click', async () => {
            if (!_currentDisputeId) return;
            if (!confirm('Submit evidence now? This is FINAL — you cannot amend evidence after submitting.')) return;
            try {
                const res = await fetch(`${apiBase()}/disputes/${_currentDisputeId}/evidence/submit`, { method: 'POST' });
                const data = await res.json().catch(() => ({}));
                await addToApiLog('POST', `submit dispute evidence: ${_currentDisputeId} - /disputes/${_currentDisputeId}/evidence`, res.status, {}, data);
                const resultEl = document.getElementById('dispute-evidence-result');
                if (res.ok) {
                    resultEl.innerHTML = '<span style="color:var(--success);">✅ Evidence submitted.</span>';
                    showToast('Evidence submitted.');
                    refreshDisputeDetail();
                } else {
                    resultEl.innerHTML = '<span style="color:var(--error);">❌ Failed to submit evidence — see API log.</span>';
                }
            } catch (e) {
                showToast('Submit evidence request failed.', 'error');
            }
        });

        document.getElementById('dispute-list-refresh-btn').addEventListener('click', async () => {
            try {
                const res = await fetch(`${apiBase()}/disputes?limit=10`);
                const data = await res.json();
                await addToApiLog('GET', `list disputes - /disputes`, res.ok ? 200 : res.status, {}, data);
                document.getElementById('dispute-list-response').innerHTML = formatJSON(data);
                if (data.data?.length > 0) {
                    showToast(`Found ${data.data.length} dispute(s). Click "Refresh" above after selecting one manually if needed.`);
                }
            } catch (e) {
                showToast('Failed to fetch disputes.', 'error');
            }
        });
    });
})();
