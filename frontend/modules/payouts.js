// =============================================
// Payouts Module
// Handles: Card Payouts (via Flow tokenizer) and Bank Payouts
// Both use POST /payouts → CKO POST /payments (payout body)
// =============================================

(function () {

    const API_BASE = window.APP_CONFIG?.apiBaseUrl || '';

    // Active payout type: 'card' | 'bank' | null
    let _activePayoutType = null;

    // Mounted Flow card component instance (card payout only)
    let _payoutCardComponent = null;

    // Active payout card scheme: 'visa' | 'mastercard' | null
    let _activeScheme = null;

    // Payout queue — each entry: { id, type, scheme, amount, currency, status, response, webhookType, webhookData, startTime }
    // status: 'pending' | 'paid' | 'declined' | 'returned' | 'expired' | 'failed'
    const _payoutQueue = [];
    let _pendingCount  = 0;
    let _queuePollInterval = null;

    // ─── DOM helpers ──────────────────────────────────────────────────
    function val(id) { return document.getElementById(id)?.value ?? ''; }
    function checked(id) { return document.getElementById(id)?.checked ?? false; }
    function show(id) { const el = document.getElementById(id); if (el) el.style.display = ''; }
    function hide(id) { const el = document.getElementById(id); if (el) el.style.display = 'none'; }
    function el(id)  { return document.getElementById(id); }


    // ─── Payout type selector ─────────────────────────────────────────
    function selectPayoutType(type) {
        _activePayoutType = type;
        clearPayoutResult();

        // Update visual selection state
        ['card', 'bank'].forEach(t => {
            const opt = el(`select-${t}-payout`);
            if (opt) opt.classList.toggle('wallet-option-active', t === type);
        });

        show('payout-common-fields');

        if (type === 'card') {
            show('card-payout-fields');
            hide('bank-payout-fields');
        } else {
            show('bank-payout-fields');
            hide('card-payout-fields');
            // Reset card state when switching away
            _payoutCardComponent = null;
            _activeScheme = null;
            hide('payout-test-cards');
        }
    }


    // ─── Card scheme selection ────────────────────────────────────────
    async function onSchemeChange() {
        const scheme = val('payout-card-scheme');
        _activeScheme = scheme || null;
        _payoutCardComponent = null;
        clearPayoutResult();

        if (!scheme) {
            hide('payout-ftt-group');
            hide('payout-scheme-banner');
            hide('payout-card-form-wrapper');
            hide('payout-card-token-badge');
            hide('payout-test-cards');
            el('card-payout-submit-btn').disabled = true;
            el('card-payout-hint').style.display = '';
            el('card-payout-hint').textContent = 'Select a card scheme above to load the card field';
            return;
        }

        // Populate FTT dropdown from data.js
        const fttSelect = el('payout-funds-transfer-type');
        fttSelect.innerHTML = '';
        const types = PAYOUT_FUNDS_TRANSFER_TYPES[scheme] || [];
        types.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t.value;
            opt.textContent = t.label;
            fttSelect.appendChild(opt);
        });
        // Set scheme-appropriate default FTT
        fttSelect.value = scheme === 'visa' ? 'FD' : 'C55';
        show('payout-ftt-group');

        // Render test cards for selected scheme
        renderTestCards(scheme);

        // Scheme warning banner
        const schemeLabel = scheme === 'visa' ? 'Visa' : 'Mastercard';
        const schemeBin   = scheme === 'visa' ? '4' : '5 or 2';
        const banner = el('payout-scheme-banner');
        banner.innerHTML = `⚠️ <strong>${schemeLabel} selected</strong> — only enter ${schemeLabel} cards (BIN starts with <strong>${schemeBin}</strong>). The card field will reject other schemes.`;
        show('payout-scheme-banner');

        // Mount (or re-mount) the Flow card field for the selected scheme
        await mountPayoutCardField(scheme);
    }


    // ─── Flow card field mount ────────────────────────────────────────
    async function mountPayoutCardField(scheme) {
        const host = el('payout-card-form-host');
        if (!host) return;

        // Show loading state
        show('payout-card-form-wrapper');
        const loadingEl = el('payout-card-loading');
        if (loadingEl) loadingEl.style.display = 'flex';
        hide('payout-card-token-badge');
        host.innerHTML = '';
        el('card-payout-submit-btn').disabled = true;
        el('card-payout-hint').style.display = '';
        el('card-payout-hint').textContent = '⏳ Loading card field…';

        // Update scheme chip label
        const chip = el('payout-scheme-chip');
        if (chip) chip.textContent = scheme === 'visa' ? 'Visa' : 'Mastercard';

        try {
            // 1. Create a payment session (tokenization purpose only)
            const sessionBody = {
                amount:                parseInt(val('payout-amount') || '100', 10),
                currency:              val('payout-currency') || 'EUR',
                processing_channel_id: window.APP_CONFIG.processingChannelId,
                reference:             `payout-tokenize-${Date.now()}`,
                success_url:           `${window.location.origin}/success.html`,
                failure_url:           `${window.location.origin}/failure.html`,
                disabled_payment_methods: ['remember_me'],
                billing: {
                    address: {
                        country: val('payout-dest-addr-country') || 'DE',
                    }
                },
                customer: {
                    name: ([val('payout-dest-first-name'), val('payout-dest-last-name')].filter(Boolean).join(' ')) || 'Test User',
                },
            };

            const sessionRes = await fetch(`${API_BASE}/payment-sessions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(sessionBody),
            });
            const paymentSession = await sessionRes.json();
            addToApiLog('POST', '/payment-sessions (payout tokenizer)', sessionRes.status, sessionBody, paymentSession);

            if (!paymentSession?.id) {
                throw new Error('Payment session creation failed: ' + JSON.stringify(paymentSession));
            }

            // 2. Mount the Flow card component with scheme restriction
            const schemeLabel = scheme === 'visa' ? 'Visa' : 'Mastercard';
            const checkout = await CheckoutWebComponents({
                publicKey:   window.APP_CONFIG.publicKey,
                environment: 'sandbox',
                locale:      'en-GB',
                paymentSession,
                componentOptions: {
                    card: {
                        data: { cardholderName: 'Syed Hasnain' },
                        displayCardholderName: 'bottom',
                        supportedSchemes: [schemeLabel],
                    }
                },
                appearance: getFlowAppearance(),
                onReady:    () => {},
                onChange:   () => {},
                onError:    (_component, error) => {
                    console.error('Payout card tokenizer error:', error);
                },
            });

            _payoutCardComponent = checkout.create('card', { showPayButton: false });
            if (await _payoutCardComponent.isAvailable()) {
                _payoutCardComponent.mount(host);
            }

            if (loadingEl) loadingEl.style.display = 'none';
            el('card-payout-submit-btn').disabled = false;
            el('card-payout-hint').style.display = 'none';

        } catch (err) {
            if (loadingEl) loadingEl.style.display = 'none';
            el('card-payout-hint').textContent = '❌ Failed to load card field: ' + err.message;
            console.error('Payout card field mount error:', err);
            showToast('Failed to load card field: ' + err.message, 'error');
        }
    }


    // ─── Build card payout body ───────────────────────────────────────
    function buildCardPayoutBody(token) {
        const ahType = val('payout-dest-ah-type');

        const accountHolder = { type: ahType };
        if (ahType === 'individual') {
            accountHolder.first_name = val('payout-dest-first-name');
            accountHolder.last_name  = val('payout-dest-last-name');
        } else {
            accountHolder.company_name = val('payout-dest-company');
        }
        const email = val('payout-dest-email');
        if (email) accountHolder.email = email;

        const addrLine1  = val('payout-dest-addr-line1');
        const addrCity   = val('payout-dest-addr-city');
        const addrZip    = val('payout-dest-addr-zip');
        const addrCountry = val('payout-dest-addr-country');
        if (addrLine1 || addrCity || addrZip || addrCountry) {
            accountHolder.billing_address = {};
            if (addrLine1)   accountHolder.billing_address.address_line1 = addrLine1;
            if (addrCity)    accountHolder.billing_address.city    = addrCity;
            if (addrZip)     accountHolder.billing_address.zip     = addrZip;
            if (addrCountry) accountHolder.billing_address.country = addrCountry;
        }

        const instruction = {
            funds_transfer_type: val('payout-funds-transfer-type'),
        };
        const purpose = val('payout-purpose');
        if (purpose) instruction.purpose = purpose;

        const body = {
            amount:    parseInt(val('payout-amount'), 10),
            currency:  val('payout-currency'),
            destination: {
                type:           'token',
                token:          token,
                account_holder: accountHolder,
            },
            instruction,
        };

        const ref = val('payout-reference');
        if (ref) body.reference = ref;

        // Sender (optional — toggled by user)
        if (checked('payout-sender-enable')) {
            const senderType = val('payout-sender-type');
            const sender = {
                type:            senderType,
                reference:       val('payout-sender-reference'),
                source_of_funds: val('payout-sender-sof'),
                address: {
                    address_line1: val('payout-sender-addr-line1'),
                    city:          val('payout-sender-addr-city'),
                    country:       val('payout-sender-addr-country'),
                },
            };
            if (senderType === 'individual') {
                sender.first_name = val('payout-sender-first-name');
                sender.last_name  = val('payout-sender-last-name');
            } else {
                sender.company_name = val('payout-sender-company');
            }
            body.sender = sender;
        }

        return body;
    }


    // ─── Build bank payout body ───────────────────────────────────────
    function buildBankPayoutBody() {
        const ahType = val('payout-bank-ah-type');
        const accountHolder = {
            type: ahType,
            billing_address: { country: val('payout-bank-ah-country') },
        };
        if (ahType === 'individual') {
            accountHolder.first_name = val('payout-bank-ah-first-name');
            accountHolder.last_name  = val('payout-bank-ah-last-name');
        } else {
            accountHolder.company_name = val('payout-bank-ah-company');
        }

        const destination = {
            type:           'bank_account',
            country:        val('payout-bank-country'),
            account_type:   val('payout-bank-account-type'),
            account_holder: accountHolder,
        };

        const iban           = val('payout-bank-iban');
        const accountNumber  = val('payout-bank-account-number');
        const bankCode       = val('payout-bank-bank-code');
        const swiftBic       = val('payout-bank-swift-bic');
        if (iban)          destination.iban           = iban;
        if (accountNumber) destination.account_number = accountNumber;
        if (bankCode)      destination.bank_code      = bankCode;
        if (swiftBic)      destination.swift_bic      = swiftBic;

        const body = {
            amount:      parseInt(val('payout-amount'), 10),
            currency:    val('payout-currency'),
            destination,
            billing_descriptor: {
                reference: val('payout-billing-desc-ref'),
            },
        };

        const ref = val('payout-reference');
        if (ref) body.reference = ref;

        const instructionScheme = val('payout-instruction-scheme');
        if (instructionScheme) {
            body.instruction = { scheme: instructionScheme };
        }

        return body;
    }


    // ─── Submit handlers ──────────────────────────────────────────────
    async function onCardPayoutSubmit() {
        if (!_payoutCardComponent) {
            showToast('Card field not loaded. Select a scheme first.', 'error');
            return;
        }

        const btn = el('card-payout-submit-btn');
        btn.disabled = true;
        btn.textContent = 'Tokenizing…';

        try {
            // Step 1: Tokenize the card
            const { data: tokenData } = await _payoutCardComponent.tokenize();
            const token = tokenData?.token;

            if (!token) {
                throw new Error('Tokenization returned no token');
            }

            // Scheme validation — reject if tokenized card doesn't match selected scheme
            const tokenScheme = (tokenData?.scheme || '').toLowerCase();
            if (tokenScheme && tokenScheme !== _activeScheme) {
                const actual   = tokenData.scheme;
                const expected = _activeScheme === 'visa' ? 'Visa' : 'Mastercard';
                showToast(`Wrong scheme: Card is ${actual} but ${expected} payout is selected for testing. Please enter a ${expected} card.`, 'error');
                btn.disabled = false;
                btn.textContent = 'Submit Card Payout';
                return;
            }

            // Show token badge
            el('payout-card-token-value').textContent = token;
            show('payout-card-token-badge');

            // Step 2: Build and submit payout
            btn.textContent = 'Submitting Payout…';
            const body = buildCardPayoutBody(token);

            // Full body as CKO will receive it (source + processing_channel_id injected by backend)
            const fullLogBody = {
                ...body,
                source: { type: 'currency_account', id: window.APP_CONFIG?.currencyAccountId || '(backend: CURRENCY_ACCOUNT_ID)' },
                processing_channel_id: window.APP_CONFIG?.processingChannelId || '(backend config)',
            };

            const res = await fetch(`${API_BASE}/payouts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const rawText = await res.text();
            console.log('[payouts] POST /payouts status:', res.status);
            console.log('[payouts] POST /payouts raw response:', rawText);
            let data;
            try { data = JSON.parse(rawText); } catch { data = { raw: rawText }; }
            addToApiLog('POST', '/payouts', res.status, fullLogBody, data);

            if (res.status === 202 || res.ok) {
                queuePayout({
                    id:       data?.id,
                    type:     'card',
                    scheme:   _activeScheme,
                    amount:   parseInt(val('payout-amount'), 10),
                    currency: val('payout-currency'),
                    status:   res.status === 202 ? 'pending' : 'paid',
                    response: data,
                });
            } else {
                showToast(`Payout failed (${res.status}): ${data?.error || rawText}`, 'error');
                queuePayout({
                    type: 'card', scheme: _activeScheme,
                    amount: parseInt(val('payout-amount'), 10), currency: val('payout-currency'),
                    status: 'failed', response: data,
                });
            }

        } catch (err) {
            console.error('Card payout error:', err);
            showToast('Card payout failed: ' + err.message, 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Submit Card Payout';
        }
    }

    async function onBankPayoutSubmit() {
        const btn = el('bank-payout-submit-btn');
        btn.disabled = true;
        btn.textContent = 'Submitting…';

        const body = buildBankPayoutBody();
        const fullLogBody = {
            ...body,
            source: { type: 'currency_account', id: window.APP_CONFIG?.currencyAccountId || '(backend: CURRENCY_ACCOUNT_ID)' },
            processing_channel_id: window.APP_CONFIG?.processingChannelId || '(backend config)',
        };

        try {
            const res = await fetch(`${API_BASE}/payouts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const rawText = await res.text();
            let data;
            try { data = JSON.parse(rawText); } catch { data = { raw: rawText }; }
            addToApiLog('POST', '/payouts', res.status, fullLogBody, data);

            if (res.status === 202 || res.ok) {
                queuePayout({
                    id:       data?.id,
                    type:     'bank',
                    scheme:   null,
                    amount:   parseInt(val('payout-amount'), 10),
                    currency: val('payout-currency'),
                    status:   res.status === 202 ? 'pending' : 'paid',
                    response: data,
                });
            } else {
                showToast(`Bank payout failed (${res.status}): ${data?.error || rawText}`, 'error');
                queuePayout({
                    type: 'bank', scheme: null,
                    amount: parseInt(val('payout-amount'), 10), currency: val('payout-currency'),
                    status: 'failed', response: data,
                });
            }

        } catch (err) {
            console.error('Bank payout error:', err);
            showToast('Bank payout failed: ' + err.message, 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Submit Bank Payout';
        }
    }


    // ─── Payout result display ────────────────────────────────────────
    function showPayoutResult(data) {
        queuePayout({ status: 'failed', response: data });
    }

    // ─── Queue: add entry ─────────────────────────────────────────────
    function queuePayout({ id, type, scheme, amount, currency, status, response }) {
        const entry = {
            id:          id || null,
            type:        type || _activePayoutType || 'card',
            scheme:      scheme || _activeScheme || null,
            amount:      amount,
            currency:    currency,
            status:      status || 'pending',
            response:    response,
            webhookType: null,
            webhookData: null,
            startTime:   Date.now(),
        };
        _payoutQueue.unshift(entry);
        if (entry.status === 'pending') {
            _pendingCount++;
            lockPayoutForm();
            startQueuePolling();
        }
        renderQueue();
    }

    // ─── Queue: resolve entry ─────────────────────────────────────────
    function resolveQueueEntry(payoutId, status, webhookType, webhookData) {
        const entry = _payoutQueue.find(e => e.id === payoutId);
        if (!entry || entry.status !== 'pending') return;
        entry.status      = status;
        entry.webhookType = webhookType;
        entry.webhookData = webhookData;
        _pendingCount = Math.max(0, _pendingCount - 1);
        if (_pendingCount === 0) {
            unlockPayoutForm();
            stopQueuePolling();
        }
        renderQueue();
    }

    // ─── Queue: unified webhook poll (checks all pending entries) ─────
    function startQueuePolling() {
        if (_queuePollInterval) return;
        _queuePollInterval = setInterval(async () => {
            const pending = _payoutQueue.filter(e => e.status === 'pending' && e.id);
            if (pending.length === 0) { stopQueuePolling(); return; }

            for (const entry of pending) {
                // Timeout after 2 minutes
                if (Date.now() - entry.startTime > 120000) {
                    resolveQueueEntry(entry.id, 'expired', 'poll_timeout', null);
                    continue;
                }
                try {
                    const res = await fetch(`${API_BASE}/webhook-event?paymentId=${entry.id}`);
                    if (res.status === 404) continue;
                    const event = await res.json();
                    if (!event.found) continue;

                    addToApiLog('WEBHOOK', `${event.type} — /webhook`, 200, {}, event.data);

                    const statusMap = {
                        payment_paid:     'paid',
                        payment_approved: 'paid',
                        payment_declined: 'declined',
                        payment_returned: 'returned',
                        payment_expired:  'expired',
                    };
                    resolveQueueEntry(entry.id, statusMap[event.type] || event.type, event.type, event);
                } catch { /* ignore, retry next tick */ }
            }
        }, 2000);
    }

    function stopQueuePolling() {
        if (_queuePollInterval) { clearInterval(_queuePollInterval); _queuePollInterval = null; }
    }

    // ─── Queue: lock / unlock form ────────────────────────────────────
    function lockPayoutForm() {
        const scheme = el('payout-card-scheme');
        const btn    = el('card-payout-submit-btn');
        if (scheme) scheme.disabled = true;
        if (btn)    btn.disabled = true;
        const banner = el('payout-lock-banner');
        if (banner) {
            banner.style.display = 'flex';
            const lbl = el('payout-lock-label');
            if (lbl) lbl.textContent = `${_pendingCount} payout${_pendingCount > 1 ? 's' : ''} pending webhook — scheme & submit locked until resolved`;
        }
    }

    function unlockPayoutForm() {
        const scheme = el('payout-card-scheme');
        if (scheme) scheme.disabled = false;
        const btn = el('card-payout-submit-btn');
        if (btn) btn.disabled = !_payoutCardComponent; // only re-enable if card field is loaded
        const banner = el('payout-lock-banner');
        if (banner) banner.style.display = 'none';
    }

    // ─── Queue: render ─────────────────────────────────────────────────
    function renderQueue() {
        const container = el('payout-queue-list');
        if (!container) return;

        if (_payoutQueue.length === 0) { hide('payout-queue-panel'); return; }
        show('payout-queue-panel');

        const statusCfg = {
            pending:  { label: '⏳ PENDING',  color: 'var(--primary)' },
            paid:     { label: '✓ PAID',      color: 'var(--success)' },
            declined: { label: '✗ DECLINED',  color: 'var(--error)'   },
            returned: { label: '↩ RETURNED',  color: 'var(--error)'   },
            expired:  { label: '⌛ EXPIRED',   color: 'var(--error)'   },
            failed:   { label: '✗ FAILED',    color: 'var(--error)'   },
        };

        container.innerHTML = _payoutQueue.map((entry, idx) => {
            const sc         = statusCfg[entry.status] || statusCfg.pending;
            const schemeLabel = entry.scheme ? (entry.scheme === 'visa' ? 'Visa' : 'MC') : entry.type;
            const amountFmt  = entry.amount ? `${(entry.amount / 100).toFixed(2)} ${entry.currency}` : '—';
            const idShort    = entry.id ? entry.id.slice(0, 22) + '…' : '—';
            const webhookLabel = entry.webhookType
                ? `<span style="color:${sc.color}; font-weight:600;">${entry.webhookType}</span>`
                : '<em style="color:var(--text-secondary); opacity:0.6; font-style:italic; font-size:11px;">polling…</em>';

            const responseJson = JSON.stringify(entry.response, null, 2);
            const webhookJson  = entry.webhookData ? JSON.stringify(entry.webhookData, null, 2) : null;

            return `
            <div class="pq-entry" style="border-bottom:1px solid var(--border);">
                <div data-pq-row style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;
                    padding:10px 16px; cursor:pointer; user-select:none;">
                    <span style="font-size:10px; font-weight:800; padding:2px 9px; border-radius:20px;
                        border:1px solid ${sc.color}; color:${sc.color}; white-space:nowrap; flex-shrink:0;">${sc.label}</span>
                    <span style="font-size:12px; font-weight:600; color:var(--text-primary);">${schemeLabel}</span>
                    <span style="font-size:12px; color:var(--text-secondary);">${amountFmt}</span>
                    <span style="font-family:monospace; font-size:11px; color:var(--text-secondary);
                        opacity:0.65; flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${idShort}</span>
                    <span style="font-size:12px;">${webhookLabel}</span>
                    <span style="font-size:11px; color:var(--text-secondary); opacity:0.4; flex-shrink:0;">↕</span>
                </div>
                <div data-pq-detail style="display:none; padding:0 16px 12px;">
                    <pre class="json-code-block" style="margin:0 0 0; font-size:11px; max-height:280px; overflow-y:auto;">${responseJson}</pre>
                    ${webhookJson ? `
                    <div style="margin-top:8px; font-size:11px; font-weight:600; color:var(--text-secondary);
                        text-transform:uppercase; letter-spacing:0.05em; margin-bottom:4px;">Webhook Event</div>
                    <pre class="json-code-block" style="margin:0; font-size:11px; max-height:280px; overflow-y:auto;">${webhookJson}</pre>
                    ` : ''}
                </div>
            </div>`;
        }).join('');
    }

    // ─── Copy chip helper ─────────────────────────────────────────────
    async function copyChip(text, chipEl) {
        if (!text) return;
        try {
            await navigator.clipboard.writeText(text);
        } catch {
            const ta = document.createElement('textarea');
            ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
            document.body.appendChild(ta); ta.select(); document.execCommand('copy');
            document.body.removeChild(ta);
        }
        const origText  = chipEl.textContent;
        const origBg    = chipEl.style.background;
        const origColor = chipEl.style.color;
        chipEl.textContent = '✓ Copied';
        chipEl.style.background = 'var(--success)';
        chipEl.style.color = '#fff';
        setTimeout(() => {
            chipEl.textContent = origText;
            chipEl.style.background = origBg;
            chipEl.style.color = origColor;
        }, 1200);
    }

    // ─── Clear payout result area ─────────────────────────────────────
    function clearPayoutResult() {
        // Only wipe resolved entries; if pending entries exist keep them
        if (_pendingCount > 0) return;
        _payoutQueue.length = 0;
        hide('payout-queue-panel');
        stopQueuePolling();
    }

    // ─── Render test cards panel ──────────────────────────────────────
    function renderTestCards(scheme) {
        const container = el('payout-test-cards');
        if (!container) return;
        const groups = (typeof PAYOUT_TEST_CARDS !== 'undefined') ? PAYOUT_TEST_CARDS[scheme] : null;
        if (!groups || !groups.length) { hide('payout-test-cards'); return; }

        const schemeLabel = scheme === 'visa' ? 'Visa' : 'Mastercard';
        const codeColors  = { '10000': 'var(--success)', '20005': 'var(--error)', '20057': 'var(--error)' };
        const codeLabels  = {
            '10000': 'Approved — Happy Flow',
            '20005': 'Declined — Do Not Honour',
            '20057': 'Declined — Transaction Not Permitted',
        };
        const copyIcon = `<svg style="width:10px;height:10px;display:inline;vertical-align:middle;opacity:0.6;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>`;

        let html = `
            <div style="border:1px solid var(--border); border-radius:12px; overflow:hidden; margin-bottom:20px;">
                <div style="padding:10px 16px; background:var(--bg-subtle); border-bottom:1px solid var(--border);
                    font-size:12px; font-weight:600; color:var(--text-secondary); display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
                    <span style="font-weight:700; color:var(--text-primary);">${schemeLabel} Test Cards</span>
                    <span style="opacity:0.4;">·</span>
                    <span>CVV <span class="tc-chip" data-copy="100">100 ${copyIcon}</span></span>
                    <span style="opacity:0.4;">·</span>
                    <span>Expiry <span class="tc-chip" data-copy="12/28">12/28 ${copyIcon}</span></span>
                </div>`;

        groups.forEach((group, gi) => {
            const borderTop = gi > 0 ? 'border-top:1px solid var(--border);' : '';
            const codeColor = codeColors[group.responseCode] || 'var(--text-secondary)';
            html += `
                <div style="${borderTop} padding:10px 16px;">
                    <div style="font-size:11px; font-weight:700; color:${codeColor}; margin-bottom:8px; text-transform:uppercase; letter-spacing:0.04em;">
                        ${group.responseCode} — ${codeLabels[group.responseCode] || group.label}
                    </div>
                    <div style="display:flex; flex-wrap:wrap; gap:8px;">`;
            group.cards.forEach(card => {
                html += `
                    <div style="display:inline-flex; align-items:center; gap:6px; padding:5px 10px;
                        border:1px solid var(--border); border-radius:8px; background:var(--bg-card);">
                        <span class="tc-chip" data-copy="${card.number}" title="Copy card number">${card.number} ${copyIcon}</span>
                        <span style="font-size:10px; font-weight:700; padding:2px 6px; border-radius:4px;
                            background:var(--bg-subtle); border:1px solid var(--border); color:var(--text-secondary);">${card.country}</span>
                    </div>`;
            });
            html += `</div></div>`;
        });
        html += `</div>`;

        container.innerHTML = html;
        container.querySelectorAll('.tc-chip').forEach(chip => {
            chip.addEventListener('click', () => copyChip(chip.dataset.copy, chip));
        });
        show('payout-test-cards');
    }

    // ─── Account holder type toggles ──────────────────────────────────
    function onCardDestAhTypeChange() {
        const type = val('payout-dest-ah-type');
        if (type === 'individual') {
            show('payout-dest-fname-group');
            show('payout-dest-lname-group');
            hide('payout-dest-company-group');
        } else {
            hide('payout-dest-fname-group');
            hide('payout-dest-lname-group');
            show('payout-dest-company-group');
        }
    }

    function onBankAhTypeChange() {
        const type = val('payout-bank-ah-type');
        if (type === 'individual') {
            show('payout-bank-ah-fname-group');
            show('payout-bank-ah-lname-group');
            hide('payout-bank-ah-company-group');
        } else {
            hide('payout-bank-ah-fname-group');
            hide('payout-bank-ah-lname-group');
            show('payout-bank-ah-company-group');
        }
    }

    function onSenderTypeChange() {
        const type = val('payout-sender-type');
        if (type === 'individual') {
            show('payout-sender-fname-group');
            show('payout-sender-lname-group');
            hide('payout-sender-company-group');
        } else {
            hide('payout-sender-fname-group');
            hide('payout-sender-lname-group');
            show('payout-sender-company-group');
        }
    }


    // ─── Init ─────────────────────────────────────────────────────────
    function init() {
        // Guard: tab must be in DOM
        if (!el('select-card-payout')) return;

        // Payout type selector clicks
        el('select-card-payout').addEventListener('click', () => selectPayoutType('card'));
        el('select-bank-payout').addEventListener('click', () => selectPayoutType('bank'));

        // Card scheme change
        el('payout-card-scheme').addEventListener('change', onSchemeChange);

        // Account holder type toggles
        el('payout-dest-ah-type').addEventListener('change', onCardDestAhTypeChange);
        el('payout-bank-ah-type').addEventListener('change', onBankAhTypeChange);
        el('payout-sender-type').addEventListener('change', onSenderTypeChange);

        // Sender toggle
        el('payout-sender-enable').addEventListener('change', function () {
            if (this.checked) show('payout-sender-fields');
            else              hide('payout-sender-fields');
        });

        // Submit buttons
        el('card-payout-submit-btn').addEventListener('click', onCardPayoutSubmit);
        el('bank-payout-submit-btn').addEventListener('click', onBankPayoutSubmit);

        // Queue: expand/collapse detail rows
        const queueList = el('payout-queue-list');
        if (queueList) {
            queueList.addEventListener('click', (e) => {
                const row = e.target.closest('[data-pq-row]');
                if (!row) return;
                const detail = row.closest('.pq-entry')?.querySelector('[data-pq-detail]');
                if (detail) detail.style.display = detail.style.display === 'none' ? '' : 'none';
            });
        }

        // Queue: clear resolved entries
        const clearBtn = el('payout-queue-clear');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                if (_pendingCount > 0) {
                    showToast(`${_pendingCount} payout${_pendingCount > 1 ? 's' : ''} still pending — cannot clear`, 'error');
                    return;
                }
                _payoutQueue.length = 0;
                renderQueue();
            });
        }

        // Re-mount card field when amount or currency changes (session is scheme+amount+currency aware)
        el('payout-amount').addEventListener('change', () => {
            if (_activeScheme) onSchemeChange();
        });
        el('payout-currency').addEventListener('change', () => {
            if (_activeScheme) onSchemeChange();
        });

        // Re-mount card field on theme change so Flow UI matches the new theme
        document.addEventListener('themechange', async () => {
            if (_activeScheme && el('payout-card-form-host')) {
                try {
                    await mountPayoutCardField(_activeScheme);
                } catch (e) {
                    console.warn('Payout card re-mount after theme change failed:', e);
                }
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
