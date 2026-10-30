// =============================================
// Standalone Checkout Suite Module
// Handles: Standalone 3DS (hosted sessions), Network Tokens, Account Updater + RTAU,
//          Card Metadata — all driven from one shared "card source" (saved src_ instrument,
//          new card via Flow tokenization, or raw test PAN) and one live webhook panel.
// Backend: /standalone/* routes (standalone-routes.js) + existing /payments,
//          /card-metadata, /payment-sessions, /get-payment-details.
// Every request, response and webhook is written to the API log sidebar.
// =============================================

(function () {

    const API_BASE = window.APP_CONFIG?.apiBaseUrl || '';

    // ----- Storage keys -----
    const LS_INSTRUMENTS = 'cko-suite-instruments';   // saved src_ ids, grouped by customer
    const LS_NTS         = 'cko-suite-network-tokens';
    // Hosted 3DS leaves this single-page app and comes back to index.html, so the whole 3DS workspace is
    // snapshotted per session id. localStorage (not sessionStorage) so it also survives a return in a NEW tab.
    const LS_SNAPSHOTS = 'cko-suite-3ds-snapshots';   // { [sid]: snapshot } — newest 10 kept
    const LS_LAST_SID  = 'cko-suite-3ds-last-sid';    // fallback when the return URL carries no session id
    // One authentication buys one payment: once a payment has been created against a session id it is recorded
    // here ({ [sid]: { payment_id, approved, status, response_code, at } }) and Step 3 stays locked for that sid.
    const LS_CONSUMED  = 'cko-suite-3ds-consumed';
    // Step 3 may only open for a status that is explicitly terminal. Anything else — pending, processing,
    // challenged, or a status this tester has never seen — counts as "authentication not finished".
    const FINAL_STATUSES = ['approved', 'attempted', 'declined', 'rejected', 'unavailable', 'challenge_abandoned', 'expired'];
    const RESULT_BOXES = ['sa-3ds-create-res', 'sa-3ds-session-res', 'sa-pay-res', 'sa-pay-details-res'];

    // ----- DOM helpers -----
    const $ = (id) => document.getElementById(id);
    const val = (id) => $(id)?.value ?? '';
    const checked = (id) => $(id)?.checked ?? false;
    const show = (id, display = '') => { const e = $(id); if (e) e.style.display = display; };
    const hide = (id) => { const e = $(id); if (e) e.style.display = 'none'; };
    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const lsGet = (k) => { try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch (e) { return []; } };
    const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage full — ignore */ } };
    const tabActive = () => $('standalone-tab')?.classList.contains('active');
    const jsonOf = (o) => JSON.stringify(o, null, 2);

    function deepMerge(target, extra) {
        if (!extra || typeof extra !== 'object') return target;
        Object.keys(extra).forEach(k => {
            if (extra[k] && typeof extra[k] === 'object' && !Array.isArray(extra[k]) && target[k] && typeof target[k] === 'object') {
                deepMerge(target[k], extra[k]);
            } else {
                target[k] = extra[k];
            }
        });
        return target;
    }

    // Reads a "advanced override" textarea. Invalid JSON → toast + throws, so no request goes out.
    function readExtra(id, quiet) {
        const raw = val(id).trim();
        if (!raw) return null;
        try { return JSON.parse(raw); } catch (e) {
            if (!quiet) showToast('Advanced JSON override is not valid JSON: ' + e.message, 'error');
            if (quiet) return null;
            throw new Error('invalid-extra-json');
        }
    }

    // ----- State -----
    const state = {
        product: null,
        mode: 'saved',
        flowComponent: null, flowNeedsMount: true, flowMounting: false,
        lastToken: null,
        sid: null, session: null, redirectHref: null, sessionSource: null, prefilled: {}, pollTimer: null, pollStatus: null, pollStarted: 0,
        payAuth: 'sid',
        lastPaymentId: null,
        whTimer: null, whSeq: 0, whPaused: false, whReplay: true, whEvents: [],
        resText: {},
    };

    // =====================================================================
    // Busy-button wrapper — disables every listed button while work is in flight
    // =====================================================================
    async function runBusy(btnIds, label, fn) {
        const btns = btnIds.map($).filter(Boolean);
        if (btns.some(b => b.disabled)) return;          // already processing
        const originals = btns.map(b => b.textContent);
        btns.forEach((b, i) => { b.disabled = true; if (i === 0) b.textContent = label; });
        try {
            return await fn();
        } catch (err) {
            if (err.message !== 'invalid-extra-json') {
                console.error('[standalone]', err);
                showToast(err.message || 'Request failed', 'error');
            }
        } finally {
            btns.forEach((b, i) => { b.disabled = false; b.textContent = originals[i]; });
            afterBusy();
        }
    }
    // Some buttons are conditionally enabled (redirect buttons need a session) — restore that.
    function afterBusy() { syncRedirectButtons(); updatePayGate(); }   // runBusy re-enables buttons — re-apply the gate

    // =====================================================================
    // HTTP — /standalone/* (envelope) and legacy routes (raw)
    // =====================================================================
    async function call(method, path, { body, query, label } = {}) {
        const qs = query ? '?' + new URLSearchParams(query).toString() : '';
        const headers = { 'Content-Type': 'application/json' };
        const mode = val('sa-auth-mode');
        if (mode) headers['x-auth-mode'] = mode;

        let httpStatus = 0, env;
        try {
            const res = await fetch(`${API_BASE}/standalone/${path}${qs}`, {
                method, headers, body: body !== undefined ? JSON.stringify(body) : undefined,
            });
            httpStatus = res.status;
            env = await res.json().catch(() => ({ upstream_status: httpStatus, upstream: null, data: { error: `Non-JSON response (HTTP ${httpStatus}) — is the API Gateway route for /standalone/${path} deployed?` } }));
        } catch (err) {
            env = { upstream_status: 0, upstream: null, auth_mode: null, cko_request_id: null, data: { error: 'Network error: ' + err.message } };
        }
        if (env.upstream_status === undefined) env = { upstream_status: httpStatus, upstream: null, data: env }; // gateway-level error shape
        env.ok = env.upstream_status >= 200 && env.upstream_status < 300;
        addToApiLog(method, label || env.upstream || `/standalone/${path}`, env.upstream_status || httpStatus, body ?? {}, {
            upstream_status: env.upstream_status, auth_mode: env.auth_mode, cko_request_id: env.cko_request_id, data: env.data,
        });
        return env;
    }

    // Existing routes return the raw CKO body; wrap into the same shape so renderers are shared.
    async function callLegacy(method, path, { body, query, label } = {}) {
        const qs = query ? '?' + new URLSearchParams(query).toString() : '';
        let status = 0, data;
        try {
            const res = await fetch(`${API_BASE}${path}${qs}`, {
                method, headers: { 'Content-Type': 'application/json' }, body: body !== undefined ? JSON.stringify(body) : undefined,
            });
            status = res.status;
            data = await res.json().catch(() => ({ error: `Non-JSON response (HTTP ${status})` }));
        } catch (err) {
            data = { error: 'Network error: ' + err.message };
        }
        addToApiLog(method, label || path, status, body ?? {}, data);
        return { ok: status >= 200 && status < 300, upstream_status: status, upstream: `${method} ${path}`, auth_mode: 'secret (existing route)', cko_request_id: null, data };
    }

    // =====================================================================
    // Response rendering
    // =====================================================================
    function kv(rows) {
        return `<div class="sa-kv">` + rows.filter(r => r && r[1] !== undefined && r[1] !== null && r[1] !== '').map(([k, v, cls]) =>
            `<div class="k">${esc(k)}</div><div class="v ${cls || ''}">${esc(typeof v === 'object' ? JSON.stringify(v) : v)}</div>`).join('') + `</div>`;
    }

    function renderResponse(containerId, env, summaryHtml) {
        const box = $(containerId);
        if (!box) return;
        const body = env.data;
        state.resText[containerId] = jsonOf(body);
        box.style.display = 'block';
        box.innerHTML = `
            <div class="sa-res-head">
                <span class="sa-res-badge ${env.ok ? 'ok' : 'bad'}">${esc(env.upstream_status || 'ERR')}</span>
                <span class="sa-res-meta">${esc(env.upstream || '')}</span>
                ${env.auth_mode ? `<span class="sa-tc-tag">auth: ${esc(env.auth_mode)}</span>` : ''}
                ${env.cko_request_id ? `<span class="sa-tc-tag">cko-request-id: ${esc(env.cko_request_id)}</span>` : ''}
                <button class="copy-btn" type="button" data-sa-copyres="${esc(containerId)}" style="margin-left:auto;">Copy JSON</button>
            </div>
            <div class="sa-res-body">
                ${summaryHtml || ''}
                <details ${summaryHtml ? '' : 'open'}><summary class="sa-note" style="cursor:pointer;">Raw response body</summary>
                    <pre class="sa-preview">${esc(body === null || body === undefined ? '(empty body)' : jsonOf(body))}</pre></details>
            </div>`;
    }

    // =====================================================================
    // Instruments (saved src_ ids) — localStorage
    // =====================================================================
    const sameCustomer = (a, b) =>
        !!((a.email && b.email && a.email.toLowerCase() === b.email.toLowerCase()) || (a.customer_id && b.customer_id && a.customer_id === b.customer_id));

    const currentCustomer = () => ({ email: val('sa-cust-email').trim(), customer_id: val('sa-cust-id').trim() });

    function upsertInstrument(entry) {
        const list = lsGet(LS_INSTRUMENTS);
        let idx = list.findIndex(i => i.id === entry.id);
        // Same physical card re-tokenized for the same customer → refresh that entry instead of duplicating.
        if (idx < 0 && entry.fingerprint) idx = list.findIndex(i => i.fingerprint === entry.fingerprint && sameCustomer(i, entry));
        if (idx >= 0) list[idx] = { ...list[idx], ...entry }; else list.unshift(entry);
        lsSet(LS_INSTRUMENTS, list);
    }

    function instrumentLabel(i) {
        const exp = i.expiry_month ? ` · ${String(i.expiry_month).padStart(2, '0')}/${String(i.expiry_year).slice(-2)}` : '';
        return `${i.scheme || 'Card'} •••• ${i.last4 || '????'}${exp} · ${i.id}`;
    }

    function renderInstrumentSelect(preferId) {
        const sel = $('sa-instrument-select');
        if (!sel) return;
        const keep = preferId || sel.value;
        const cust = currentCustomer();
        const all = checked('sa-show-all') || (!cust.email && !cust.customer_id);
        const list = lsGet(LS_INSTRUMENTS).filter(i => all || sameCustomer(i, cust) || i.id === keep);

        if (!list.length) {
            sel.innerHTML = `<option value="">— no saved cards${all ? '' : ' for this customer'} —</option>`;
            renderInstrumentDetail();
            return;
        }
        const groups = {};
        list.forEach(i => { (groups[i.email || i.customer_id || 'No customer'] ||= []).push(i); });
        sel.innerHTML = Object.entries(groups).map(([g, items]) =>
            `<optgroup label="${esc(g)}">${items.map(i => `<option value="${esc(i.id)}">${esc(instrumentLabel(i))}</option>`).join('')}</optgroup>`).join('');
        sel.value = list.some(i => i.id === keep) ? keep : list[0].id;
        renderInstrumentDetail();
    }

    function renderInstrumentDetail() {
        const e = lsGet(LS_INSTRUMENTS).find(i => i.id === val('sa-instrument-select'));
        $('sa-instrument-detail').innerHTML = e
            ? `<strong>${esc(e.id)}</strong> · ${esc(e.scheme || '')} ${esc(e.card_type || '')} ${esc(e.issuer_country || '')} · customer: ${esc(e.email || '—')} ${esc(e.customer_id || '')} · saved ${esc((e.created_at || '').slice(0, 10))}`
            : '';
    }

    function selectedInstrument() {
        return lsGet(LS_INSTRUMENTS).find(i => i.id === val('sa-instrument-select')) || null;
    }

    // =====================================================================
    // Card source (shared by every product)
    // =====================================================================
    function setMode(mode) {
        state.mode = mode;
        document.querySelectorAll('#sa-mode-pills .sa-pill').forEach(p => p.classList.toggle('active', p.dataset.saMode === mode));
        ['saved', 'new', 'raw'].forEach(m => (m === mode ? show : hide)(`sa-mode-${m}`));
        if (mode === 'saved') renderInstrumentSelect();
        if (mode === 'new' && state.flowNeedsMount) mountFlowCard();
        updateActiveSource();
        refreshPreviews();
    }

    function rawCard() {
        return {
            number: val('sa-raw-number').replace(/\s+/g, ''),
            expiry_month: parseInt(val('sa-raw-month'), 10),
            expiry_year: parseInt(val('sa-raw-year'), 10),
            cvv: val('sa-raw-cvv'),
            name: val('sa-raw-name'),
        };
    }

    // Returns { type:'instrument', id, entry } | { type:'card', card } | null (toast unless quiet).
    function getCardSource(quiet) {
        if (state.mode === 'raw') {
            const c = rawCard();
            if (!c.number || !c.expiry_month || !c.expiry_year) { if (!quiet) showToast('Fill in the raw card number and expiry first', 'error'); return null; }
            return { type: 'card', card: c };
        }
        if (state.mode === 'new') {
            if (!quiet) showToast('Tokenize & save the new card first — it becomes the selected instrument', 'error');
            return null;
        }
        const entry = selectedInstrument();
        if (!entry) {
            if (!quiet) showToast('No saved instrument selected — add a card via "New card" or paste an existing src_ id', 'error');
            return null;
        }
        return { type: 'instrument', id: entry.id, entry };
    }

    function updateActiveSource() {
        const src = getCardSource(true);
        const box = $('sa-active-source');
        if (!box) return;
        box.innerHTML = src
            ? (src.type === 'instrument'
                ? `🔑 <span>Active source: saved instrument <strong>${esc(src.id)}</strong> (${esc(src.entry.scheme || 'card')} •••• ${esc(src.entry.last4 || '????')}). Sent as <code>{ type: "id", id }</code>.</span>`
                : `🧪 <span>Active source: raw card <strong>•••• ${esc(src.card.number.slice(-4))}</strong>. Sent as full card details.</span>`)
            : `ℹ️ <span>${state.mode === 'new' ? 'Enter a card and click “Tokenize & save card” — it becomes a reusable instrument.' : 'No active card source yet.'}</span>`;
        if (state.product === 'nt') renderNtSelect();
    }

    // ----- Flow tokenization (new card) -----
    async function mountFlowCard() {
        if (state.flowMounting) return;
        state.flowMounting = true;
        state.flowNeedsMount = false;
        const host = $('sa-flow-host');
        host.innerHTML = '';
        show('sa-flow-loading');
        $('sa-tokenize-btn').disabled = true;
        $('sa-tokenize-hint').textContent = '';
        try {
            const sessionBody = {
                amount: 100,
                currency: 'EUR',
                processing_channel_id: window.APP_CONFIG.processingChannelId,
                reference: `suite-tokenize-${Date.now()}`,
                success_url: `${window.location.origin}/success.html`,
                failure_url: `${window.location.origin}/failure.html`,
                disabled_payment_methods: ['remember_me'],
                billing: { address: { country: 'DE' } },
            };
            const env = await callLegacy('POST', '/payment-sessions', { body: sessionBody, label: 'POST /payment-sessions (Suite tokenizer)' });
            if (!env.data?.id) throw new Error('Payment session creation failed: ' + JSON.stringify(env.data));

            const checkout = await CheckoutWebComponents({
                publicKey: window.APP_CONFIG.publicKey,
                environment: 'sandbox',
                locale: 'en-GB',
                paymentSession: env.data,
                componentOptions: { card: { data: { cardholderName: 'Test Cardholder' }, displayCardholderName: 'bottom' } },
                appearance: getFlowAppearance(),
                onReady: () => {},
                onChange: () => {},
                onError: (_c, error) => console.error('Suite card tokenizer error:', error),
            });
            state.flowComponent = checkout.create('card', { showPayButton: false });
            if (await state.flowComponent.isAvailable()) state.flowComponent.mount(host);
            $('sa-tokenize-btn').disabled = false;
        } catch (err) {
            state.flowNeedsMount = true;
            $('sa-tokenize-hint').textContent = '❌ Failed to load card field: ' + err.message;
            showToast('Failed to load card field: ' + err.message, 'error');
        } finally {
            hide('sa-flow-loading');
            state.flowMounting = false;
        }
    }

    // Resolves which customer an instrument should be attached to. If a saved entry with the same
    // email already has a cus_ id, reuse it — otherwise CKO would reject a duplicate email.
    function resolveCustomer() {
        const { email, customer_id } = currentCustomer();
        if (customer_id) return { body: { id: customer_id }, note: null };
        if (email) {
            const known = lsGet(LS_INSTRUMENTS).find(i => i.customer_id && i.email && i.email.toLowerCase() === email.toLowerCase());
            if (known) return { body: { id: known.customer_id }, note: `Linked to existing customer ${known.customer_id} (same email)` };
            return { body: { email, name: val('sa-raw-name') || undefined }, note: null };
        }
        return { body: undefined, note: null };
    }

    async function tokenizeAndSave() {
        if (!state.flowComponent) return showToast('Card field is not ready yet', 'error');
        const { data: tokenData } = await state.flowComponent.tokenize();
        const token = tokenData?.token;
        if (!token) throw new Error('Tokenization returned no token');

        state.lastToken = token;
        $('sa-token-value').textContent = token;
        show('sa-token-badge');
        if ($('sa-meta-token')) $('sa-meta-token').value = token;

        const customer = resolveCustomer();
        const body = { type: 'token', token };
        if (customer.body) body.customer = customer.body;
        const env = await call('POST', 'instruments', { body, label: 'POST /instruments (Suite — Flow token → src_)' });

        if (!env.ok || !env.data?.id) {
            $('sa-tokenize-hint').textContent = `❌ Instrument creation failed (${env.upstream_status}) — see API log. The token above can still be used for Card Metadata.`;
            showToast('Instrument creation failed: ' + (env.data?.error_codes?.join(', ') || env.upstream_status), 'error');
            state.flowNeedsMount = true;
            return;
        }
        const d = env.data;
        const cust = currentCustomer();
        upsertInstrument({
            id: d.id, scheme: d.scheme, last4: d.last4, bin: d.bin, expiry_month: d.expiry_month, expiry_year: d.expiry_year,
            card_type: d.card_type, issuer_country: d.issuer_country, fingerprint: d.fingerprint,
            email: cust.email || '', customer_id: d.customer?.id || customer.body?.id || cust.customer_id || '',
            created_at: new Date().toISOString(),
        });
        if (customer.note) showToast(customer.note);
        showToast(`Saved ${d.id} — selected as the active card`);
        state.flowNeedsMount = true;      // the Flow field has been used; remount a fresh one next time
        $('sa-tokenize-hint').textContent = '';
        setMode('saved');
        renderInstrumentSelect(d.id);
        updateActiveSource();
        refreshPreviews();
    }

    // =====================================================================
    // Test cards
    // =====================================================================
    function chip(number, scheme, extra = '') {
        return `<span class="sa-chip" data-sa-pan="${esc(number)}" data-sa-scheme="${esc(scheme)}" title="Click to use this card">${esc(scheme)} <small>••${esc(number.slice(-4))}</small>${extra}</span>`;
    }

    function renderTestCards() {
        const box = $('sa-test-cards');
        if (!box) return;
        const p = state.product;
        let html = `<div class="sa-note" style="margin-bottom:10px;">${esc(SUITE_PRODUCT_NOTES[p] || '')}</div>`;

        if (p === '3ds') {
            const group = (g) => {
                const first = g.cards.slice(0, 3), rest = g.cards.slice(3);
                return `<div class="sa-tc-group">
                    <div class="sa-tc-head"><span class="sa-tc-title">${esc(g.title)}</span>
                        <span class="sa-tc-tag">${esc(g.result)}</span><span class="sa-tc-tag">likely: ${esc(g.likelyStatus)}</span></div>
                    <div class="sa-tc-sum">${esc(g.summary)}</div>
                    <div>${first.map(c => chip(c.number, c.scheme)).join('')}
                        ${rest.length ? `<span class="sa-chip" data-sa-more="${esc(g.id)}" data-sa-label="+${rest.length} more">+${rest.length} more</span><span data-sa-rest="${esc(g.id)}" style="display:none;">${rest.map(c => chip(c.number, c.scheme)).join('')}</span>` : ''}</div>
                </div>`;
            };
            const flowBlock = (flow, title, open) => `<details class="sa-details" ${open ? 'open' : ''}><summary>${title}</summary>${SUITE_3DS_GROUPS.filter(g => g.flow === flow).map(group).join('')}</details>`;
            html += flowBlock('frictionless', 'Frictionless flow — no challenge page (8 outcomes)', false);
            html += flowBlock('challenge', `Challenge flow — 3DS simulator page, password <code>${SUITE_3DS_PASSWORD}</code> (7 outcomes)`, false);
            const n = SUITE_NON_3DS_CARDS;
            html += `<details class="sa-details"><summary>${esc(n.title)} cards</summary><div class="sa-tc-group"><div class="sa-tc-sum">${esc(n.summary)}</div>
                <div>${n.cards.map(c => chip(c.number, c.scheme)).join('')}</div></div></details>`;
        } else if (p === 'nt') {
            html += `<div class="sa-tc-group"><div>${SUITE_NT_CARDS.map(c => chip(c.number, c.scheme, ` <small>— ${esc(c.note)}</small>`)).join('<br>')}</div>
                <div class="sa-tc-sum" style="margin-top:8px;">Tip: provision with a saved instrument to test the “card stored with Checkout.com” path (<code>source.type = id</code>); use a raw card for the “merchant-stored card” path.</div></div>`;
        } else if (p === 'meta') {
            const rowTxt = (c) => {
                const f = (a) => a.join(' / ');
                return `non-money-transfer ${f(c.nmt)} · money-transfer ${f(c.mt)} · gambling ${f(c.gam)}`;
            };
            html += `<div class="sa-tc-group"><div class="sa-tc-sum">Values are <em>domestic / cross-border</em>. Click a card to load it (use format <code>card_payouts</code>); the result is checked against these expectations.</div>
                ${SUITE_METADATA_CARDS.map(c => `<div style="margin:4px 0;">${chip(c.number, c.scheme)} <span class="sa-note">${esc(rowTxt(c))}</span></div>`).join('')}</div>`;
        } else if (p === 'au') {
            html += `<div class="sa-tc-group"><div class="sa-tc-sum">No CKO-published test cards. Type any card number your team has been given into <strong>Raw test card</strong>, or save it as an instrument via <strong>New card</strong>.</div></div>`;
        }
        const label = { '3ds': '3DS test cards by outcome', nt: 'Network token test cards', au: 'Account updater test data', meta: 'Card metadata test cards' }[p] || 'Test cards';
        box.innerHTML = `<details class="sa-details" id="sa-tc-details" style="margin:0;"><summary>${label} — click to expand</summary>${html}</details>`;
    }

    async function useTestCard(pan, scheme) {
        // New-card mode: Flow's field is a secure iframe and can't be auto-filled — copy instead.
        if (state.mode === 'new') {
            try { await navigator.clipboard.writeText(pan); } catch (e) { /* clipboard blocked */ }
            showToast(`Copied ${pan} — paste it into the Flow card field`);
            return;
        }
        const amex = /^3[47]/.test(pan);
        $('sa-raw-number').value = pan;
        $('sa-raw-month').value = '12';
        $('sa-raw-year').value = '2030';
        $('sa-raw-cvv').value = amex ? '1000' : (SUITE_NON_3DS_CARDS.cards.find(c => c.number === pan)?.cvv || '100');
        if (state.mode !== 'raw') setMode('raw');
        if (state.product === 'meta' && val('sa-meta-source') === 'bin') $('sa-meta-bin').value = pan.slice(0, 8);
        updateActiveSource();
        refreshPreviews();
        showToast(`Loaded ${scheme} ••${pan.slice(-4)} into the raw card form`);
    }

    // =====================================================================
    // Request builders (shared by previews and real calls)
    // =====================================================================
    const projectChannel = () => window.APP_CONFIG?.processingChannelId;

    function sessionSourceBody(src) {
        if (!src) return '<select a card source>';
        if (src.type === 'instrument') return { type: 'id', id: src.id };
        const s = { type: 'card', number: src.card.number, expiry_month: src.card.expiry_month, expiry_year: src.card.expiry_year };
        if (val('sa-3ds-email')) s.email = val('sa-3ds-email');
        return s;
    }

    function buildSessionBody(quiet) {
        const src = getCardSource(true);
        if (!src && !quiet) { getCardSource(false); return null; }
        const source = sessionSourceBody(src);
        if (typeof source === 'object') {
            if (val('sa-3ds-email')) source.email = val('sa-3ds-email');
            if (val('sa-3ds-bill-line1') || val('sa-3ds-bill-city') || val('sa-3ds-bill-zip')) {
                source.billing_address = {
                    address_line1: val('sa-3ds-bill-line1'), city: val('sa-3ds-bill-city'),
                    zip: val('sa-3ds-bill-zip'), country: val('sa-3ds-bill-country'),
                };
            }
        }
        const type = val('sa-3ds-auth-type');
        const body = {
            source,
            amount: parseInt(val('sa-3ds-amount'), 10),
            currency: val('sa-3ds-currency'),
            processing_channel_id: projectChannel(),
            authentication_type: type,
            authentication_category: val('sa-3ds-category'),
            challenge_indicator: val('sa-3ds-challenge'),
            transaction_type: val('sa-3ds-transaction-type'),
            reference: val('sa-3ds-reference') || `suite-3ds-${Date.now().toString().slice(-8)}`,
            shipping_address_matches_billing: checked('sa-3ds-ship-matches'),
            completion: { type: 'hosted', success_url: val('sa-3ds-success-url'), failure_url: val('sa-3ds-failure-url') },
        };
        if (!checked('sa-3ds-ship-matches')) {
            body.shipping_address = {
                address_line1: val('sa-3ds-ship-line1'), city: val('sa-3ds-ship-city'),
                zip: val('sa-3ds-ship-zip'), country: val('sa-3ds-ship-country'),
            };
        }
        if (type === 'recurring' || type === 'installment') {
            const sched = { days_between_payments: parseInt(val('sa-3ds-days'), 10), expiry: val('sa-3ds-expiry') };
            if (type === 'installment') sched.number_of_payments = parseInt(val('sa-3ds-inst-count'), 10);
            body[type] = sched;
        }
        return deepMerge(body, readExtra('sa-3ds-extra', quiet));
    }

    // Source shape for POST /payments
    function paymentSource(src, extra = {}) {
        if (!src) return '<select a card source>';
        if (src.type === 'instrument') return { id: src.id, ...extra };
        return { ...src.card, ...extra };
    }

    function buildAuthorizeBody(quiet) {
        const src = state.sessionSource || getCardSource(true);
        const cvv = val('sa-pay-cvv');
        const source = paymentSource(src, cvv ? { cvv } : {});
        const threeDs = state.payAuth === 'sid'
            ? { enabled: true, authentication_id: val('sa-3ds-sid') || '<session id>' }
            : { enabled: true, eci: val('sa-pay-eci'), cryptogram: val('sa-pay-cryptogram'), xid: val('sa-pay-xid'), version: val('sa-pay-version') };
        return {
            source,
            amount: parseInt(val('sa-pay-amount'), 10),
            currency: val('sa-pay-currency'),
            capture: checked('sa-pay-capture'),
            reference: val('sa-pay-reference') || `suite-3ds-pay-${Date.now().toString().slice(-8)}`,
            processing_channel_id: projectChannel(),
            '3ds': threeDs,
        };
    }

    function ntSource(src) {
        if (!src) return '<select a card source>';
        return src.type === 'instrument'
            ? { type: 'id', id: src.id }
            : { type: 'card', number: src.card.number, expiry_month: String(src.card.expiry_month).padStart(2, '0'), expiry_year: String(src.card.expiry_year) };
    }

    function buildProvisionBody(quiet) {
        return deepMerge({ source: ntSource(getCardSource(true)) }, readExtra('sa-nt-extra', quiet));
    }

    function buildAuBody() {
        const src = getCardSource(true);
        if (!src) return { source_options: '<select a card source>' };
        return src.type === 'instrument'
            ? { source_options: { instrument: { id: src.id } } }
            : { source_options: { card: { number: src.card.number, expiry_month: src.card.expiry_month, expiry_year: src.card.expiry_year } } };
    }

    function buildRtauBody() {
        const src = getCardSource(true);
        const body = {
            source: paymentSource(src, { allow_update: checked('sa-rt-allow') }),
            amount: parseInt(val('sa-rt-amount'), 10),
            currency: val('sa-rt-currency'),
            payment_type: val('sa-rt-type'),
            merchant_initiated: checked('sa-rt-mit'),
            capture: true,
            reference: `suite-rtau-${Date.now().toString().slice(-8)}`,
            processing_channel_id: projectChannel(),
        };
        if (checked('sa-rt-mit') && val('sa-rt-prev')) body.previous_payment_id = val('sa-rt-prev');
        return body;
    }

    function buildMetaBody() {
        const t = val('sa-meta-source');
        let source;
        if (t === 'bin') source = { type: 'bin', bin: val('sa-meta-bin') };
        else if (t === 'token') source = { type: 'token', token: val('sa-meta-token') };
        else if (t === 'dpan') source = { type: 'card', number: val('sa-meta-dpan').replace(/\s+/g, '') };
        else {
            const src = getCardSource(true);
            source = !src ? '<select a card source>' : src.type === 'instrument' ? { type: 'id', id: src.id } : { type: 'card', number: src.card.number };
        }
        const body = { source, format: val('sa-meta-format') };
        if (val('sa-meta-reference')) body.reference = val('sa-meta-reference');
        return body;
    }

    function refreshPreviews() {
        const set = (id, fn) => { const e = $(id); if (e) { try { e.textContent = jsonOf(fn()); } catch (err) { e.textContent = '(preview unavailable: ' + err.message + ')'; } } };
        switch (state.product) {
            case '3ds':
                set('sa-3ds-preview', () => buildSessionBody(true));
                set('sa-pay-preview', () => buildAuthorizeBody(true));
                break;
            case 'nt': set('sa-nt-preview', () => buildProvisionBody(true)); break;
            case 'au':
                set('sa-au-preview', buildAuBody);
                set('sa-rt-preview', buildRtauBody);
                break;
            case 'meta': set('sa-meta-preview', buildMetaBody); break;
        }
    }

    // =====================================================================
    // Step 3 gate — one payment per authentication
    // =====================================================================
    const readConsumed = () => { try { return JSON.parse(localStorage.getItem(LS_CONSUMED) || '{}'); } catch (e) { return {}; } };
    function markConsumed(sid, info) {
        const all = readConsumed();
        all[sid] = { ...info, at: Date.now() };
        try { localStorage.setItem(LS_CONSUMED, JSON.stringify(all)); } catch (e) { /* storage full */ }
    }

    // locked: Step 3 cannot be used right now; reason explains why and what to do.
    function payGate() {
        const sid = state.sid;
        if (!sid) return { locked: true, kind: 'none' };
        const used = readConsumed()[sid];
        if (used) return { locked: true, kind: 'used', used };
        const st = state.session?.status;
        if (!st) return { locked: true, kind: 'unknown' };
        if (!isFinalStatus(st)) return { locked: true, kind: 'waiting', status: st };
        return { locked: false, kind: 'ready', status: st };
    }

    function updatePayGate() {
        const btn = $('sa-pay-btn'), body = $('sa-pay-body'), box = $('sa-pay-gate');
        if (!btn) return;
        const g = payGate();
        // Never fight an in-flight request: runBusy owns the disabled state while it is running.
        if (btn.textContent === 'Authorize payment') btn.disabled = g.locked;
        if (body) body.classList.toggle('sa-step-lock', g.locked);
        btn.title = g.locked ? 'Locked — finish the 3DS redirect first (see the notice above)' : '';
        if (!box) return;
        let cls = 'info', icon = '🔒', msg;
        if (g.kind === 'none') msg = '<strong>Step 3 is locked.</strong> Create a session in Step 1 and complete the redirect in Step 2 first.';
        else if (g.kind === 'unknown') msg = '<strong>Step 3 is locked.</strong> Load the session result (Step 2 → Get session) to see whether authentication finished.';
        else if (g.kind === 'waiting') msg = `<strong>Step 3 is locked — authentication is still ${esc(g.status)}.</strong> Complete the redirect in Step 2; this unlocks by itself when the session finishes.`;
        else if (g.kind === 'used') {
            cls = 'warn'; icon = '✔';
            const u = g.used;
            msg = `<strong>This authentication has been used.</strong> Payment <code>${esc(u.payment_id)}</code> was created with it (${u.approved ? 'approved' : 'declined'}${u.response_code ? `, ${esc(u.response_code)}` : ''}). `
                + `A 3DS authentication covers a single payment — to test another, <a href="#" data-sa-newsession="1">start a new session ↑</a> and complete its redirect.`;
        } else { cls = 'info'; icon = '🔓'; msg = `<strong>Ready — one payment is allowed for this authentication</strong> (session ${esc(state.sid)}, status ${esc(g.status)}). The button locks as soon as a payment is created.`; }
        box.className = `sa-banner ${cls}`;
        box.style.display = 'flex';
        box.innerHTML = `<span>${icon}</span><div>${msg}</div>`;
    }

    // =====================================================================
    // 3DS workspace snapshots — survive the hosted redirect (same tab or a new one)
    // =====================================================================
    const readSnaps = () => { try { return JSON.parse(localStorage.getItem(LS_SNAPSHOTS) || '{}'); } catch (e) { return {}; } };

    function collectFields() {
        const fields = {}, checks = {};
        document.querySelectorAll('#standalone-tab [id^="sa-"]').forEach(el => {
            if (el.tagName === 'INPUT') {
                if (el.type === 'checkbox') checks[el.id] = el.checked; else fields[el.id] = el.value;
            } else if (el.tagName === 'SELECT' || el.tagName === 'TEXTAREA') {
                fields[el.id] = el.value;
            }
        });
        return { fields, checks };
    }

    let saveTimer;
    function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(saveSnapshot, 400); }

    function saveSnapshot() {
        if (!state.sid) return;                         // nothing to come back to yet
        const { fields, checks } = collectFields();
        const results = {};
        RESULT_BOXES.forEach(id => { const b = $(id); if (b && b.style.display === 'block') results[id] = { html: b.innerHTML, text: state.resText[id] }; });
        const src = state.sessionSource;
        const snap = {
            sid: state.sid, saved_at: Date.now(), mode: state.mode, payAuth: state.payAuth, fields, checks, results,
            sessionSource: src ? (src.type === 'instrument' ? { type: 'instrument', id: src.id } : { type: 'card', card: src.card }) : null,
            redirectHref: state.redirectHref, session: state.session, lastPaymentId: state.lastPaymentId,
            whSeq: state.whSeq, whEvents: state.whEvents.slice(0, 30),
        };
        const all = readSnaps();
        all[state.sid] = snap;
        Object.keys(all).sort((a, b) => all[b].saved_at - all[a].saved_at).slice(10).forEach(k => delete all[k]);
        try { localStorage.setItem(LS_SNAPSHOTS, JSON.stringify(all)); localStorage.setItem(LS_LAST_SID, state.sid); } catch (e) { /* storage full */ }
    }

    // Shows/hides every conditional block from current field values (used at init and after a restore).
    function syncDependentUi() {
        const t = val('sa-3ds-auth-type');
        const recurring = t === 'recurring' || t === 'installment';
        if ($('sa-3ds-recurring-fields')) $('sa-3ds-recurring-fields').style.display = recurring ? 'grid' : 'none';
        if ($('sa-3ds-installments-group')) $('sa-3ds-installments-group').style.display = t === 'installment' ? '' : 'none';
        if ($('sa-3ds-ship-fields')) $('sa-3ds-ship-fields').style.display = checked('sa-3ds-ship-matches') ? 'none' : 'grid';
        const m = val('sa-meta-source');
        ['bin', 'token', 'dpan'].forEach(x => { const g = $(`sa-meta-${x}-group`); if (g) g.style.display = m === x ? '' : 'none'; });
        if ($('sa-pay-data-fields')) $('sa-pay-data-fields').style.display = state.payAuth === 'data' ? 'grid' : 'none';
        document.querySelectorAll('#sa-3ds-auth-mode-pills .sa-pill').forEach(x => x.classList.toggle('active', x.dataset.saAuth === state.payAuth));
    }

    function restoreSnapshot(snap) {
        const set = (id, v) => { const e = $(id); if (e && v !== undefined) e.value = v; };
        // Customer first, so the saved-instrument dropdown is rebuilt with the right entries.
        ['sa-cust-email', 'sa-cust-id'].forEach(id => set(id, snap.fields[id]));
        if ($('sa-show-all') && snap.checks['sa-show-all'] !== undefined) $('sa-show-all').checked = snap.checks['sa-show-all'];
        // A Flow card field can't be restored — fall back to the saved-card view (the new card is already a src_ by then).
        setMode(snap.mode === 'new' ? 'saved' : (snap.mode || 'saved'));
        renderInstrumentSelect(snap.fields['sa-instrument-select']);
        Object.entries(snap.fields).forEach(([id, v]) => { if (id !== 'sa-cust-email' && id !== 'sa-cust-id') set(id, v); });
        Object.entries(snap.checks).forEach(([id, v]) => { const e = $(id); if (e) e.checked = v; });

        state.payAuth = snap.payAuth || 'sid';
        state.sid = snap.sid;
        state.session = snap.session;
        state.redirectHref = snap.redirectHref;
        state.sessionSource = snap.sessionSource;
        state.lastPaymentId = snap.lastPaymentId;
        state.whEvents = snap.whEvents || [];
        state.whSeq = snap.whSeq || 0;
        state.whReplay = false;                         // events that arrived while the user was away are "new" → logged
        syncDependentUi();
        Object.entries(snap.results || {}).forEach(([id, r]) => {
            const b = $(id);
            if (b) { b.innerHTML = r.html; b.style.display = 'block'; state.resText[id] = r.text; }
        });
        if (state.lastPaymentId) show('sa-pay-details-btn', '');
        syncRedirectButtons();
        renderNextStep(state.session);
        updatePayGate();
        renderWebhooks();
        updateActiveSource();
        refreshPreviews();
    }

    // Plain-language "what now" under the session result, driven by the status.
    function renderNextStep(s) {
        const b = $('sa-3ds-next');
        if (!b) return;
        if (!s || !s.status) { b.style.display = 'none'; return; }
        const st = s.status;
        let cls = 'info', icon = '⏳', msg, jump = false;
        if (!isFinalStatus(st)) {
            msg = st === 'pending' ? 'Waiting for the cardholder — redirect them to the hosted page (Step 2). This page keeps polling and restores itself when they come back.'
                : st === 'challenged' ? 'The issuer requires a challenge — the cardholder is on the 3DS page (password <code>Checkout1!</code>).'
                : 'The issuer is evaluating the authentication…';
        } else if (st === 'approved') {
            cls = 'info'; icon = '✅'; jump = true;
            msg = `<strong>Authenticated${s.challenged ? ' after a challenge' : ' (frictionless)'}.</strong> Authorize the payment in Step 3 — via session id, or with the raw 3DS data.`;
        } else if (st === 'attempted') {
            cls = 'warn'; icon = '🟡'; jump = true;
            msg = '<strong>Attempted (stand-in) authentication.</strong> Treated as a success — go ahead and authorize in Step 3; liability differs from a fully authenticated payment.';
        } else {
            cls = 'error'; icon = '⛔'; jump = true;
            msg = `<strong>Authentication did not succeed (${esc(st)}).</strong> In production you would not authorize. In this tester you still can: Step 3 shows how Checkout.com responds when you try to authorize an unauthenticated session.`;
        }
        b.className = `sa-banner ${cls}`;
        b.style.display = 'flex';
        b.innerHTML = `<span>${icon}</span><div>${msg}${jump ? ' <a href="#" data-sa-jump="sa-pay-btn">Jump to Step 3 ↓</a>' : ''}</div>`;
    }

    // Start over: forget the current session (and its snapshot) without touching saved cards or tokens.
    function resetSessionState() {
        stopPolling();
        const all = readSnaps(); delete all[state.sid]; try { localStorage.setItem(LS_SNAPSHOTS, JSON.stringify(all)); localStorage.removeItem(LS_LAST_SID); } catch (e) { /* ignore */ }
        Object.assign(state, { sid: null, session: null, redirectHref: null, sessionSource: null, lastPaymentId: null, prefilled: {}, payAuth: 'sid' });
        syncDependentUi();
        ['sa-3ds-sid', 'sa-pay-eci', 'sa-pay-cryptogram', 'sa-pay-xid', 'sa-pay-version', 'sa-pay-reference', 'sa-pay-cvv'].forEach(id => { if ($(id)) $(id).value = ''; });
        RESULT_BOXES.forEach(id => { const b = $(id); if (b) { b.style.display = 'none'; b.innerHTML = ''; } });
        hide('sa-pay-details-btn');
        $('sa-3ds-poll').textContent = '';
        renderNextStep(null);
        syncRedirectButtons();
        updatePayGate();
        if ($('sa-wh-follow')) { $('sa-wh-follow').checked = true; syncWebhookFollow(); resetWebhookView(); }
        refreshPreviews();
        showToast('3DS state cleared — ready for a new session');
    }

    // =====================================================================
    // Standalone 3DS
    // =====================================================================
    // The redirect link only comes back on POST /sessions — GET /sessions/{id} (used by polling,
    // "Get session" and the return handler) may not repeat it. So it is remembered separately
    // and never cleared by a later response, only when a different session is loaded.
    function syncRedirectButtons() {
        ['sa-3ds-redirect-btn', 'sa-3ds-newtab-btn'].forEach(id => { const b = $(id); if (b) b.disabled = !state.redirectHref; });
        const link = $('sa-3ds-redirect-link');
        if (link) {
            link.innerHTML = state.redirectHref
                ? `Hosted page: <a href="${esc(state.redirectHref)}" target="_blank" rel="noopener">${esc(state.redirectHref)}</a> <button class="copy-btn" type="button" data-sa-copy="sa-3ds-redirect-href">Copy</button><span id="sa-3ds-redirect-href" style="display:none;">${esc(state.redirectHref)}</span>`
                : '';
        }
    }

    function sessionSummary(s) {
        if (!s) return '';
        const st = s.status;
        const cls = ['approved'].includes(st) ? 'good' : ['attempted'].includes(st) ? 'warn' : !isFinalStatus(st) ? '' : 'bad';
        const hint = {
            pending: 'Waiting for the cardholder — redirect them to the hosted page.',
            challenged: 'Issuer requires a challenge — cardholder is on the 3DS page.',
            approved: 'Authenticated — authorize the payment with the sid or the 3DS data below.',
            attempted: 'Stand-in authentication — treat as success and authorize (different liability).',
            declined: 'Issuer denied authentication — do not authorize.',
            rejected: 'Issuer rejected — do NOT attempt authorization.',
            unavailable: 'Technical problem at DS/ACS — retry, or decide on a non-3DS fallback.',
            challenge_abandoned: 'Cardholder left the challenge.',
            expired: 'Channel data was never collected — session expired.',
        }[st];
        return `${kv([
            ['status', st, cls], ['status_reason', s.status_reason], ['approved', s.approved], ['completed', s.completed], ['challenged', s.challenged],
            ['flow_type', s.flow_type], ['protocol_version', s.protocol_version], ['scheme', s.scheme], ['next_actions', s.next_actions],
            ['response_code', s.response_code], ['eci', s.eci], ['cryptogram', s.cryptogram], ['xid', s.xid],
            ['exemption.requested', s.exemption?.requested], ['exemption.applied', s.exemption?.applied], ['transaction_id', s.transaction_id],
        ])}${hint ? `<div class="sa-note"><strong>What now:</strong> ${esc(hint)}</div>` : ''}`;
    }

    function applySession(s) {
        if (s.id && s.id !== state.sid) state.redirectHref = null;      // a different session — old link is stale
        // Real sandbox responses use _links.redirect_url (the docs show _links.redirect) — accept both.
        const link = s._links?.redirect_url?.href || s._links?.redirect?.href;
        if (link) state.redirectHref = link;
        state.session = s;
        state.sid = s.id || state.sid;
        if (s.id) $('sa-3ds-sid').value = s.id;
        // Prefill the "full 3DS data" authorization path from the session result.
        // Never clobber a value the user edited on purpose (e.g. a tampered eci): only fill a field that is
        // empty, or that still holds what we last prefilled into it. This also keeps edits across a hosted-3DS return.
        const prefill = (id, v) => {
            const e = $(id);
            if (!e || v === undefined || v === null || v === '') return;
            if (!e.value || e.value === state.prefilled[id]) e.value = v;
            state.prefilled[id] = String(v);
        };
        if (['approved', 'attempted'].includes(s.status)) {
            prefill('sa-pay-eci', s.eci); prefill('sa-pay-cryptogram', s.cryptogram);
            prefill('sa-pay-xid', s.xid); prefill('sa-pay-version', s.protocol_version);
        }
        prefill('sa-pay-amount', s.amount); prefill('sa-pay-currency', s.currency);
        syncRedirectButtons();
        renderNextStep(s);
        updatePayGate();
        refreshPreviews();
        syncWebhookFollow();
        scheduleSave();
    }

    async function createSession() {
        const body = buildSessionBody(false);
        if (!body) return;
        const sourceUsed = getCardSource(true);
        const env = await call('POST', 'sessions', { body, label: undefined });
        let summary = '';
        if (env.ok && env.data?.id) {
            applySession(env.data);
            state.sessionSource = sourceUsed;
            $('sa-pay-reference').value = '';
            summary = `<div class="sa-note"><strong>Session created.</strong> Status <code>${esc(env.data.status)}</code> — next: redirect the cardholder (Step 2). Live status below.</div>`;
            $('sa-3ds-create-hint').textContent = '';
            renderResponse('sa-3ds-session-res', { ...env, upstream: env.upstream }, sessionSummary(env.data));
            startPolling();
        } else if (env.data?.error_codes?.includes('card_not_enrolled')) {
            summary = `<div class="sa-note"><strong>card_not_enrolled</strong> — this card cannot be authenticated with 3DS. To continue, authorize via POST /payments with <code>3ds.enabled=false</code> (no liability shift), as documented.</div>`;
        } else if (env.upstream_status === 401 || env.upstream_status === 403) {
            summary = `<div class="sa-note"><strong>${env.upstream_status}</strong> — check auth mode and OAuth scopes (<code>sessions:browser</code>). ${esc(env.data?.detail ? JSON.stringify(env.data.detail) : '')}</div>`;
        }
        renderResponse('sa-3ds-create-res', env, summary);
        saveSnapshot();
    }

    async function getSession(sid, { logChange = false } = {}) {
        if (!sid) { showToast('Enter a session id (sid_…)', 'error'); return null; }
        const env = await call('GET', 'session', { query: { id: sid }, label: undefined });
        if (env.ok && env.data?.id) {
            applySession(env.data);
            renderResponse('sa-3ds-session-res', env, sessionSummary(env.data));
        } else {
            renderResponse('sa-3ds-session-res', env, '');
        }
        return env;
    }

    // Quiet polling — only status transitions reach the API log (via the visible call + a note).
    function startPolling() {
        stopPolling();
        state.pollStarted = Date.now();
        state.pollStatus = state.session?.status;
        const tick = async () => {
            if (!state.sid || Date.now() - state.pollStarted > 5 * 60 * 1000) { stopPolling('stopped after 5 minutes'); return; }
            try {
                const res = await fetch(`${API_BASE}/standalone/session?id=${encodeURIComponent(state.sid)}`, {
                    headers: { ...(val('sa-auth-mode') ? { 'x-auth-mode': val('sa-auth-mode') } : {}) },
                });
                const env = await res.json();
                const s = env?.data;
                if (s?.id) {
                    if (s.status !== state.pollStatus) {
                        state.pollStatus = s.status;
                        addToApiLog('GET', env.upstream || '/standalone/session', env.upstream_status, { id: state.sid }, { note: 'status changed', ...env });
                        applySession(s);
                        env.ok = true;
                        renderResponse('sa-3ds-session-res', env, sessionSummary(s));
                    }
                    $('sa-3ds-poll').textContent = `⏳ Polling session — status: ${s.status}`;
                    if (isFinalStatus(s.status)) stopPolling(`session reached final status “${s.status}”`);
                }
            } catch (e) { /* transient — try again next tick */ }
        };
        state.pollTimer = setInterval(tick, 3000);
        $('sa-3ds-poll').textContent = '⏳ Polling session…';
    }

    function stopPolling(reason) {
        clearInterval(state.pollTimer);
        state.pollTimer = null;
        if (reason && $('sa-3ds-poll')) $('sa-3ds-poll').textContent = `✓ Polling ${reason}`;
        syncRedirectButtons();
    }

    function redirectCardholder(newTab) {
        const href = state.redirectHref;
        if (!href) return showToast('This session response has no redirect link (_links.redirect_url) — create a new session', 'error');
        saveSnapshot();            // guarantee the latest form state is stored before leaving this page
        if (newTab) {
            const w = window.open(href, '_blank');
            if (!w) showToast('The browser blocked the new tab — use the “Hosted page” link under the buttons', 'error');
            else w.opener = null;
            return;
        }
        window.location.href = href;
    }

    async function authorizePayment() {
        const gate = payGate();
        if (gate.locked) { updatePayGate(); return showToast(gate.kind === 'used' ? 'This authentication already has a payment — start a new session' : 'Step 3 is locked — finish the 3DS redirect first', 'error'); }
        if (!state.sessionSource && !getCardSource(false)) return;
        const body = buildAuthorizeBody(false);
        const env = await callLegacy('POST', '/payments', { body, label: 'POST /payments (Suite — authorize with 3DS)' });
        const p = env.data?.payment || env.data;
        env.data = p;
        env.ok = !!p?.id && env.ok;
        if (p?.id) {
            state.lastPaymentId = p.id;
            show('sa-pay-details-btn', '');
            syncWebhookFollow();
            // The authentication is spent as soon as a payment exists — approved or declined.
            markConsumed(state.sid, { payment_id: p.id, approved: !!p.approved, status: p.status, response_code: p.response_code });
        }
        const threeDs = p?.['3ds'] || {};
        const summary = p ? kv([
            ['payment id', p.id], ['approved', p.approved, p.approved ? 'good' : 'bad'], ['status', p.status], ['response_code', p.response_code],
            ['response_summary', p.response_summary], ['3ds.authentication_response', threeDs.authentication_response], ['3ds.eci', threeDs.eci],
            ['3ds.version', threeDs.version], ['3ds.challenged', threeDs.challenged], ['3ds.exemption_applied', threeDs.exemption_applied],
            ['eci', p.eci], ['error_codes', p.error_codes],
        ]) : '';
        const notSpent = !p?.id ? `<div class="sa-note"><strong>No payment was created</strong> (the request was rejected before authorization), so this authentication is still available — fix the request and try again.</div>` : '';
        renderResponse('sa-pay-res', env, notSpent + summary);
        saveSnapshot();
        updatePayGate();
    }

    async function getPaymentDetails() {
        if (!state.lastPaymentId) return;
        const env = await callLegacy('GET', '/get-payment-details', { query: { paymentId: state.lastPaymentId }, label: 'GET /payments/{id} (Suite)' });
        const p = env.data;
        renderResponse('sa-pay-details-res', env, p?.id ? kv([
            ['status', p.status], ['approved', p.approved], ['3ds.authentication_response', p['3ds']?.authentication_response],
            ['3ds.challenged', p['3ds']?.challenged], ['3ds.exemption_applied', p['3ds']?.exemption_applied],
            ['balances.available_to_capture', p.balances?.available_to_capture], ['source.account_update_status', p.source?.account_update_status],
            ['processing.pan_type_processed', p.processing?.pan_type_processed],
        ]) : '');
        saveSnapshot();
    }

    // =====================================================================
    // Network Tokens
    // =====================================================================
    function ntList() { return lsGet(LS_NTS); }

    function upsertNt(entry) {
        const list = ntList();
        const idx = list.findIndex(n => n.id === entry.id);
        if (idx >= 0) list[idx] = { ...list[idx], ...entry }; else list.unshift(entry);
        lsSet(LS_NTS, list);
        renderNtSelect(entry.id);
    }

    function renderNtSelect(preferId) {
        const sel = $('sa-nt-select');
        if (!sel) return;
        const keep = preferId || sel.value;
        const list = ntList();
        sel.innerHTML = list.length
            ? list.map(n => `<option value="${esc(n.id)}">${esc(`${n.type || 'nt'} •••• ${String(n.number || '').slice(-4)} · ${n.state || ''} · ${n.id}`)}</option>`).join('')
            : '<option value="">— no network tokens saved —</option>';
        if (list.some(n => n.id === keep)) sel.value = keep;
        if (sel.value) $('sa-nt-id').value = sel.value;
        const sel2 = list.find(n => n.id === sel.value);
        if (sel2?.number && $('sa-meta-dpan')) $('sa-meta-dpan').value = sel2.number;
        syncWebhookFollow();
    }

    const currentNtId = () => val('sa-nt-id').trim();

    function ntSummary(res) {
        const t = res?.network_token;
        if (!t) return '';
        return kv([
            ['network_token.id', t.id], ['state', t.state, t.state === 'active' ? 'good' : 'warn'], ['type', t.type],
            ['DPAN (number)', t.number], ['expiry', t.expiry_month ? `${t.expiry_month}/${t.expiry_year}` : ''],
            ['payment_account_reference', t.payment_account_reference], ['token_requestor_id', res.token_requestor_id],
            ['card.last4', res.card?.last4], ['card.expiry', res.card?.expiry_month ? `${res.card.expiry_month}/${res.card.expiry_year}` : ''],
        ]);
    }

    function saveNtFromResponse(res, sourceId) {
        const t = res?.network_token;
        if (!t?.id) return;
        upsertNt({ id: t.id, number: t.number, expiry_month: t.expiry_month, expiry_year: t.expiry_year, type: t.type, state: t.state,
            last4: res.card?.last4, source_id: sourceId || undefined, created_at: new Date().toISOString() });
        $('sa-nt-id').value = t.id;
    }

    async function provisionNt() {
        const body = buildProvisionBody(false);
        if (typeof body.source === 'string') { getCardSource(false); return; }
        const src = getCardSource(true);
        const env = await call('POST', 'network-tokens', { body });
        if (env.ok) saveNtFromResponse(env.data, src?.type === 'instrument' ? src.id : undefined);
        const note = env.ok ? `<div class="sa-note">${env.upstream_status === 201 ? '201 — a new network token was provisioned.' : '200 — Checkout.com already had a network token for this payment method, so the existing one was returned.'}</div>` : '';
        renderResponse('sa-nt-provision-res', env, ntSummary(env.data) + note);
    }

    async function getNt() {
        const id = currentNtId();
        if (!id) return showToast('Select or enter a network token id', 'error');
        const env = await call('GET', 'network-token', { query: { id } });
        if (env.ok) saveNtFromResponse(env.data);
        renderResponse('sa-nt-manage-res', env, ntSummary(env.data));
    }

    async function requestCryptogram() {
        const id = currentNtId();
        if (!id) return showToast('Select or enter a network token id', 'error');
        const env = await call('POST', 'network-token-cryptogram', { query: { id }, body: { transaction_type: val('sa-nt-crypto-type') } });
        renderResponse('sa-nt-manage-res', env, env.ok ? kv([['cryptogram', env.data?.cryptogram], ['eci', env.data?.eci], ['transaction_type', val('sa-nt-crypto-type')]]) : '');
        return env;
    }

    async function deleteNt() {
        const id = currentNtId();
        if (!id) return showToast('Select or enter a network token id', 'error');
        if (!confirm(`Permanently delete ${id}? This cannot be undone.`)) return;
        const env = await call('POST', 'network-token-delete', { query: { id }, body: { initiated_by: val('sa-nt-del-by'), reason: val('sa-nt-del-reason') } });
        if (env.ok) { upsertNt({ id, state: 'deleted' }); showToast(`${id} deleted`); }
        renderResponse('sa-nt-manage-res', env, env.ok ? `<div class="sa-note">204 No Content — token deleted. Expect a <code>network_token_update</code> webhook.</div>` : '');
    }

    function forgetNt() {
        const id = currentNtId();
        lsSet(LS_NTS, ntList().filter(n => n.id !== id));
        $('sa-nt-id').value = '';
        renderNtSelect();
    }

    function paymentSummary(p, extraRows = []) {
        if (!p) return '';
        return kv([
            ['payment id', p.id], ['approved', p.approved, p.approved ? 'good' : 'bad'], ['status', p.status], ['response_code', p.response_code],
            ['response_summary', p.response_summary], ...extraRows, ['error_codes', p.error_codes],
        ]);
    }

    function trackPayment(p) {
        if (p?.id) { state.lastPaymentId = p.id; syncWebhookFollow(); }
    }

    async function payProvision() {
        const src = getCardSource(false);
        if (!src) return;
        const body = {
            source: paymentSource(src), amount: parseInt(val('sa-nt-pay-amount'), 10), currency: val('sa-nt-pay-currency'),
            capture: true, reference: `suite-nt-${Date.now().toString().slice(-8)}`, processing_channel_id: projectChannel(),
            processing: { provision_network_token: checked('sa-nt-pay-provision') },
        };
        const env = await callLegacy('POST', '/payments', { body, label: 'POST /payments (Suite — payment-time NT provisioning)' });
        const p = env.data?.payment || env.data;
        env.data = p; trackPayment(p);
        const pan = p?.processing?.pan_type_processed;
        renderResponse('sa-nt-pay-res', env, paymentSummary(p, [
            ['processing.pan_type_processed', pan], ['processing.cko_network_token_available', p?.processing?.cko_network_token_available, p?.processing?.cko_network_token_available ? 'good' : 'warn'],
        ]) + `<div class="sa-note">${pan === 'fpan' ? 'Processed with the full PAN — provisioning (if requested) happens asynchronously; pay again with the same card to see the token used.' : ''}</div>`);
    }

    async function payWithNt() {
        const id = currentNtId();
        if (!id) return showToast('Select or enter a network token id', 'error');
        let nt = ntList().find(n => n.id === id);
        if (!nt?.number) {                                  // typed-in id — fetch DPAN + expiry first
            const g = await call('GET', 'network-token', { query: { id } });
            if (!g.ok) { renderResponse('sa-nt-pay-res', g, ''); return; }
            saveNtFromResponse(g.data);
            nt = ntList().find(n => n.id === id);
        }
        const c = await call('POST', 'network-token-cryptogram', { query: { id }, body: { transaction_type: 'ecom' } });
        if (!c.ok) { renderResponse('sa-nt-pay-res', c, ''); return; }
        const body = {
            source: {
                type: 'network_token', token: String(nt.number), expiry_month: parseInt(nt.expiry_month, 10), expiry_year: parseInt(nt.expiry_year, 10),
                token_type: nt.type === 'mdes' ? 'mdes' : 'vts', cryptogram: c.data.cryptogram, eci: String(c.data.eci).padStart(2, '0'),
            },
            amount: parseInt(val('sa-nt-pay-amount'), 10), currency: val('sa-nt-pay-currency'), capture: true,
            reference: `suite-nt-${Date.now().toString().slice(-8)}`, processing_channel_id: projectChannel(),
        };
        const env = await callLegacy('POST', '/payments', { body, label: 'POST /payments (Suite — pay with network token)' });
        const p = env.data?.payment || env.data;
        env.data = p; trackPayment(p);
        renderResponse('sa-nt-pay-res', env, paymentSummary(p, [['source.type', 'network_token'], ['eci', p?.eci], ['scheme_id', p?.scheme_id]]));
    }

    // =====================================================================
    // Account Updater + RTAU
    // =====================================================================
    const AU_STATUS_TEXT = {
        CARD_UPDATED: 'The card number was updated.', card_updated: 'The card number was updated.',
        CARD_EXPIRY_UPDATED: 'The card expiry date was updated.', card_expiry_updated: 'The card expiry date was updated.',
        CARD_CLOSED: 'The issuer closed the account and opened no new one — contact the cardholder for a new card.', card_closed: 'The issuer closed the account and opened no new one — contact the cardholder for a new card.',
        contact_cardholder: 'Card details changed but the cardholder opted out via the issuer — contact the cardholder.',
        update_failed: 'The card update failed — see the failure code.', UPDATE_FAILED: 'The card update failed — see the failure code.',
    };
    const AU_FAIL_TEXT = {
        CARDHOLDER_OPT_OUT: 'The cardholder opted out of the service.',
        UP_TO_DATE: 'No changes to the PAN or expiry date.',
        NON_PARTICIPATING_BIN: 'The bank is not participating in the service.',
        UNKNOWN: 'No match for the account number was found.',
    };

    async function requestCardUpdate() {
        if (!getCardSource(false)) return;
        const body = buildAuBody();
        const env = await call('POST', 'account-updater', { body });
        const d = env.data || {};
        const status = d.update_status || d.account_update_status;
        const fail = d.account_update_failure_code;
        const gate = (env.upstream_status === 401 || env.upstream_status === 403) ? `<div class="sa-note"><strong>${env.upstream_status}</strong> — usually missing <code>vault:real-time-account-updater</code> scope, or the feature isn't enabled on this account.</div>` : '';
        renderResponse('sa-au-res', env, env.ok ? kv([
            ['update_status', status, /CLOSED|FAILED/i.test(status || '') ? 'bad' : 'good'], ['meaning', AU_STATUS_TEXT[status]],
            ['failure code', fail], ['failure meaning', AU_FAIL_TEXT[fail]],
            ['card.bin', d.card?.bin], ['card.last4', d.card?.last4], ['card.expiry', d.card?.expiry_month ? `${d.card.expiry_month}/${d.card.expiry_year}` : ''],
            ['card.fingerprint', d.card?.fingerprint], ['card.encrypted_card_number', d.card?.encrypted_card_number ? '(present — SAQ D merchants)' : ''],
        ]) : gate);
    }

    async function requestRtauPayment() {
        if (!getCardSource(false)) return;
        const body = buildRtauBody();
        const env = await callLegacy('POST', '/payments', { body, label: 'POST /payments (Suite — RTAU trigger)' });
        const p = env.data?.payment || env.data;
        env.data = p; trackPayment(p);
        const st = p?.source?.account_update_status;
        renderResponse('sa-rt-res', env, paymentSummary(p, [
            ['source.account_update_status', st, /closed|failed/i.test(st || '') ? 'bad' : st ? 'good' : ''], ['meaning', AU_STATUS_TEXT[st]],
            ['source.account_update_failure_code', p?.source?.account_update_failure_code],
            ['updated bin / last4', p?.source?.bin ? `${p.source.bin} / ${p.source.last4 || ''}` : ''],
            ['updated expiry', p?.source?.expiry_month ? `${p.source.expiry_month}/${p.source.expiry_year}` : ''],
        ]) + (st ? '' : `<div class="sa-note">No <code>account_update_status</code> on this payment — RTAU only triggers on eligible MIT / card-on-file payments with RTAU enabled for your account. Watch the <code>card_updated</code> webhook below too.</div>`));
    }

    // =====================================================================
    // Card Metadata
    // =====================================================================
    const ELIG_COLOUR = { fast_funds: 'var(--success)', standard: '#f59e0b', not_supported: 'var(--error)', unknown: 'var(--text-secondary)' };

    async function getMetadata() {
        const t = val('sa-meta-source');
        if (t === 'shared' && !getCardSource(false)) return;
        const body = buildMetaBody();
        const env = await callLegacy('POST', '/card-metadata', { body, label: 'POST /metadata/card (Suite)' });
        const d = env.data || {};
        let summary = '';
        if (env.ok && d.scheme) {
            const po = d.card_payouts;
            let grid = '';
            if (po) {
                const known = body.source?.type === 'card' ? SUITE_METADATA_CARDS.find(c => c.number === body.source.number) : null;
                const rows = [
                    ['Non-money transfer', 'domestic_non_money_transfer', 'cross_border_non_money_transfer', known?.nmt],
                    ['Money transfer', 'domestic_money_transfer', 'cross_border_money_transfer', known?.mt],
                    ['Gambling', 'domestic_gambling', 'cross_border_gambling', known?.gam],
                ];
                const cell = (v, exp) => `<div style="color:${ELIG_COLOUR[v] || 'inherit'}; font-weight:700;">${esc(v || '—')}${exp ? (exp === v ? ' ✓' : ` ✗ (docs: ${esc(exp)})`) : ''}</div>`;
                grid = `<div class="sa-elig"><div class="h">Payout type</div><div class="h">Domestic</div><div class="h">Cross-border</div>` +
                    rows.map(([label, dk, xk, exp]) => `<div>${label}</div>${cell(po[dk], exp?.[0])}${cell(po[xk], exp?.[1])}`).join('') + `</div>` +
                    (known ? `<div class="sa-note">✓/✗ compares each value with CKO's documented expectation for test card ••${known.number.slice(-4)}.</div>` : '');
            }
            summary = kv([
                ['scheme', d.scheme], ['scheme_local', d.scheme_local], ['card_type', d.card_type], ['card_category', d.card_category],
                ['issuer', d.issuer], ['issuer_country', d.issuer_country ? `${d.issuer_country} (${d.issuer_country_name || ''})` : ''],
                ['product', d.product_type ? `${d.product_type} (${d.product_id || ''})` : ''], ['currency', d.currency], ['bin', d.bin],
            ]) + grid;
        }
        renderResponse('sa-meta-res', env, summary);
    }

    // =====================================================================
    // Live webhooks
    // =====================================================================
    function whTypes() {
        return Array.from(document.querySelectorAll('#sa-wh-filters .sa-pill.active')).map(p => p.dataset.saWhf).join(',');
    }

    function followIds() {
        const ids = [];
        if (state.product === '3ds' && state.sid) ids.push(state.sid);
        if (state.product === 'nt' && currentNtId()) ids.push(currentNtId());
        if (state.product === 'au') { const i = selectedInstrument(); if (i) ids.push(i.id); }
        if (state.lastPaymentId) ids.push(state.lastPaymentId);
        return ids;
    }

    function syncWebhookFollow() {
        if (!checked('sa-wh-follow')) return;
        const next = followIds().join(',');
        if (next !== val('sa-wh-match')) { $('sa-wh-match').value = next; resetWebhookView(); }
    }

    function resetWebhookView() {
        state.whSeq = 0; state.whReplay = true; state.whEvents = [];
        renderWebhooks();
    }

    function whSummary(e) {
        const d = e.data || {};
        if (e.type === 'card_updated') return `${d.reason_type || ''}: ••${d.original_card?.last4 || '?'} (${d.original_card?.expiry_month}/${d.original_card?.expiry_year}) → ••${d.replacement_card?.last4 || '?'} (${d.replacement_card?.expiry_month}/${d.replacement_card?.expiry_year})`;
        if (e.type === 'network_token_update') return `${d.network_token?.id || ''} · state: ${d.network_token?.state || ''} · ${d.scheme || ''}`;
        if (e.type.startsWith('authentication_')) return [d.session_id || d.id, d.eci ? `eci ${d.eci}` : '', d.challenged !== undefined ? `challenged: ${d.challenged}` : ''].filter(Boolean).join(' · ');
        return [d.id, d.response_summary || d.status].filter(Boolean).join(' · ');
    }

    function renderWebhooks() {
        const box = $('sa-wh-list');
        if (!box) return;
        box.innerHTML = state.whEvents.length
            ? state.whEvents.slice(0, 50).map(e => `<details class="sa-wh-item"><summary><span class="sa-wh-type">${esc(e.type)}</span>
                <span class="sa-wh-time">${esc(new Date(e.received_at).toLocaleTimeString())}</span><span class="sa-wh-sum">${esc(whSummary(e))}</span></summary>
                <pre class="sa-preview" style="padding:0 12px 10px;">${esc(jsonOf({ event_id: e.event_id, created_on: e.created_on, type: e.type, data: e.data }))}</pre></details>`).join('')
            : '<div class="sa-note">No events yet — they appear here within seconds of CKO delivering them.</div>';
    }

    async function pollWebhooks() {
        const wh = $('sa-webhooks');
        const live = tabActive() && !state.whPaused && state.product && state.product !== 'meta' && wh && wh.style.display !== 'none';
        $('sa-wh-dot')?.classList.toggle('live', !!live);
        $('sa-wh-state').textContent = state.whPaused ? 'paused' : live ? 'listening' : 'idle';
        if (!live) return;
        try {
            const q = new URLSearchParams({ since: String(state.whSeq) });
            if (whTypes()) q.set('types', whTypes());
            if (val('sa-wh-match').trim()) q.set('match', val('sa-wh-match').trim());
            const res = await fetch(`${API_BASE}/standalone/webhook-events?${q}`);
            if (!res.ok) return;
            const { events, last_seq } = await res.json();
            const replay = state.whReplay;
            events.forEach(e => {
                state.whEvents.unshift(e);
                if (!replay) addToApiLog('WEBHOOK', `${e.type} — /webhook`, 200, {}, e.data);   // only genuinely new arrivals reach the sidebar
            });
            state.whSeq = Math.max(state.whSeq, last_seq || 0);
            state.whReplay = false;
            if (events.length) { renderWebhooks(); if (state.sid) scheduleSave(); }
        } catch (e) { /* transient */ }
    }

    // =====================================================================
    // Auth banner
    // =====================================================================
    async function checkConfig() {
        const b = $('sa-auth-banner');
        try {
            const res = await fetch(`${API_BASE}/standalone/config`);
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const cfg = await res.json();
            if (!cfg.oauthConfigured) {
                b.className = 'sa-banner warn'; b.style.display = 'flex';
                b.innerHTML = '⚠️ <span><strong>OAuth credentials missing on the backend.</strong> Standalone 3DS (Sessions) will fail until <code>CKO_ACCESS_KEY_ID</code>, <code>CKO_ACCESS_KEY_SECRET</code> and <code>CKO_ACCESS_URL</code> are set on the Lambda. Network tokens, instruments and the Account Updater work with the secret key.</span>';
            } else {
                b.style.display = 'none';
            }
        } catch (e) {
            b.className = 'sa-banner error'; b.style.display = 'flex';
            b.innerHTML = `❌ <span><strong>Standalone routes not reachable</strong> (${esc(e.message)}). Deploy the Lambda zip and add the <code>/standalone/*</code> routes in API Gateway.</span>`;
        }
    }

    // =====================================================================
    // Product selection
    // =====================================================================
    const WH_DEFAULTS = {
        '3ds': ['authentication_*', 'payment_*'], nt: ['network_token_update', 'payment_*'],
        au: ['card_updated', 'payment_*'], meta: [],
    };

    function selectProduct(p) {
        state.product = p;
        document.querySelectorAll('[data-sa-product]').forEach(o => o.classList.toggle('active', o.dataset.saProduct === p));
        show('sa-card-source');
        ['3ds', 'nt', 'au', 'meta'].forEach(x => (x === p ? show : hide)(`sa-panel-${x}`));
        (p === 'meta' ? hide : show)('sa-webhooks');
        document.querySelectorAll('#sa-wh-filters .sa-pill').forEach(pill => pill.classList.toggle('active', WH_DEFAULTS[p].includes(pill.dataset.saWhf)));
        if (p === 'nt') renderNtSelect();
        if (p === 'meta') { hide('sa-wh-list'); } else { show('sa-wh-list'); }
        setMode(state.mode);
        renderTestCards();
        syncWebhookFollow();
        resetWebhookView();
        refreshPreviews();
    }

    function populateSelect(id, items, valueOf, textOf, selected) {
        const sel = $(id);
        if (!sel) return;
        items.forEach(item => {
            const o = document.createElement('option');
            o.value = valueOf(item); o.text = textOf(item);
            if (o.value === selected) o.selected = true;
            sel.appendChild(o);
        });
    }

    // ----- 3DS return from the hosted page -----
    // The hosted flow sends the browser back to index.html?suite=3ds&outcome=…&cko-session-id=sid_…
    // (there are no routes in this app, so everything is rebuilt from the snapshot saved before leaving).
    const channel = ('BroadcastChannel' in window) ? new BroadcastChannel('cko-suite') : null;

    function isFinalStatus(status) { return FINAL_STATUSES.includes(status); }

    async function refreshSessionAndMaybePoll(sid) {
        const env = await getSession(sid);
        if (env?.ok) {
            if (isFinalStatus(env.data?.status)) stopPolling(`session reached final status “${env.data.status}”`); else startPolling();
        }
        saveSnapshot();
        return env;
    }

    function handleReturn() {
        const params = new URLSearchParams(window.location.search);
        if (params.get('suite') !== '3ds') return;
        const outcome = params.get('outcome') || 'result';
        const sid = params.get('cko-session-id') || params.get('sid') || localStorage.getItem(LS_LAST_SID);

        const btn = Array.from(document.querySelectorAll('.tab-link')).find(b => (b.getAttribute('onclick') || '').includes('standalone-tab'));
        if (btn) btn.click();
        selectProduct('3ds');

        const snap = sid ? readSnaps()[sid] : null;
        if (snap) restoreSnapshot(snap);
        if (sid) {
            state.sid = sid;
            $('sa-3ds-sid').value = sid;
            runBusy(['sa-3ds-get-btn'], 'Loading…', async () => {
                const env = await refreshSessionAndMaybePoll(sid);
                const status = env?.data?.status;
                showToast(snap
                    ? `Back from hosted 3DS (${outcome}) — your session and form were restored. Status: ${status || 'unknown'}`
                    : `Back from hosted 3DS (${outcome}) — session ${sid} loaded (no saved form state found). Status: ${status || 'unknown'}`);
                channel?.postMessage({ type: '3ds-returned', sid, outcome });
                $('sa-3ds-session-res')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            });
        }
        history.replaceState({}, '', window.location.pathname);
    }

    // The tab that started the session (when "Open in new tab" was used) refreshes the moment the other
    // tab reports the return — no need to wait for the next 3-second poll.
    if (channel) {
        channel.addEventListener('message', (ev) => {
            const m = ev.data;
            if (m?.type !== '3ds-returned' || !state.sid || m.sid !== state.sid) return;
            runBusy(['sa-3ds-get-btn'], 'Refreshing…', async () => {
                const env = await refreshSessionAndMaybePoll(state.sid);
                showToast(`3DS finished in another tab (${m.outcome}) — status: ${env?.data?.status || 'unknown'}`);
            });
        });
    }

    // =====================================================================
    // Init
    // =====================================================================
    function init() {
        if (!$('sa-card-source')) return;     // tab HTML not present

        // Dropdowns
        const cur = (CURRENCIES || []).map(c => c.iso4217);
        ['sa-3ds-currency', 'sa-pay-currency', 'sa-nt-pay-currency', 'sa-rt-currency'].forEach(id =>
            populateSelect(id, cur, c => c, c => c, 'GBP'));
        ['sa-3ds-bill-country', 'sa-3ds-ship-country'].forEach(id =>
            populateSelect(id, COUNTRIES || [], c => c.alpha2Code, c => c.name, 'GB'));

        // Hosted completion URLs → back to this app, same tab (script.js reads ?suite=3ds on load)
        const base = window.location.origin + window.location.pathname.replace(/[^/]*$/, '') + 'index.html';
        $('sa-3ds-success-url').value = `${base}?suite=3ds&outcome=success`;
        $('sa-3ds-failure-url').value = `${base}?suite=3ds&outcome=failure`;

        // Product selector
        document.querySelectorAll('[data-sa-product]').forEach(o => o.addEventListener('click', () => selectProduct(o.dataset.saProduct)));

        // Card source
        document.querySelectorAll('#sa-mode-pills .sa-pill').forEach(p => p.addEventListener('click', () => setMode(p.dataset.saMode)));
        $('sa-instrument-select').addEventListener('change', () => { renderInstrumentDetail(); updateActiveSource(); refreshPreviews(); syncWebhookFollow(); });
        ['sa-cust-email', 'sa-cust-id'].forEach(id => $(id).addEventListener('input', () => { if (state.mode === 'saved') { renderInstrumentSelect(); updateActiveSource(); } }));
        $('sa-show-all').addEventListener('change', () => renderInstrumentSelect());
        $('sa-instrument-add-btn').addEventListener('click', () => {
            const id = val('sa-instrument-manual').trim();
            if (!/^src_\w+/.test(id)) return showToast('Enter a valid src_… instrument id', 'error');
            const c = currentCustomer();
            upsertInstrument({ id, email: c.email, customer_id: c.customer_id, created_at: new Date().toISOString(), manual: true });
            $('sa-instrument-manual').value = '';
            renderInstrumentSelect(id); updateActiveSource(); refreshPreviews();
        });
        $('sa-instrument-remove-btn').addEventListener('click', () => {
            lsSet(LS_INSTRUMENTS, lsGet(LS_INSTRUMENTS).filter(i => i.id !== val('sa-instrument-select')));
            renderInstrumentSelect(); updateActiveSource(); refreshPreviews();
        });
        $('sa-instrument-clear-btn').addEventListener('click', () => {
            if (!confirm('Remove ALL saved instruments from this browser? (They are not deleted at Checkout.com.)')) return;
            lsSet(LS_INSTRUMENTS, []); renderInstrumentSelect(); updateActiveSource(); refreshPreviews();
        });
        $('sa-tokenize-btn').addEventListener('click', () => runBusy(['sa-tokenize-btn'], 'Tokenizing…', tokenizeAndSave));

        // Delegated: test cards, copy buttons, filters
        $('standalone-tab').addEventListener('click', (ev) => {
            const t = ev.target.closest('[data-sa-pan], [data-sa-more], [data-sa-copy], [data-sa-copyres], [data-sa-jump], [data-sa-newsession]');
            if (!t) return;
            if (t.dataset.saNewsession) { ev.preventDefault(); resetSessionState(); $('sa-3ds-create-btn')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
            if (t.dataset.saJump) { ev.preventDefault(); $(t.dataset.saJump)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
            if (t.dataset.saPan) return useTestCard(t.dataset.saPan, t.dataset.saScheme);
            if (t.dataset.saMore) {
                const rest = document.querySelector(`[data-sa-rest="${t.dataset.saMore}"]`);
                if (rest) { const open = rest.style.display === 'none'; rest.style.display = open ? '' : 'none'; t.textContent = open ? 'hide' : t.dataset.saLabel; }
                return;
            }
            const text = t.dataset.saCopy ? $(t.dataset.saCopy)?.textContent : state.resText[t.dataset.saCopyres];
            if (text) navigator.clipboard.writeText(text).then(() => showToast('Copied'));
        });
        // Re-render previews on any edit inside the tab
        let previewTimer;
        $('standalone-tab').addEventListener('input', () => { clearTimeout(previewTimer); previewTimer = setTimeout(() => { updateActiveSource(); refreshPreviews(); }, 120); if (state.sid) scheduleSave(); });
        $('standalone-tab').addEventListener('change', () => { updateActiveSource(); refreshPreviews(); if (state.sid) scheduleSave(); });

        // 3DS
        $('sa-3ds-auth-type').addEventListener('change', syncDependentUi);
        $('sa-3ds-ship-matches').addEventListener('change', syncDependentUi);
        syncDependentUi();
        $('sa-3ds-reset-btn').addEventListener('click', () => { if (!state.sid || confirm('Clear the current 3DS session, results and snapshot? (Saved cards and network tokens are kept.)')) resetSessionState(); });
        $('sa-3ds-create-btn').addEventListener('click', () => runBusy(['sa-3ds-create-btn'], 'Creating session…', createSession));
        $('sa-3ds-get-btn').addEventListener('click', () => runBusy(['sa-3ds-get-btn'], 'Fetching…', async () => {
            const env = await getSession(val('sa-3ds-sid').trim());
            if (env?.ok && !isFinalStatus(env.data?.status)) startPolling();
        }));
        $('sa-3ds-redirect-btn').addEventListener('click', () => redirectCardholder(false));
        $('sa-3ds-newtab-btn').addEventListener('click', () => redirectCardholder(true));
        document.querySelectorAll('#sa-3ds-auth-mode-pills .sa-pill').forEach(p => p.addEventListener('click', () => {
            state.payAuth = p.dataset.saAuth;
            syncDependentUi();
            refreshPreviews();
            if (state.sid) scheduleSave();
        }));
        $('sa-pay-btn').addEventListener('click', () => runBusy(['sa-pay-btn'], 'Authorizing…', authorizePayment));
        $('sa-pay-details-btn').addEventListener('click', () => runBusy(['sa-pay-details-btn'], 'Fetching…', getPaymentDetails));

        // Network tokens
        $('sa-nt-provision-btn').addEventListener('click', () => runBusy(['sa-nt-provision-btn'], 'Provisioning…', provisionNt));
        $('sa-nt-select').addEventListener('change', () => { $('sa-nt-id').value = val('sa-nt-select'); renderNtSelect(val('sa-nt-select')); });
        $('sa-nt-get-btn').addEventListener('click', () => runBusy(['sa-nt-get-btn', 'sa-nt-crypto-btn', 'sa-nt-delete-btn'], 'Fetching…', getNt));
        $('sa-nt-crypto-btn').addEventListener('click', () => runBusy(['sa-nt-crypto-btn', 'sa-nt-get-btn', 'sa-nt-delete-btn'], 'Requesting…', requestCryptogram));
        $('sa-nt-delete-btn').addEventListener('click', () => runBusy(['sa-nt-delete-btn', 'sa-nt-get-btn', 'sa-nt-crypto-btn'], 'Deleting…', deleteNt));
        $('sa-nt-forget-btn').addEventListener('click', forgetNt);
        $('sa-nt-id').addEventListener('change', syncWebhookFollow);
        $('sa-nt-pay-provision-btn').addEventListener('click', () => runBusy(['sa-nt-pay-provision-btn', 'sa-nt-pay-token-btn'], 'Paying…', payProvision));
        $('sa-nt-pay-token-btn').addEventListener('click', () => runBusy(['sa-nt-pay-token-btn', 'sa-nt-pay-provision-btn'], 'Paying with token…', payWithNt));

        // Account updater / RTAU
        $('sa-au-btn').addEventListener('click', () => runBusy(['sa-au-btn'], 'Requesting update…', requestCardUpdate));
        $('sa-rt-btn').addEventListener('click', () => runBusy(['sa-rt-btn'], 'Processing payment…', requestRtauPayment));

        // Metadata
        $('sa-meta-source').addEventListener('change', () => { syncDependentUi(); refreshPreviews(); });
        $('sa-meta-btn').addEventListener('click', () => runBusy(['sa-meta-btn'], 'Looking up…', getMetadata));

        // Another tab may have spent this authentication — keep the gate truthful
        window.addEventListener('storage', (e) => { if (e.key === LS_CONSUMED) updatePayGate(); });

        // Webhooks
        document.querySelectorAll('#sa-wh-filters .sa-pill').forEach(p => p.addEventListener('click', () => { p.classList.toggle('active'); resetWebhookView(); }));
        $('sa-wh-match').addEventListener('change', () => { $('sa-wh-follow').checked = false; resetWebhookView(); });
        $('sa-wh-follow').addEventListener('change', () => { if (checked('sa-wh-follow')) syncWebhookFollow(); });
        $('sa-wh-toggle').addEventListener('click', () => {
            state.whPaused = !state.whPaused;
            $('sa-wh-toggle').textContent = state.whPaused ? 'Resume' : 'Pause';
            pollWebhooks();
        });
        $('sa-wh-clear').addEventListener('click', () => { state.whEvents = []; renderWebhooks(); });
        state.whTimer = setInterval(pollWebhooks, 3000);

        // Theme change → remount Flow card field with the new appearance
        document.addEventListener('themechange', () => { if (state.mode === 'new' && !state.flowMounting) { state.flowNeedsMount = true; mountFlowCard(); } });

        renderInstrumentSelect();
        renderNtSelect();
        renderWebhooks();
        setMode('saved');
        updatePayGate();
        checkConfig();

        // script.js clicks the first tab on DOMContentLoaded — handle the 3DS return after that.
        window.addEventListener('load', handleReturn);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
