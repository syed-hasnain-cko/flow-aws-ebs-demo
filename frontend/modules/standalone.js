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
    const CKO_BASE = 'https://api.sandbox.checkout.com';           // best-effort base for calls made through this app's existing routes
    const CKO_PATH = { '/card-metadata': '/metadata/card' };       // our route name → the Checkout.com path it proxies to

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
    const SS_NTC       = 'cko-suite-ntc-results';       // Network Token scenario results + ids the webhook panel follows
    const SS_RTAU      = 'cko-suite-rtau-results';     // RTAU case-runner results + the ids the webhook panel should follow
    const SS_WH_SEEN   = 'cko-suite-wh-seen';          // webhook events already shown + logged in THIS tab (same lifetime as the API log)
    // Step 3 may only open for a status that is explicitly terminal. Anything else — pending, processing,
    // challenged, or a status this tester has never seen — counts as "authentication not finished".
    const FINAL_STATUSES = ['approved', 'attempted', 'declined', 'rejected', 'unavailable', 'challenge_abandoned', 'expired'];

    // What each challenge_indicator value means. Sandbox remarks come from real runs against the sandbox Sessions API
    // (non_hosted + channel_data): every value is echoed as exemption.requested, but the simulator only APPLIES one.
    const CHALLENGE_INFO = {
        no_preference: 'No preference — the issuer decides whether to challenge.',
        no_challenge_requested: 'You ask for no challenge. The issuer still has the final say.',
        challenge_requested: 'You prefer a challenge. Frictionless test cards still approve silently in the sandbox.',
        challenge_requested_mandate: 'A challenge is mandated by local rules (for example saving a card, or starting a subscription).',
        low_value: 'SCA exemption — payments under €30. The issuer may still demand SCA (5th use since the last SCA, or €100 spent cumulatively). Sandbox: echoed as exemption.requested, normally not applied.',
        transaction_risk_assessment: 'SCA exemption — TRA, up to €250 for UK / EU domestic acquiring, and your PSP must meet fraud-rate thresholds. Sandbox: echoed, normally not applied.',
        trusted_listing: 'SCA exemption — the cardholder previously added you to their trusted merchant list (Amex handles this itself). Sandbox: APPLIED for Visa 4556085951507152 — use the “Exemption applied” preset.',
        trusted_listing_prompt: 'Asks the issuer to offer the cardholder the chance to add you to their trusted list — used on the first payment, then trusted_listing afterwards.',
        secure_corporate_payment: 'SCA exemption — secure corporate payments (virtual / lodged cards). Accepted by the API; not applied for the test cards.',
        data_share: 'Data Sharing — frictionless authentication for transactions outside SCA scope. Needs enablement; on a challenge test card the sandbox answered “unavailable”.',
    };

    // One-click setups for the frictionless / exemption scenarios. Each loads a raw test card + the form values.
    const SESSION_PRESETS = [
        { id: 'classic', label: 'Classic redirect (HTTP 202)', pan: '4485040371536584', amount: 100, indicator: 'no_preference', redirectless: false,
          hint: 'Baseline: 202 pending + a redirect link — the hosted page collects the browser data.' },
        { id: 'redirectless', label: 'Redirectless frictionless (HTTP 201)', pan: '4485040371536584', amount: 100, indicator: 'no_preference', redirectless: true,
          hint: 'channel_data is sent, so a frictionless card returns 201 approved immediately — no redirect, eci + cryptogram included. Step 3 unlocks straight away.' },
        { id: 'tl-applied', label: 'Exemption applied (trusted_listing)', pan: '4556085951507152', amount: 5000, indicator: 'trusted_listing', redirectless: true,
          hint: 'The one combination the sandbox applies: exemption.requested = applied = trusted_listing, frictionless, no redirect. No liability shift.' },
        { id: 'lv-challenge', label: 'low_value requested → challenge anyway', pan: '4243754271700719', amount: 2000, indicator: 'low_value', redirectless: true,
          hint: '201 challenged — the issuer does not apply the exemption for this card (requested ≠ applied), so the challenge still happens.' },
        { id: 'tra-challenge', label: 'TRA requested → challenge anyway', pan: '4243754271700719', amount: 10000, indicator: 'transaction_risk_assessment', redirectless: true,
          hint: '201 challenged — TRA is requested but not applied for this card; redirect the cardholder to finish the challenge.' },
        { id: 'challenge-rl', label: 'Challenge card + channel_data', pan: '4243754271700719', amount: 100, indicator: 'no_preference', redirectless: true,
          hint: '201 challenged: nothing to collect, but a challenge is still required — hosted sessions return a redirect link for it.' },
    ];
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
        ntcGroup: 'prov', ntcResults: {}, ntcEnv: {}, ntcRunning: null, ntcBatch: false, ntcActive: null, ntIds: [],
        rtauGroup: 'visa', rtauResults: {}, rtauEnv: {}, rtauIds: [], rtauRunning: null, rtauBatch: false, rtauActive: null,
        whTimer: null, whPaused: false, whAll: new Map(), whSeen: new Set(), whBaselined: false,
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
        logCko(method, env, body, label);
        return env;
    }

    // API log = what a merchant's integration sends to / receives from Checkout.com, nothing else: the CKO request
    // body, the CKO response body, the upstream status and the full CKO URL. Our own envelope fields (auth_mode,
    // cko_request_id, upstream_status wrapper) and calls that never reached CKO (gateway / network failures,
    // already surfaced as toasts) are not logged.
    function splitUpstream(upstream) {
        const m = String(upstream || '').match(/^([A-Z]+)\s+(https?:\/\/\S+)$/);
        return m ? { method: m[1], url: m[2] } : null;
    }
    function logCko(method, env, body, label) {
        const up = splitUpstream(env.upstream);
        if (!up) return;
        const path = up.url.replace(/^https?:\/\/[^/]+/, '');
        addToApiLog(method, label || path, env.upstream_status, body ?? {}, env.data ?? null, up.url);
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
        const ckoPath = path === '/get-payment-details' ? `/payments/${query?.paymentId ?? '{id}'}` : (CKO_PATH[path] || path);
        addToApiLog(method, label || path, status, body ?? {}, data, `${CKO_BASE}${ckoPath}`);
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
            html += `<div class="sa-tc-group"><div>${SUITE_NT_CARDS.map(c => chip(c.number, c.scheme, ` <small><code>${esc(c.number)}</code> — ${esc(c.note)}</small>`)).join('<br>')}</div>
                <div class="sa-tc-sum" style="margin-top:8px;">Tip: provision with a saved instrument to test the “card stored with Checkout.com” path (<code>source.type = id</code>); use a raw card for the “merchant-stored card” path.</div></div>`;
        } else if (p === 'meta') {
            const rowTxt = (c) => {
                const f = (a) => a.join(' / ');
                return `non-money-transfer ${f(c.nmt)} · money-transfer ${f(c.mt)} · gambling ${f(c.gam)}`;
            };
            html += `<div class="sa-tc-group"><div class="sa-tc-sum">Values are <em>domestic / cross-border</em>. Click a card to load it (use format <code>card_payouts</code>); the result is checked against these expectations.</div>
                ${SUITE_METADATA_CARDS.map(c => `<div style="margin:4px 0;">${chip(c.number, c.scheme)} <span class="sa-note">${esc(rowTxt(c))}</span></div>`).join('')}</div>`;
        } else if (p === 'au') {
            html += RTAU_GROUPS.map(g => `<div class="sa-tc-group"><div class="sa-tc-head"><span class="sa-tc-title">${esc(g.title)}</span><span class="sa-tc-tag">${g.cases.filter(c => !c.extra).length} doc cases · see section C</span></div>
                <div class="sa-tc-sum">${esc(g.id === 'visa' ? 'One card; the amount (and for two cases the expiry) selects the outcome. Pay with a Source ID, merchant_initiated = true.'
                    : g.id === 'mc-ur' ? 'Two cards: …73 updates the card number, …65 updates the expiry. The amount selects the decline.'
                    : 'The trailing digit(s) of the number pick the case — every number below is Luhn-valid.')}</div>
                <div>${g.cards.map(c => chip(c.number, c.scheme, ` <small><code>${esc(c.number)}</code> — ${esc(c.note)}</small>`)).join('<br>')}</div></div>`).join('')
                + `<div class="sa-tc-sum">Click a card to load it into the raw card form, then <strong>Save this card as an instrument</strong> to pay with its Source ID — or just use the case runner in section C, which does both for you.</div>`;
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

    // ----- Redirectless frictionless: browser data (channel_data) -----
    function detectBrowserData() {
        const set = (id, v) => { const e = $(id); if (e) e.value = v; };
        set('sa-cd-ua', navigator.userAgent || '');
        set('sa-cd-accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8');
        set('sa-cd-language', navigator.language || 'en-GB');
        set('sa-cd-timezone', String(new Date().getTimezoneOffset()));
        set('sa-cd-color', String(screen.colorDepth || 24));
        set('sa-cd-width', String(screen.width || 1920));
        set('sa-cd-height', String(screen.height || 1080));
        set('sa-cd-java', String(!!(navigator.javaEnabled && navigator.javaEnabled())));
        set('sa-cd-js', 'true');
        set('sa-cd-iframe', 'true');
        const brands = navigator.userAgentData?.brands;
        set('sa-cd-hint', brands ? 'Sec-CH-UA: ' + brands.map(b => `"${b.brand}";v="${b.version}"`).join(', ') : '');
    }

    function channelDataFromForm() {
        const cd = {
            channel: 'browser',
            accept_header: val('sa-cd-accept'), java_enabled: val('sa-cd-java') === 'true', javascript_enabled: val('sa-cd-js') === 'true',
            language: val('sa-cd-language'), color_depth: val('sa-cd-color'), screen_height: val('sa-cd-height'), screen_width: val('sa-cd-width'),
            timezone: val('sa-cd-timezone'), user_agent: val('sa-cd-ua'), ip_address: val('sa-cd-ip'),
            three_ds_method_completion: val('sa-cd-method'), iframe_payment_allowed: val('sa-cd-iframe') === 'true',
        };
        if (val('sa-cd-hint')) cd.user_agent_client_hint = val('sa-cd-hint');
        return cd;
    }

    function renderChallengeHelp() {
        const e = $('sa-3ds-challenge-help');
        if (e) e.textContent = CHALLENGE_INFO[val('sa-3ds-challenge')] || '';
    }

    function renderPresets() {
        const box = $('sa-3ds-presets');
        if (!box) return;
        box.innerHTML = SESSION_PRESETS.map(p => `<span class="sa-chip" data-sa-preset="${esc(p.id)}" title="${esc(p.hint)}">${esc(p.label)}</span>`).join('');
    }

    function applyPreset(id) {
        const p = SESSION_PRESETS.find(x => x.id === id);
        if (!p) return;
        setMode('raw');
        $('sa-raw-number').value = p.pan; $('sa-raw-month').value = '12'; $('sa-raw-year').value = '2030'; $('sa-raw-cvv').value = '100';
        $('sa-3ds-amount').value = p.amount;
        $('sa-3ds-challenge').value = p.indicator;
        $('sa-3ds-redirectless').checked = p.redirectless;
        $('sa-3ds-completion-type').value = 'hosted';
        syncDependentUi();
        updateActiveSource();
        refreshPreviews();
        showToast(`Preset loaded — ${p.label}. ${p.hint}`);
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
            completion: val('sa-3ds-completion-type') === 'non_hosted'
                ? { type: 'non_hosted' }
                : { type: 'hosted', success_url: val('sa-3ds-success-url'), failure_url: val('sa-3ds-failure-url') },
        };
        // Redirectless frictionless: hand Checkout.com the browser data up front so it need not collect it via a redirect.
        if (checked('sa-3ds-redirectless')) body.channel_data = channelDataFromForm();
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
            : { enabled: true, eci: val('sa-pay-eci'), cryptogram: val('sa-pay-cryptogram'), xid: val('sa-pay-xid'), version: val('sa-pay-version'),
                // docs: when the exemption was applied during authentication, flag it again in the authorization
                ...(val('sa-pay-exemption') ? { exemption: val('sa-pay-exemption') } : {}) };
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
        if (val('sa-rt-pan')) body.processing = { pan_preference: val('sa-rt-pan') };
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
            case 'nt': set('sa-nt-preview', () => buildProvisionBody(true)); set('sa-ntp-preview', buildNtPayBody); break;
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

    // The payment that belongs to the session on screen — and ONLY that one. It comes from the one-payment record,
    // never from state.lastPaymentId (a tab-wide value that any payment in any panel overwrites).
    function sessionPaymentId() { return state.sid ? (readConsumed()[state.sid]?.payment_id || null) : null; }

    function syncDetailsButton() {
        const b = $('sa-pay-details-btn');
        if (!b) return;
        const id = sessionPaymentId();
        b.style.display = id ? '' : 'none';
        b.title = id ? `Fetch ${id} — the payment made with session ${state.sid}` : '';
    }

    // "Via full 3DS data" needs a cryptogram. Real sandbox sessions that were declined / rejected / unavailable
    // return eci 07 + xid but NO cryptogram, so only approved / attempted sessions can be authorized that way.
    // The check is the cryptogram itself, not the status, so it stays correct for any future status.
    const sessionHas3dsData = (sess) => !!(sess && sess.cryptogram);

    function syncAuthModeAvailability() {
        const pill = document.querySelector('#sa-3ds-auth-mode-pills [data-sa-auth="data"]');
        if (!pill) return;
        const sess = state.session, has = sessionHas3dsData(sess);
        pill.classList.toggle('disabled', !has);
        const hint = $('sa-pay-mode-hint');
        if (hint) {
            hint.style.display = has ? 'none' : '';
            hint.textContent = !sess || !isFinalStatus(sess.status)
                ? 'Full 3DS data (eci / cryptogram / xid / version) becomes available once the authentication is approved or attempted.'
                : `Full 3DS data is not available for a ${sess.status} authentication — Checkout.com returns no cryptogram for it. The only way to authorize is via the session id (3ds.authentication_id), which is how this outcome is tested.`;
        }
        if (!has && state.payAuth === 'data') {
            state.payAuth = 'sid';
            syncDependentUi();
            refreshPreviews();
            if (sess && isFinalStatus(sess.status)) showToast(`No 3DS cryptogram for a ${sess.status} session — switched to “via session id”`);
        }
    }

    function updatePayGate() {
        const btn = $('sa-pay-btn'), body = $('sa-pay-body'), box = $('sa-pay-gate');
        if (!btn) return;
        syncAuthModeAvailability();
        syncDetailsButton();
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
            whEvents: [...state.whAll.values()].filter(whRelevant).slice(-60),     // only this session's events travel with it
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
        if ($('sa-3ds-redirectless-fields')) $('sa-3ds-redirectless-fields').style.display = checked('sa-3ds-redirectless') ? '' : 'none';
        if ($('sa-3ds-nonhosted-note')) $('sa-3ds-nonhosted-note').style.display = val('sa-3ds-completion-type') === 'non_hosted' ? 'flex' : 'none';
        renderChallengeHelp();
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
        adoptWebhooks(snap.whEvents || []);             // list and API log stay identical, even in a brand-new tab
        syncDependentUi();
        Object.entries(snap.results || {}).forEach(([id, r]) => {
            const b = $(id);
            if (b) { b.innerHTML = r.html; b.style.display = 'block'; state.resText[id] = r.text; }
        });
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
            msg = (s.next_actions || []).includes('challenge_cardholder') ? '<strong>Challenge required (non_hosted).</strong> Non-hosted sessions leave the challenge UI to you, and this tester has none — create a <strong>hosted</strong> session for challenge cards.'
                : st === 'pending' && (s.next_actions || []).some(a => a === 'collect_channel_data' || a === 'issuer_fingerprint') ? '<strong>Waiting for channel data.</strong> This non-hosted session was created without <code>channel_data</code> — switch on “Redirectless frictionless” so it is sent with the session.'
                : st === 'pending' ? 'Waiting for the cardholder — redirect them to the hosted page (Step 2). This page keeps polling and restores itself when they come back.'
                : st === 'challenged' ? 'The issuer requires a challenge — redirect the cardholder to the hosted page (Step 2) and complete it (password <code>Checkout1!</code>).'
                : 'The issuer is evaluating the authentication…';
        } else if (st === 'approved') {
            cls = 'info'; icon = '✅'; jump = true;
            msg = `<strong>Authenticated${s.challenged ? ' after a challenge' : ' (frictionless)'}.</strong> Authorize the payment in Step 3 — via session id, or with the raw 3DS data.`
                + (s.exemption?.applied && s.exemption.applied !== 'none' ? ` <strong>Exemption applied: ${esc(s.exemption.applied)}</strong> — no liability shift.` : '');
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
                : (state.session && isFinalStatus(state.session.status) ? '✓ No redirect needed — this session completed without one.' : '');
        }
    }

    // requested vs applied — the heart of exemption testing
    function exemptionNote(s) {
        const ex = s?.exemption || {};
        if (ex.applied && ex.applied !== 'none') {
            return `<div class="sa-note"><strong>Exemption applied: ${esc(ex.applied)}.</strong> The issuer accepted it, so SCA was skipped — and there is <strong>no liability shift</strong> (you are liable if the payment turns out to be fraudulent). When you pay with the raw 3DS data, flag it in <code>3ds.exemption</code>.</div>`;
        }
        if (ex.requested && ex.requested !== 'none') {
            return `<div class="sa-note"><strong>Exemption requested (${esc(ex.requested)}) but not applied.</strong> The issuer / simulator decides, so the normal outcome for this card followed (${esc(s.flow_type || s.status)}). In the sandbox most test cards echo the request without applying it.</div>`;
        }
        return '';
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
            ['challenge_indicator', s.challenge_indicator],
            ['exemption.requested', s.exemption?.requested], ['exemption.applied', s.exemption?.applied, s.exemption?.applied && s.exemption.applied !== 'none' ? 'good' : ''],
            ['transaction_id', s.transaction_id],
        ])}${exemptionNote(s)}${hint ? `<div class="sa-note"><strong>What now:</strong> ${esc(hint)}</div>` : ''}`;
    }

    function applySession(s) {
        if (s.id && s.id !== state.sid) {                                // a different session — nothing of the old one may linger
            state.redirectHref = null;
            ['sa-pay-res', 'sa-pay-details-res'].forEach(id => { const b = $(id); if (b) { b.style.display = 'none'; b.innerHTML = ''; } delete state.resText[id]; });
        }
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
        prefill('sa-pay-exemption', s.exemption?.applied && s.exemption.applied !== 'none' ? s.exemption.applied : undefined);
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
            const finalNow = isFinalStatus(env.data.status);
            summary = env.upstream_status === 201 && finalNow
                ? `<div class="sa-banner info" style="display:flex;"><span>⚡</span><div><strong>HTTP 201 — authentication completed without a redirect.</strong> Status <code>${esc(env.data.status)}</code>${env.data.flow_type ? ` (${esc(env.data.flow_type)})` : ''}${env.data.eci ? `, eci <code>${esc(env.data.eci)}</code>` : ''}${env.data.cryptogram ? ' with a cryptogram' : ''}. Nothing to redirect — Step 3 is ready${(env.data.next_actions || []).includes('complete') ? ' (the optional “complete” session step is not needed here)' : ''}.</div></div>`
                : env.upstream_status === 201
                ? `<div class="sa-note"><strong>HTTP 201 — session created with its channel data.</strong> Status <code>${esc(env.data.status)}</code>: ${state.redirectHref ? 'redirect the cardholder (Step 2) to complete the challenge.' : 'see next_actions below.'}</div>`
                : `<div class="sa-note"><strong>HTTP 202 — session created.</strong> Status <code>${esc(env.data.status)}</code> — next: redirect the cardholder (Step 2). Live status below.</div>`;
            $('sa-3ds-create-hint').textContent = '';
            renderResponse('sa-3ds-session-res', { ...env, upstream: env.upstream }, sessionSummary(env.data));
            if (finalNow) stopPolling('not needed — the session finished synchronously'); else startPolling();
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
                        logCko('GET', env, undefined, `GET /sessions/${state.sid} (status → ${s.status})`);
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
        if (state.payAuth === 'data' && !sessionHas3dsData(state.session)) { syncAuthModeAvailability(); return showToast('This session has no 3DS cryptogram — authorize via the session id', 'error'); }
        if (gate.locked) { updatePayGate(); return showToast(gate.kind === 'used' ? 'This authentication already has a payment — start a new session' : 'Step 3 is locked — finish the 3DS redirect first', 'error'); }
        if (!state.sessionSource && !getCardSource(false)) return;
        const body = buildAuthorizeBody(false);
        const env = await callLegacy('POST', '/payments', { body, label: 'POST /payments (Suite — authorize with 3DS)' });
        const p = env.data?.payment || env.data;
        env.data = p;
        env.ok = !!p?.id && env.ok;
        if (p?.id) {
            state.lastPaymentId = p.id;
            // The authentication is spent as soon as a payment exists — approved or declined.
            markConsumed(state.sid, { payment_id: p.id, approved: !!p.approved, status: p.status, response_code: p.response_code });
            syncWebhookFollow();        // after markConsumed: the 3DS panel follows the payment recorded against this session
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
        const payId = sessionPaymentId();
        if (!payId) { syncDetailsButton(); return showToast('No payment was created with this session', 'error'); }
        const env = await callLegacy('GET', '/get-payment-details', { query: { paymentId: payId }, label: 'GET /payments/{id} (Suite)' });
        const p = env.data;
        renderResponse('sa-pay-details-res', env, p?.id ? kv([
            ['payment id', p.id], ['made with session', state.sid],
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
            processing: { provision_network_token: checked('sa-nt-pay-provision'), ...(val('sa-nt-pay-pan') ? { pan_preference: val('sa-nt-pay-pan') } : {}) },
            ...(checked('sa-nt-pay-mit') ? { merchant_initiated: true } : {}),
        };
        const env = await callLegacy('POST', '/payments', { body, label: 'POST /payments (Suite — payment-time NT provisioning)' });
        const p = env.data?.payment || env.data;
        env.data = p; trackPayment(p);
        const pan = p?.processing?.pan_type_processed;
        renderResponse('sa-nt-pay-res', env, paymentSummary(p, [
            ['processing.pan_type_processed', pan], ['processing.cko_network_token_available', p?.processing?.cko_network_token_available, p?.processing?.cko_network_token_available ? 'good' : 'warn'],
        ]) + `<div class="sa-note">${pan === 'fpan' ? 'Processed with the full PAN — provisioning (if requested) happens asynchronously; pay again with the same card to see the token used.' : ''}</div>`);
    }

    // The cryptogram response only carries an eci for some schemes (Visa returns "07"; Mastercard/MDES returns none).
    // A missing eci must stay missing — never the string "undefined" — so the field is left blank and omitted from the request.
    const eciFromCryptogram = (c) => (c && c.eci !== undefined && c.eci !== null && String(c.eci) !== '') ? String(c.eci).padStart(2, '0') : '';

    function fillNtPay(nt, crypto) {
        const set = (id, v) => { const e = $(id); if (e) e.value = v; };
        set('sa-ntp-token', String(nt.number || '')); set('sa-ntp-month', parseInt(nt.expiry_month, 10) || ''); set('sa-ntp-year', parseInt(nt.expiry_year, 10) || '');
        set('sa-ntp-type', ['vts', 'mdes', 'applepay', 'googlepay'].includes(nt.type) ? nt.type : 'vts');
        set('sa-ntp-cryptogram', crypto?.cryptogram || ''); set('sa-ntp-eci', eciFromCryptogram(crypto));
    }

    function buildNtPayBody() {
        const eci = val('sa-ntp-eci').trim();
        const source = { type: 'network_token', token: val('sa-ntp-token').trim(), expiry_month: parseInt(val('sa-ntp-month'), 10) || null, expiry_year: parseInt(val('sa-ntp-year'), 10) || null,
            token_type: val('sa-ntp-type'), cryptogram: val('sa-ntp-cryptogram').trim() };
        if (eci) source.eci = eci;                        // omitted entirely when blank
        return { source, amount: parseInt(val('sa-nt-pay-amount'), 10), currency: val('sa-nt-pay-currency'), capture: true,
            reference: `suite-nt-${Date.now().toString().slice(-8)}`, processing_channel_id: projectChannel(),
            ...(checked('sa-nt-pay-mit') ? { merchant_initiated: true } : {}) };
    }

    // Always fetches a fresh cryptogram for the selected token and fills the fields.
    async function refreshNtPayFields() {
        const id = currentNtId();
        if (!id) { showToast('Select or enter a network token id', 'error'); return null; }
        let nt = ntList().find(n => n.id === id);
        if (!nt?.number) {                                  // typed-in id — fetch DPAN + expiry first
            const g = await call('GET', 'network-token', { query: { id } });
            if (!g.ok) { renderResponse('sa-nt-pay-res', g, ''); return null; }
            saveNtFromResponse(g.data);
            nt = ntList().find(n => n.id === id);
        }
        const c = await call('POST', 'network-token-cryptogram', { query: { id }, body: { transaction_type: val('sa-nt-crypto-type') || 'ecom' } });
        if (!c.ok) { renderResponse('sa-nt-pay-res', c, ''); return null; }
        fillNtPay(nt, c.data);
        refreshPreviews();
        return nt;
    }

    async function payNtFromFields() {
        if (!val('sa-ntp-token').trim() || !val('sa-ntp-cryptogram').trim()) return showToast('Fill the token and cryptogram first (or use “Pay with the selected network token”)', 'error');
        const body = buildNtPayBody();
        const env = await callLegacy('POST', '/payments', { body, label: 'POST /payments (Suite — pay with network token)' });
        const p = env.data?.payment || env.data;
        env.data = p; trackPayment(p);
        const hint43102 = p?.response_code === '43102' ? `<div class="sa-note"><strong>43102 — Visa AFT mandate compliance.</strong> On this account every Visa customer-initiated payment declines with this code regardless of the token; switch on <code>merchant_initiated</code> above.</div>` : '';
        const hint20012 = p?.response_code === '20012' ? `<div class="sa-note"><strong>20012 — Invalid Transaction.</strong> A common cause with Mastercard tokens is an eci that belongs to another scheme (for example 05, which is a Visa value). Leave the eci blank or use 02.</div>` : '';
        renderResponse('sa-nt-pay-res', env, paymentSummary(p, [['source.type', 'network_token'], ['sent eci', body.source.eci || '(omitted)'], ['response eci', p?.eci],
            ['processing.pan_type_processed', p?.processing?.pan_type_processed], ['scheme_id', p?.scheme_id]]) + hint43102 + hint20012);
    }

    async function payWithNt() {
        const nt = await refreshNtPayFields();
        if (nt) await payNtFromFields();
    }

    // =====================================================================
    // Network token scenarios (data: NT_GROUPS in data.js) — each case is a short script of steps
    // =====================================================================
    const ntcGroup = () => NT_GROUPS.find(g => g.id === state.ntcGroup) || NT_GROUPS[0];
    const ntcCases = () => ntcGroup().cases.filter(c => !c.extra || checked('sa-ntc-extras'));
    const findNtcCase = (id) => NT_GROUPS.flatMap(g => g.cases).find(c => c.id === id);

    function loadNtcState() {
        try { const o = JSON.parse(sessionStorage.getItem(SS_NTC) || '{}'); state.ntcResults = o.results || {}; state.ntIds = o.ids || []; } catch (e) { /* ignore */ }
    }
    function persistNtc() {
        try { sessionStorage.setItem(SS_NTC, JSON.stringify({ results: state.ntcResults, ids: state.ntIds.slice(-60) })); } catch (e) { /* storage full */ }
    }

    const last4 = (n) => String(n).slice(-4);
    function ntcStepText(st) {
        const e = st.expect || {}, bits = [];
        if (e.http !== undefined) bits.push('HTTP ' + [].concat(e.http).join('/'));
        if (e.error) bits.push(e.error);
        if (e.type) bits.push(e.type);
        if (e.state) bits.push('state ' + e.state);
        if (e.hasCryptogram) bits.push('cryptogram');
        if (e.hasEci === true) bits.push('eci'); else if (e.hasEci === false) bits.push('no eci');
        if (e.sameNt) bits.push('same token');
        if (e.ntId) bits.push('network_token.id');
        if (e.approved !== undefined) bits.push(e.approved ? 'approved ' + (e.code || '') : 'declined ' + (e.code || ''));
        if (e.pan) bits.push(e.pan);
        if (e.ntAvail) bits.push('token available');
        if (e.respEci) bits.push('eci ' + e.respEci);
        const what = {
            instrument: `create Source ID ••${last4(st.card || '')}${st.provision ? ' + provision' : ''}`,
            provision: st.via === 'id' ? 'provision (Source ID)' : `provision ••${last4(st.card || '')}${st.exp ? ' exp ' + st.exp : ''}`,
            get: st.id ? 'get ' + st.id : 'get token', cryptogram: `cryptogram ${st.type}`, delete: `delete (${st.by}/${st.reason})`,
            pay: `pay (${st.mode === 'nt' ? 'token, eci ' + st.eci + (st.badCrypto ? ', bad cryptogram' : '') : st.mode}${st.mit ? ', MIT' : ''}${st.pan ? ', ' + st.pan : ''}${st.provision ? ', provision' : ''})`,
        }[st.op];
        return `${what} → ${bits.join(' · ')}`;
    }

    function ntcWebhookChip(c) {
        const r = state.ntcResults[c.id];
        if (!c.webhook || !r || !r.ntId) return '';
        const ev = [...state.whAll.values()].find(e => e.type === c.webhook && JSON.stringify(e.data || {}).includes(r.ntId));
        if (ev) return `<span class="sa-badge good" title="${esc(jsonOf(ev.data))}">webhook: ${esc(c.webhook)} (${esc(ev.data?.network_token?.state || '?')})</span>`;
        const mins = Math.floor((Date.now() - r.at) / 60000);
        return `<span class="sa-badge soft-warn" title="Lifecycle webhooks are asynchronous and can be slow in sandbox">webhook: waiting ${mins ? mins + ' min' : '…'}</span>`;
    }

    function ntcResultChip(c) {
        const r = state.ntcResults[c.id];
        if (state.ntcRunning === c.id) return '<span class="sa-badge">running…</span>';
        if (!r) return '<span class="sa-badge">not run</span>';
        const known = ['deviates', 'broken', 'flaky'].includes(c.sandbox.s);
        if (r.verdict === 'PASS') return '<span class="sa-badge good">PASS</span>';
        if (r.verdict === 'ERROR') return '<span class="sa-badge bad">ERROR</span>';
        return `<span class="sa-badge ${known ? 'soft-warn' : 'warn'}">DEVIATES${known ? ' (known)' : ''}</span>`;
    }

    function renderNtcGroups() {
        const box = $('sa-ntc-groups');
        if (!box) return;
        box.innerHTML = NT_GROUPS.map(g => `<div class="sa-pill ${g.id === state.ntcGroup ? 'active' : ''}" data-sa-ntgroup="${esc(g.id)}">${esc(g.title)}</div>`).join('');
        $('sa-ntc-blurb').textContent = ntcGroup().blurb;
    }

    function renderNtcCases() {
        const box = $('sa-ntc-cases');
        if (!box) return;
        const g = ntcGroup(), busy = !!state.ntcRunning || state.ntcBatch;
        const rows = ntcCases().map(c => {
            const [bcls, btxt] = SANDBOX_BADGE[c.sandbox.s];
            return `<tr class="${state.ntcActive === c.id ? 'sa-rt-active' : ''}">
                <td>${esc(c.n)}</td>
                <td><strong>${esc(c.title)}</strong>${c.extra ? ' <span class="sa-badge">extra</span>' : ''}<div class="sa-rt-sub">${esc(c.doc)}</div></td>
                <td><ol style="margin:0; padding-left:16px;">${c.steps.map(st => `<li class="sa-rt-sub" style="margin:0 0 3px;">${esc(ntcStepText(st))}</li>`).join('')}</ol></td>
                <td><span class="sa-badge ${bcls}" title="${esc(c.sandbox.note)}">${btxt}</span></td>
                <td>${ntcResultChip(c)}<div style="margin-top:4px;">${ntcWebhookChip(c)}</div></td>
                <td style="white-space:nowrap;">
                    <button class="copy-btn" type="button" data-sa-nt-run="${esc(c.id)}" ${busy ? 'disabled' : ''}>${state.ntcRunning === c.id ? 'Running…' : 'Run'}</button>
                    ${state.ntcResults[c.id] ? `<button class="copy-btn" type="button" data-sa-nt-report="${esc(c.id)}">Report</button>` : ''}
                </td></tr>`;
        }).join('');
        box.innerHTML = `<div style="overflow-x:auto;"><table class="sa-rt-table"><thead><tr><th>#</th><th>Scenario</th><th>Steps and expectations</th><th>Sandbox</th><th>Result</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
        $('sa-ntc-runall-btn').disabled = busy;
        const all = ntcCases(), n = (v) => all.filter(c => state.ntcResults[c.id]?.verdict === v).length;
        $('sa-ntc-summary').textContent = `${g.title}: ${n('PASS')} pass · ${n('DEVIATES')} deviate · ${n('ERROR')} error · ${all.filter(c => !state.ntcResults[c.id]).length} not run (${all.length} scenarios)`;
    }

    // One scripted step. Returns { env, fatal } and appends its checks to `rec`.
    async function execNtcStep(st, ctx, rec) {
        const E = st.expect || {};
        const add = (label, expected, actual, ok) => rec.checks.push({ label, expected: String(expected), actual: String(actual), state: ok ? 'ok' : 'no' });
        const httpOk = (act) => [].concat(E.http).includes(act);
        const errText = (env) => JSON.stringify(env.data?.error_codes ?? env.data ?? '');
        const needNt = () => { if (!ctx.nt?.id) { add('prerequisite', 'a token from an earlier step', 'none', false); return false; } return true; };
        const common = (env) => {
            if (E.http !== undefined) add('HTTP status', [].concat(E.http).join(' / '), env.upstream_status, httpOk(env.upstream_status));
            if (E.error) add('error code', E.error, errText(env).slice(0, 110), errText(env).includes(E.error));
        };

        if (st.op === 'instrument') {
            const body = { type: 'card', number: st.card, expiry_month: '12', expiry_year: '2030', name: 'NT Test', cvv: '100', processing_channel_id: projectChannel(), ...(st.provision ? { network_token: { provision: true } } : {}) };
            rec.label = `Create a Source ID from ••${last4(st.card)}${st.provision ? ' with network_token.provision = true' : ''}`;
            const env = await call('POST', 'instruments', { body, label: `POST /instruments (NT scenario)` });
            common(env);
            if (env.ok) ctx.inst = env.data;
            if (E.ntId) add('network_token.id in the response', 'nt_…', env.data?.network_token?.id || '—', /^nt_/.test(env.data?.network_token?.id || ''));
            if (E.state) add('network_token.state', E.state, env.data?.network_token?.state || '—', env.data?.network_token?.state === E.state);
            if (env.data?.network_token?.id) { ctx.nt = { id: env.data.network_token.id }; state.ntIds.push(env.data.network_token.id); }
            return { env, fatal: !env.ok && !E.http?.toString().startsWith('4') };
        }
        if (st.op === 'provision') {
            const viaId = st.via === 'id';
            if (viaId && !ctx.inst?.id) { add('prerequisite', 'a Source ID from an earlier step', 'none', false); return { fatal: true }; }
            const body = { source: viaId ? { type: 'id', id: ctx.inst.id } : { type: 'card', number: st.card, expiry_month: '12', expiry_year: st.exp || '2030' } };
            rec.label = viaId ? 'Provision from the Source ID' : `Provision from card ••${last4(st.card)}${st.exp ? ' (expiry 12/' + st.exp + ')' : ''}`;
            const env = await call('POST', 'network-tokens', { body, label: 'POST /network-tokens (NT scenario)' });
            common(env);
            const t = env.data?.network_token;
            if (E.type) add('token type', E.type, t?.type || '—', t?.type === E.type);
            if (E.state) add('token state', E.state, t?.state || '—', t?.state === E.state);
            if (E.sameNt) add('same token as before', ctx.nt?.id || '—', t?.id || '—', !!t?.id && t.id === ctx.nt?.id);
            if (env.ok && t?.id) { ctx.nt = { ...t }; state.ntIds.push(t.id); }
            return { env };
        }
        if (st.op === 'get') {
            const id = st.id || ctx.nt?.id;
            if (!id) { needNt(); return { fatal: true }; }
            rec.label = st.id ? `Get ${st.id}` : 'Get the token';
            const env = await call('GET', 'network-token', { query: { id }, label: 'GET /network-tokens/{id} (NT scenario)' });
            common(env);
            if (E.state) add('token state', E.state, env.data?.network_token?.state || '—', env.data?.network_token?.state === E.state);
            return { env };
        }
        if (st.op === 'cryptogram') {
            if (!needNt()) return { fatal: true };
            rec.label = `Request a cryptogram (${st.type})`;
            const env = await call('POST', 'network-token-cryptogram', { query: { id: ctx.nt.id }, body: { transaction_type: st.type }, label: 'POST /network-tokens/{id}/cryptograms (NT scenario)' });
            common(env);
            if (E.hasCryptogram !== undefined) add('cryptogram returned', E.hasCryptogram ? 'yes' : 'no', env.data?.cryptogram ? 'yes' : 'no', !!env.data?.cryptogram === E.hasCryptogram);
            if (E.hasEci !== undefined) add('eci in the response', E.hasEci ? 'yes' : 'no', env.data?.eci !== undefined ? 'yes (' + env.data.eci + ')' : 'no', (env.data?.eci !== undefined) === E.hasEci);
            if (env.ok) ctx.crypto = env.data;
            return { env };
        }
        if (st.op === 'delete') {
            if (!needNt()) return { fatal: true };
            rec.label = `Delete the token (${st.by} / ${st.reason})`;
            const env = await call('POST', 'network-token-delete', { query: { id: ctx.nt.id }, body: { initiated_by: st.by, reason: st.reason }, label: 'PATCH /network-tokens/{id}/delete (NT scenario)' });
            common(env);
            return { env };
        }
        if (st.op === 'pay') {
            const amount = 100;
            let source;
            if (st.mode === 'nt') {
                if (!needNt() || !ctx.crypto?.cryptogram) { if (!ctx.crypto?.cryptogram) add('prerequisite', 'a cryptogram from an earlier step', 'none', false); return { fatal: true }; }
                const eci = st.eci === 'omit' ? '' : st.eci === 'cryptogram' ? eciFromCryptogram(ctx.crypto) : st.eci;
                source = { type: 'network_token', token: String(ctx.nt.number), expiry_month: parseInt(ctx.nt.expiry_month, 10), expiry_year: parseInt(ctx.nt.expiry_year, 10),
                    token_type: st.tokenType || ctx.nt.type, cryptogram: st.badCrypto ? 'AAAAAAAAAAAAAAAAAAAAAAAAAAAA' : ctx.crypto.cryptogram, ...(eci ? { eci } : {}) };
                rec.label = `Pay with the token — eci ${source.eci || 'omitted'}${st.badCrypto ? ', deliberately wrong cryptogram' : ''}${st.mit ? ', merchant-initiated' : ''}`;
            } else if (st.mode === 'card') {
                source = { number: st.card, expiry_month: '12', expiry_year: '2030', cvv: '100' };
                rec.label = `Pay with the full card ••${last4(st.card)}${st.provision ? ' and ask for provisioning' : ''}`;
            } else {
                if (!ctx.inst?.id) { add('prerequisite', 'a Source ID from an earlier step', 'none', false); return { fatal: true }; }
                source = { id: ctx.inst.id };
                rec.label = `Pay with the stored Source ID${st.pan ? ' and pan_preference = ' + st.pan : ''}`;
            }
            const body = { source, amount, currency: 'GBP', capture: true, reference: `ntc-${String(Date.now()).slice(-7)}`, processing_channel_id: projectChannel(),
                ...(st.mit ? { merchant_initiated: true } : {}),
                ...(st.provision || st.pan ? { processing: { ...(st.provision ? { provision_network_token: true } : {}), ...(st.pan ? { pan_preference: st.pan } : {}) } } : {}) };
            const env = await callLegacy('POST', '/payments', { body, label: 'POST /payments (NT scenario)' });
            const p = env.data?.payment || env.data;
            env.data = p;
            if (!p?.id) { add('payment created', 'a payment', `HTTP ${env.upstream_status} ${p?.error_codes ? p.error_codes.join(', ') : ''}`, false); return { env, fatal: true }; }
            rec.paymentId = p.id; state.ntIds.push(p.id);
            if (E.approved !== undefined) add('payment outcome', E.approved ? 'approved' : 'declined', p.approved ? 'approved' : 'declined', !!p.approved === E.approved);
            if (E.code) add('response_code', E.code, `${p.response_code}${p.response_summary ? ' (' + p.response_summary + ')' : ''}`, p.response_code === E.code);
            if (E.pan) add('processing.pan_type_processed', E.pan, p.processing?.pan_type_processed || '—', p.processing?.pan_type_processed === E.pan);
            if (E.ntAvail) add('cko_network_token_available', 'true', String(p.processing?.cko_network_token_available), p.processing?.cko_network_token_available === true);
            if (E.respEci) add('eci in the payment response', E.respEci, p.eci || '—', p.eci === E.respEci);
            return { env };
        }
        return { fatal: true };
    }

    async function runNtcCase(c) {
        state.ntcRunning = c.id; state.ntcActive = c.id; renderNtcCases();
        const ctx = { inst: null, nt: null, crypto: null }, steps = [];
        let verdict = 'PASS', lastEnv = null;
        try {
            for (const [i, st] of c.steps.entries()) {
                const rec = { n: i + 1, label: st.op, checks: [] };
                steps.push(rec);
                const out = await execNtcStep(st, ctx, rec);
                if (out.env) lastEnv = out.env;
                if (rec.checks.some(k => k.state === 'no')) verdict = 'DEVIATES';
                if (out.fatal) { if (verdict === 'PASS') verdict = 'ERROR'; break; }
            }
        } catch (e) {
            verdict = 'ERROR';
            steps.push({ n: steps.length + 1, label: 'Unexpected error', checks: [{ label: 'error', expected: '—', actual: e.message, state: 'no' }] });
        } finally {
            state.ntcResults[c.id] = { verdict, steps, ntId: ctx.nt?.id || null, at: Date.now() };
            state.ntcEnv[c.id] = lastEnv;
            state.ntcRunning = null;
            persistNtc();
            syncWebhookFollow();
            renderNtcCases();
            renderNtcReport(c.id);
        }
    }

    async function runAllNtc() {
        const btn = $('sa-ntc-runall-btn');
        if (state.ntcRunning || state.ntcBatch) return;
        state.ntcBatch = true; btn.disabled = true;
        const label = btn.textContent; btn.textContent = 'Running scenarios…';
        renderNtcCases();
        try {
            for (const c of ntcCases()) { await runNtcCase(c); await new Promise(r => setTimeout(r, 250)); }
            showToast(`${ntcGroup().title}: all scenarios run — see the table`);
        } finally { state.ntcBatch = false; btn.textContent = label; renderNtcCases(); }
    }

    function renderNtcReport(id) {
        const c = findNtcCase(id), r = state.ntcResults[id], box = $('sa-ntc-report');
        if (!c || !r || !box) return;
        state.ntcActive = id;
        const [bcls, btxt] = SANDBOX_BADGE[c.sandbox.s];
        const stepsHtml = r.steps.map(st => {
            const rows = st.checks.map(k => `<div class="${k.state}">${k.state === 'ok' ? '✓' : '✗'}</div><div>${esc(k.label)}</div><div><code>${esc(k.expected)}</code></div><div><code>${esc(k.actual)}</code></div>`).join('');
            return `<div class="sa-sub" style="margin:12px 0 2px;">Step ${st.n} · ${esc(st.label)}</div>${rows ? `<div class="sa-chk"><div class="h"></div><div class="h">Check</div><div class="h">Expected</div><div class="h">Actual</div>${rows}</div>` : ''}${st.paymentId ? `<div class="sa-note">payment <code>${esc(st.paymentId)}</code></div>` : ''}`;
        }).join('');
        const html = `
            <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:6px;"><strong>Scenario ${esc(c.n)} — ${esc(c.title)}</strong> ${ntcResultChip(c)} <span class="sa-badge ${bcls}">sandbox: ${btxt}</span></div>
            <div class="sa-note"><em>${esc(c.doc)}</em></div>
            <div class="sa-note" style="margin-top:4px;"><strong>Observed in sandbox:</strong> ${esc(c.sandbox.note)}</div>
            ${stepsHtml}
            <div class="sa-note" style="margin-top:8px;">${r.ntId ? `Token <code>${esc(r.ntId)}</code>` : ''} ${ntcWebhookChip(c)}</div>
            <div class="sa-note" style="margin-top:6px;">The raw response of the last step follows.</div>`;
        const env = state.ntcEnv[id];
        if (env) renderResponse('sa-ntc-report', env, html);
        else { box.style.display = 'block'; box.innerHTML = `<div class="sa-res-body">${html}</div>`; }
        renderNtcCases();
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
    // RTAU simulator test cases (data: RTAU_GROUPS in data.js)
    // =====================================================================
    const rtauGroup = () => RTAU_GROUPS.find(g => g.id === state.rtauGroup) || RTAU_GROUPS[0];
    const rtauCases = () => rtauGroup().cases.filter(c => !c.extra || checked('sa-rtau-extras'));
    const findRtauCase = (id) => RTAU_GROUPS.flatMap(g => g.cases).find(c => c.id === id);
    const expKey = (c) => `${+c.exp[0]}/${c.exp[1]}`;

    function loadRtauState() {
        try { const o = JSON.parse(sessionStorage.getItem(SS_RTAU) || '{}'); state.rtauResults = o.results || {}; state.rtauIds = o.ids || []; } catch (e) { /* ignore */ }
    }
    function persistRtau() {
        try { sessionStorage.setItem(SS_RTAU, JSON.stringify({ results: state.rtauResults, ids: state.rtauIds.slice(-60) })); } catch (e) { /* storage full */ }
    }

    // What the document expects, in one line.
    function rtauExpectText(c) {
        const E = c.expect, bits = [];
        if (c.store) {
            const sy = E.sync;
            bits.push(sy.http === 502 ? 'Standalone check: HTTP 502 (scheme error)' : `Standalone check: ${sy.status}${sy.failure ? ' / ' + sy.failure : ''}`);
            bits.push(E.webhook === 'none' ? 'no webhook' : `webhook card_updated (${E.reason})${E.webhook === 'delayed' ? ', delayed' : ''}`);
            return bits.join(' · ');
        }
        if (E.approved !== undefined) bits.push(E.approved ? 'Approved' + (E.codes ? ' ' + E.codes[0] : '') : 'Declined ' + (E.codes ? E.codes.join('/') : ''));
        if (E.update === 'none') bits.push('no update');
        else if (E.update) bits.push(E.update);
        if (E.failure) bits.push(E.failure);
        if (E.newBin) bits.push(`→ ${E.newBin} ••${E.newLast4}${E.newExp ? ' ' + E.newExp : ''}`);
        else if (E.newExp) bits.push('→ ' + E.newExp);
        if (E.changed && !E.newBin) bits.push('card details change');
        bits.push(E.webhook === 'none' ? 'no webhook' : 'webhook card_updated');
        return bits.join(' · ');
    }

    const SANDBOX_BADGE = { works: ['soft-good', 'works'], flaky: ['soft-warn', 'flaky'], deviates: ['soft-warn', 'deviates from doc'], broken: ['soft-bad', 'not supported'] };

    function rtauWebhookChip(c) {
        const r = state.rtauResults[c.id];
        if (!r || !r.instrumentId || r.verdict === 'ERROR') return '';
        const ev = [...state.whAll.values()].find(e => e.type === 'card_updated' && JSON.stringify(e.data || {}).includes(r.instrumentId));
        const exp = c.expect.webhook;
        if (ev) {
            const reason = ev.data?.reason_type;
            const ok = !c.expect.reason || reason === c.expect.reason || c.expect.reason === 'card_updated' && !!reason;
            return `<span class="sa-badge ${ok ? 'good' : 'warn'}" title="${esc(jsonOf(ev.data))}">webhook: card_updated (${esc(reason || '?')})</span>`;
        }
        if (exp === 'none') return '<span class="sa-badge soft-good">webhook: none expected</span>';
        const mins = Math.floor((Date.now() - r.at) / 60000);
        return `<span class="sa-badge soft-warn" title="card_updated is asynchronous and can be slow or missing in sandbox">webhook: waiting ${mins ? mins + ' min' : '…'}${exp === 'delayed' ? ' (delayed case)' : ''}</span>`;
    }

    function rtauResultChip(c) {
        const r = state.rtauResults[c.id];
        if (state.rtauRunning === c.id) return '<span class="sa-badge">running…</span>';
        if (!r) return '<span class="sa-badge">not run</span>';
        const known = ['deviates', 'broken', 'flaky'].includes(c.sandbox.s);
        if (r.verdict === 'PASS') return '<span class="sa-badge good">PASS</span>';
        if (r.verdict === 'ERROR') return '<span class="sa-badge bad">ERROR</span>';
        return `<span class="sa-badge ${known ? 'soft-warn' : 'warn'}">DEVIATES${known ? ' (known)' : ''}</span>`;
    }

    function renderRtauGroups() {
        const box = $('sa-rtau-groups');
        if (!box) return;
        box.innerHTML = RTAU_GROUPS.map(g => `<div class="sa-pill ${g.id === state.rtauGroup ? 'active' : ''}" data-sa-rtgroup="${esc(g.id)}">${esc(g.title)}</div>`).join('');
        const g = rtauGroup();
        $('sa-rtau-blurb').textContent = g.blurb;
        const fp = $('sa-rtau-fpan');
        if (fp) fp.closest('.sa-toggle').style.display = g.id === 'mc-su' ? 'none' : '';
    }

    function renderRtauCases() {
        const box = $('sa-rtau-cases');
        if (!box) return;
        const g = rtauGroup(), busy = !!state.rtauRunning || state.rtauBatch;      // a batch keeps everything locked between cases too
        const rows = rtauCases().map(c => {
            const [bcls, btxt] = SANDBOX_BADGE[c.sandbox.s];
            const how = c.store ? `<code>${esc(c.card)}</code><div class="sa-rt-sub">create a Source ID · ${esc(c.exp.join('/'))}</div>`
                : `<code>${esc(c.card)}</code> · exp ${esc(c.exp.join('/'))}<div class="sa-rt-sub">amount <strong>${c.amount}</strong> · MIT ${c.mit ? 'yes' : 'no'} · ${c.via === 'id' ? 'Source ID' : 'raw card'}${c.pan === 'omit' ? ' · no pan_preference' : ''}</div>`;
            return `<tr class="${state.rtauActive === c.id ? 'sa-rt-active' : ''}">
                <td>${esc(c.n)}</td>
                <td><strong>${esc(c.title)}</strong>${c.extra ? ' <span class="sa-badge">extra</span>' : ''}${c.needsIA ? ' <span class="sa-badge soft-warn">IA merchant</span>' : ''}<div class="sa-rt-sub">${esc(c.doc)}</div></td>
                <td>${how}</td>
                <td>${esc(rtauExpectText(c))}</td>
                <td><span class="sa-badge ${bcls}" title="${esc(c.sandbox.note)}">${btxt}</span></td>
                <td>${rtauResultChip(c)}<div style="margin-top:4px;">${rtauWebhookChip(c)}</div></td>
                <td style="white-space:nowrap;">
                    <button class="copy-btn" type="button" data-sa-rt-run="${esc(c.id)}" ${busy ? 'disabled' : ''}>${state.rtauRunning === c.id ? 'Running…' : 'Run'}</button>
                    <button class="copy-btn" type="button" data-sa-rt-load="${esc(c.id)}" ${busy ? 'disabled' : ''} title="Load this case into the card source and manual panels above">Load</button>
                    ${state.rtauResults[c.id] ? `<button class="copy-btn" type="button" data-sa-rt-report="${esc(c.id)}">Report</button>` : ''}
                </td></tr>`;
        }).join('');
        box.innerHTML = `<div style="overflow-x:auto;"><table class="sa-rt-table"><thead><tr><th>#</th><th>Case (as written in the doc)</th><th>Card · request</th><th>Expected</th><th>Sandbox</th><th>Result</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
        $('sa-rtau-runall-btn').disabled = busy;
        const all = rtauCases();
        const n = (v) => all.filter(c => state.rtauResults[c.id]?.verdict === v).length;
        const notRun = all.filter(c => !state.rtauResults[c.id]).length;
        $('sa-rtau-summary').textContent = `${g.title}: ${n('PASS')} pass · ${n('DEVIATES')} deviate · ${n('ERROR')} error · ${notRun} not run (${all.length} cases)`;
    }

    // ----- scoring -----
    function checksFor(c, p) {
        const E = c.expect, src = p.source || {}, out = [];
        const add = (label, expected, actual, ok, warn) => out.push({ label, expected: String(expected), actual: String(actual), state: ok ? 'ok' : warn ? 'wn' : 'no' });
        if (E.approved !== undefined) add('Payment outcome', E.approved ? 'approved' : 'declined', p.approved ? 'approved' : 'declined', !!p.approved === E.approved);
        if (E.codes) add('response_code', E.codes.join(' / '), p.response_code ?? '—', E.codes.includes(p.response_code));
        if (E.update !== undefined) { const a = src.account_update_status || 'none'; add('source.account_update_status', E.update, a, a === E.update); }
        if (E.failure) add('source.account_update_failure_code', E.failure, src.account_update_failure_code || '—', src.account_update_failure_code === E.failure);
        if (E.newBin) add('replacement BIN', E.newBin + '…', src.bin || '—', String(src.bin || '').startsWith(E.newBin));
        if (E.newLast4) add('replacement last4', E.newLast4, src.last4 || '—', src.last4 === E.newLast4);
        if (E.newExp) { const a = src.expiry_month ? `${src.expiry_month}/${src.expiry_year}` : '—'; add('replacement expiry', E.newExp, a, a === E.newExp); }
        if (E.changed) {
            const exp = src.expiry_month ? `${src.expiry_month}/${src.expiry_year}` : expKey(c);
            const changed = !String(src.bin || '').startsWith(c.card.slice(0, 6)) || src.last4 !== c.card.slice(-4) || exp !== expKey(c);
            add('card details changed', 'yes', changed ? `yes (${src.bin} ••${src.last4} ${exp})` : 'no', changed);
        }
        const pan = p.processing?.pan_type_processed;
        if (pan === 'dpan' && ((E.update && E.update !== 'none') || E.changed)) add('processed with the full PAN', 'fpan', 'dpan — a network token was used, so RTAU was skipped (turn on pan_preference = fpan)', false, true);
        return out;
    }

    function checksForStore(c, instEnv, syncEnv) {
        const sy = c.expect.sync, out = [];
        const add = (label, expected, actual, ok) => out.push({ label, expected: String(expected), actual: String(actual), state: ok ? 'ok' : 'no' });
        add('Source ID created', 'src_…', instEnv.data?.id || `HTTP ${instEnv.upstream_status}`, !!instEnv.data?.id);
        if (syncEnv) {
            add('Standalone check — HTTP status', sy.http, syncEnv.upstream_status, syncEnv.upstream_status === sy.http);
            const d = syncEnv.data || {};
            if (sy.status) add('account_update_status', sy.status, d.account_update_status || d.update_status || '—', (d.account_update_status || d.update_status) === sy.status);
            if (sy.failure) add('account_update_failure_code', sy.failure, d.account_update_failure_code || '—', d.account_update_failure_code === sy.failure);
            if (sy.changed) {
                const k = d.card, exp = k ? `${k.expiry_month}/${k.expiry_year}` : '—';
                const changed = !!k && (!String(k.bin || '').startsWith(c.card.slice(0, 6)) || k.last4 !== c.card.slice(-4) || exp !== expKey(c));
                add('card details changed', 'yes', changed ? `yes (${k.bin} ••${k.last4} ${exp})` : 'no', changed);
            }
        }
        return out;
    }

    // ----- running a case -----
    async function createRtauInstrument(c) {
        const body = { type: 'card', number: c.card, expiry_month: c.exp[0], expiry_year: c.exp[1], name: 'RTAU Test', cvv: '100', processing_channel_id: projectChannel() };
        return call('POST', 'instruments', { body, label: `POST /instruments (RTAU case ${c.id})` });
    }

    async function runRtauCase(c) {
        state.rtauRunning = c.id; state.rtauActive = c.id; renderRtauCases();
        const result = { verdict: 'ERROR', checks: [], instrumentId: null, paymentId: null, at: Date.now(), headline: '' };
        let shownEnv = null;
        try {
            let inst = null;
            if (c.via !== 'card') {
                inst = await createRtauInstrument(c);
                shownEnv = inst;
                if (!inst.ok || !inst.data?.id) { result.headline = `Could not create the Source ID (HTTP ${inst.upstream_status})`; throw new Error('stop'); }
                result.instrumentId = inst.data.id;
                state.rtauIds.push(inst.data.id);
            }
            if (c.store) {
                let sync = null;
                sync = await call('POST', 'account-updater', { body: { source_options: { instrument: { id: inst.data.id } } }, label: `POST /account-updater/cards (RTAU case ${c.id})` });
                shownEnv = sync;
                result.checks = checksForStore(c, inst, sync);
            } else {
                const src = c.via === 'id' ? { id: inst.data.id, allow_update: true } : { number: c.card, expiry_month: c.exp[0], expiry_year: c.exp[1], cvv: '100', name: 'RTAU Test', allow_update: true };
                const body = { source: src, amount: c.amount, currency: 'USD', merchant_initiated: c.mit, capture: true,
                    reference: `rtau-${c.id}-${String(Date.now()).slice(-6)}`, processing_channel_id: projectChannel() };
                if (c.pan !== 'omit' && checked('sa-rtau-fpan')) body.processing = { pan_preference: 'fpan' };
                const env = await callLegacy('POST', '/payments', { body, label: `POST /payments (RTAU case ${c.id})` });
                const p = env.data?.payment || env.data;
                env.data = p; shownEnv = env;
                if (!p?.id) { result.headline = `Payment request failed (HTTP ${env.upstream_status}) ${p?.error_codes ? p.error_codes.join(', ') : ''}`; throw new Error('stop'); }
                result.paymentId = p.id; state.rtauIds.push(p.id);
                result.checks = checksFor(c, p);
                const s2 = p.source || {};
                result.headline = `${p.approved ? 'Approved' : 'Declined'} ${p.response_code}${p.response_summary ? ' (' + p.response_summary + ')' : ''}${s2.account_update_status ? ' · ' + s2.account_update_status + (s2.account_update_failure_code ? '/' + s2.account_update_failure_code : '') : ''} · ${s2.bin || ''} ••${s2.last4 || ''} ${s2.expiry_month || ''}/${s2.expiry_year || ''}`;
            }
            result.verdict = result.checks.some(k => k.state === 'no') ? 'DEVIATES' : 'PASS';
            if (c.store) result.headline = result.headline || `Source ID ${result.instrumentId} · Standalone check: ${shownEnv?.data?.account_update_status || ('HTTP ' + shownEnv?.upstream_status)}${shownEnv?.data?.account_update_failure_code ? '/' + shownEnv.data.account_update_failure_code : ''}`;
        } catch (e) {
            if (e.message !== 'stop') { result.headline = e.message; }
        } finally {
            result.at = Date.now();
            state.rtauResults[c.id] = result;
            state.rtauEnv[c.id] = shownEnv;
            state.rtauRunning = null;
            persistRtau();
            syncWebhookFollow();
            renderRtauCases();
            renderRtauReport(c.id);
        }
    }

    async function runAllRtau() {
        const btn = $('sa-rtau-runall-btn');
        if (state.rtauRunning || state.rtauBatch) return;
        state.rtauBatch = true;
        btn.disabled = true;
        const label = btn.textContent; btn.textContent = 'Running cases…';
        renderRtauCases();
        try {
            for (const c of rtauCases()) { await runRtauCase(c); await new Promise(r => setTimeout(r, 250)); }
            showToast(`${rtauGroup().title}: all cases run — see the table`);
        } finally { state.rtauBatch = false; btn.textContent = label; renderRtauCases(); }
    }

    function renderRtauReport(id) {
        const c = findRtauCase(id), r = state.rtauResults[id];
        const box = $('sa-rtau-report');
        if (!c || !r || !box) return;
        state.rtauActive = id;
        const [bcls, btxt] = SANDBOX_BADGE[c.sandbox.s];
        const rows = r.checks.map(k => `<div class="${k.state}">${k.state === 'ok' ? '✓' : k.state === 'wn' ? '!' : '✗'}</div><div>${esc(k.label)}</div><div><code>${esc(k.expected)}</code></div><div><code>${esc(k.actual)}</code></div>`).join('');
        const html = `
            <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:6px;">
                <strong>Case ${esc(c.n)} — ${esc(c.title)}</strong> ${rtauResultChip(c)} <span class="sa-badge ${bcls}">sandbox: ${btxt}</span>
            </div>
            <div class="sa-note" style="margin-bottom:8px;"><em>${esc(c.doc)}</em></div>
            <div class="sa-note"><strong>Observed in sandbox:</strong> ${esc(c.sandbox.note)}</div>
            ${r.headline ? `<div class="sa-note" style="margin-top:6px;"><strong>Result:</strong> ${esc(r.headline)}</div>` : ''}
            ${rows ? `<div class="sa-chk"><div class="h"></div><div class="h">Check</div><div class="h">Document expects</div><div class="h">Actual</div>${rows}</div>` : ''}
            <div class="sa-note">${r.instrumentId ? `Source ID <code>${esc(r.instrumentId)}</code> ` : ''}${r.paymentId ? `· payment <code>${esc(r.paymentId)}</code>` : ''}</div>
            <div style="margin-top:6px;">${rtauWebhookChip(c)} <span class="sa-note">card_updated is asynchronous; matching events appear in Live Webhooks below and in the API log.</span></div>`;
        const env = state.rtauEnv[id];
        if (env) renderResponse('sa-rtau-report', env, html);
        else { box.style.display = 'block'; box.innerHTML = `<div class="sa-res-body">${html}</div>`; }
        renderRtauCases();
    }

    // Loads a case into the shared card source and the manual panels above, for hands-on variations.
    async function loadRtauCase(c) {
        const set = (id, v) => { const e = $(id); if (e) e.value = v; };
        set('sa-raw-number', c.card); set('sa-raw-month', +c.exp[0]); set('sa-raw-year', c.exp[1]); set('sa-raw-cvv', '100');
        if (c.via === 'card') { setMode('raw'); }
        else {
            const env = await createRtauInstrument(c);
            if (!env.ok || !env.data?.id) { showToast(`Could not create the Source ID (HTTP ${env.upstream_status})`, 'error'); return; }
            const d = env.data;
            upsertInstrument({ id: d.id, scheme: d.scheme, last4: d.last4, bin: d.bin, expiry_month: d.expiry_month, expiry_year: d.expiry_year, card_type: d.card_type,
                issuer_country: d.issuer_country, fingerprint: d.fingerprint, email: '', customer_id: '', created_at: new Date().toISOString(), label: `RTAU case ${c.id}` });
            $('sa-show-all').checked = true;
            setMode('saved'); renderInstrumentSelect(d.id);
        }
        if (!c.store) {
            set('sa-rt-amount', c.amount); set('sa-rt-prev', '');
            $('sa-rt-mit').checked = !!c.mit; $('sa-rt-allow').checked = true;
            set('sa-rt-pan', c.pan === 'omit' ? '' : (checked('sa-rtau-fpan') ? 'fpan' : ''));
        }
        updateActiveSource(); refreshPreviews();
        showToast(`Case ${c.n} loaded — ${c.store ? 'run the standalone updater (A)' : 'the manual RTAU panel (B) is ready'}`);
        $(c.store ? 'sa-au-btn' : 'sa-rt-btn')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // Raw card → reusable Source ID (RTAU and several other flows only accept an instrument).
    async function saveRawAsInstrument() {
        const c = rawCard();
        if (!c.number || !c.expiry_month || !c.expiry_year) return showToast('Fill in the raw card number and expiry first', 'error');
        const body = { type: 'card', number: c.number, expiry_month: String(c.expiry_month), expiry_year: String(c.expiry_year), processing_channel_id: projectChannel() };
        if (c.cvv) body.cvv = c.cvv;
        if (c.name) body.name = c.name;
        const customer = resolveCustomer();
        if (customer.body) body.customer = customer.body;
        const env = await call('POST', 'instruments', { body, label: 'POST /instruments (Suite — raw card → src_)' });
        if (!env.ok || !env.data?.id) return showToast(`Instrument creation failed (HTTP ${env.upstream_status}) ${env.data?.error_codes ? env.data.error_codes.join(', ') : ''}`, 'error');
        const d = env.data, cust = currentCustomer();
        upsertInstrument({ id: d.id, scheme: d.scheme, last4: d.last4, bin: d.bin, expiry_month: d.expiry_month, expiry_year: d.expiry_year, card_type: d.card_type,
            issuer_country: d.issuer_country, fingerprint: d.fingerprint, email: cust.email || '', customer_id: d.customer?.id || customer.body?.id || cust.customer_id || '', created_at: new Date().toISOString() });
        showToast(`Saved ${d.id} — selected as the active card`);
        setMode('saved'); renderInstrumentSelect(d.id); updateActiveSource(); refreshPreviews();
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
        if (state.product === 'nt') { if (currentNtId()) ids.push(currentNtId()); ids.push(...state.ntIds); }
        if (state.product === 'au') { const i = selectedInstrument(); if (i) ids.push(i.id); ids.push(...state.rtauIds); }
        const pid = state.product === '3ds' ? sessionPaymentId() : state.lastPaymentId;
        if (pid) ids.push(pid);
        return ids;
    }

    function syncWebhookFollow() {
        if (!checked('sa-wh-follow')) return;
        const next = followIds().join(',');
        if (next !== val('sa-wh-match')) { $('sa-wh-match').value = next; resetWebhookView(); }
    }

    // =====================================================================
    // Webhook pipeline — ONE path decides what is listed AND logged
    //   ingest (relevant + not seen before) → whAll (the list) + API log, exactly once per event.
    // Polling always asks for everything from the buffer (since=0, types only) and works out the rest here, so:
    //   • list and API log can never diverge (no "replay" mode that lists without logging),
    //   • a filter change cannot swallow an event that arrives right after it,
    //   • events held by different warm Lambda containers (separate buffers / sequence numbers) all get picked up.
    // =====================================================================
    const loadSeen = () => { try { return new Set(JSON.parse(sessionStorage.getItem(SS_WH_SEEN) || '[]')); } catch (e) { return new Set(); } };
    const persistSeen = () => { try { sessionStorage.setItem(SS_WH_SEEN, JSON.stringify([...state.whSeen].slice(-500))); } catch (e) { /* storage full */ } };
    const whKey = (e) => e.event_id || `${e.type}|${e.created_on}|${e.received_at}`;
    const whIds = () => val('sa-wh-match').split(',').map(x => x.trim()).filter(Boolean);

    // With ids (the session / payment / token being tested) only events mentioning one of them are relevant;
    // with none, the panel is a live view of everything of the selected types.
    function whRelevant(e) {
        const ids = whIds();
        if (!ids.length) return true;
        const hay = JSON.stringify(e.data || {});
        return ids.some(id => hay.includes(id));
    }

    function logWebhook(e) {
        addToApiLog('WEBHOOK', e.type, 200, {}, { id: e.event_id, type: e.type, created_on: e.created_on, data: e.data }, `${API_BASE}/webhook`);
    }

    function ingestWebhook(e) {
        const k = whKey(e);
        if (state.whSeen.has(k) || !whRelevant(e)) return false;
        state.whSeen.add(k);
        state.whAll.set(k, e);
        logWebhook(e);
        return true;
    }

    // Events restored from a snapshot: show them, and log any this tab has not logged yet.
    function adoptWebhooks(list) {
        list.filter(whRelevant).forEach(e => {                          // same rule as the live pipeline: list ≡ log
            const k = whKey(e);
            state.whAll.set(k, e);
            if (!state.whSeen.has(k)) { state.whSeen.add(k); logWebhook(e); }
        });
        persistSeen();
    }

    // Called whenever the filter changes: re-filter what is shown and fetch immediately — nothing is cleared or "replayed".
    function resetWebhookView() {
        state.whBaselined = false;      // live-view mode re-baselines so old buffered events are not dumped on the user
        renderWebhooks();
        pollWebhooks();
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
        const all = [...state.whAll.values()];
        const visible = all.filter(whRelevant).sort((a, b) => String(b.received_at).localeCompare(String(a.received_at)));
        const count = $('sa-wh-count');
        if (count) {
            const hidden = all.length - visible.length;
            count.textContent = `${visible.length} event${visible.length === 1 ? '' : 's'} shown — each one is also in the API log sidebar`
                + (hidden > 0 ? ` · ${hidden} from other sessions hidden by the id filter (clear the field to see them)` : '');
        }
        box.innerHTML = visible.length
            ? visible.slice(0, 50).map(e => `<details class="sa-wh-item"><summary><span class="sa-wh-type">${esc(e.type)}</span>
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
            const q = new URLSearchParams({ since: '0' });            // always the whole buffer: containers have independent sequence numbers
            if (whTypes()) q.set('types', whTypes());
            const res = await fetch(`${API_BASE}/standalone/webhook-events?${q}`);
            if (!res.ok) return;
            const { events } = await res.json();
            // Live-view mode (no ids to follow): first sight of the buffer is the baseline, not news.
            if (!whIds().length && !state.whBaselined) {
                events.forEach(e => state.whSeen.add(whKey(e)));
                state.whBaselined = true;
                persistSeen();
                return;
            }
            let added = 0;
            events.slice().sort((a, b) => String(a.received_at).localeCompare(String(b.received_at))).forEach(e => { if (ingestWebhook(e)) added++; });
            if (added) { persistSeen(); renderWebhooks(); if (state.sid) scheduleSave(); if (state.product === 'nt') { renderNtcCases(); if (state.ntcActive && state.ntcResults[state.ntcActive]) renderNtcReport(state.ntcActive); } if (state.product === 'au') { renderRtauCases(); if (state.rtauActive && state.rtauResults[state.rtauActive]) renderRtauReport(state.rtauActive); } }
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
        // Vault (modules/vault.js) is self-contained: no shared card source, no webhook panel.
        (p === 'vault' ? show : hide)('sa-panel-vault');
        if (p === 'vault') {
            ['3ds', 'nt', 'au', 'meta'].forEach(x => hide(`sa-panel-${x}`));
            hide('sa-card-source'); hide('sa-webhooks');
            window.SuiteVault?.onShow();
            return;
        }
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
        state.whSeen = loadSeen();
        loadRtauState();
        loadNtcState();

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
            const t = ev.target.closest('[data-sa-pan], [data-sa-more], [data-sa-copy], [data-sa-copyres], [data-sa-jump], [data-sa-newsession], [data-sa-preset]');
            if (!t) return;
            if (t.dataset.saPreset) return applyPreset(t.dataset.saPreset);
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
        detectBrowserData();
        renderPresets();
        ['sa-3ds-redirectless', 'sa-3ds-completion-type', 'sa-3ds-challenge'].forEach(id => $(id).addEventListener('change', syncDependentUi));
        $('sa-3ds-detect-btn').addEventListener('click', () => { detectBrowserData(); refreshPreviews(); showToast('Browser data re-detected'); });
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
            if (p.classList.contains('disabled')) return;
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
        $('sa-nt-pay-provision-btn').addEventListener('click', () => runBusy(['sa-nt-pay-provision-btn', 'sa-nt-pay-token-btn', 'sa-ntp-pay-btn'], 'Paying…', payProvision));
        $('sa-nt-pay-token-btn').addEventListener('click', () => runBusy(['sa-nt-pay-token-btn', 'sa-nt-pay-provision-btn', 'sa-ntp-pay-btn'], 'Paying with token…', payWithNt));

        // Network token scenarios + editable pay-with-token form
        renderNtcGroups(); renderNtcCases();
        $('sa-ntc-groups').addEventListener('click', (ev) => { const t = ev.target.closest('[data-sa-ntgroup]'); if (!t) return; state.ntcGroup = t.dataset.saNtgroup; renderNtcGroups(); renderNtcCases(); });
        $('sa-ntc-extras').addEventListener('change', renderNtcCases);
        $('sa-ntc-cases').addEventListener('click', (ev) => {
            const t = ev.target.closest('[data-sa-nt-run], [data-sa-nt-report]');
            if (!t || t.disabled) return;
            if (t.dataset.saNtRun) return runNtcCase(findNtcCase(t.dataset.saNtRun));
            if (t.dataset.saNtReport) { renderNtcReport(t.dataset.saNtReport); $('sa-ntc-report').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
        });
        $('sa-ntc-runall-btn').addEventListener('click', runAllNtc);
        $('sa-ntp-pay-btn').addEventListener('click', () => runBusy(['sa-ntp-pay-btn', 'sa-nt-pay-token-btn', 'sa-nt-pay-provision-btn'], 'Paying…', payNtFromFields));

        // RTAU simulator cases
        renderRtauGroups(); renderRtauCases();
        $('sa-rtau-groups').addEventListener('click', (ev) => { const t = ev.target.closest('[data-sa-rtgroup]'); if (!t) return; state.rtauGroup = t.dataset.saRtgroup; renderRtauGroups(); renderRtauCases(); });
        ['sa-rtau-fpan', 'sa-rtau-extras'].forEach(id => $(id).addEventListener('change', renderRtauCases));
        $('sa-rtau-cases').addEventListener('click', (ev) => {
            const t = ev.target.closest('[data-sa-rt-run], [data-sa-rt-load], [data-sa-rt-report]');
            if (!t || t.disabled) return;
            if (t.dataset.saRtRun) return runRtauCase(findRtauCase(t.dataset.saRtRun));
            if (t.dataset.saRtLoad) return runBusy([], '', () => loadRtauCase(findRtauCase(t.dataset.saRtLoad)));
            if (t.dataset.saRtReport) { renderRtauReport(t.dataset.saRtReport); $('sa-rtau-report').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
        });
        $('sa-rtau-runall-btn').addEventListener('click', runAllRtau);
        $('sa-raw-save-btn').addEventListener('click', () => runBusy(['sa-raw-save-btn'], 'Saving…', saveRawAsInstrument));

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
        $('sa-wh-clear').addEventListener('click', () => { state.whAll.clear(); renderWebhooks(); });   // view only — events stay logged and are not re-added
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
