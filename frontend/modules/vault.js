// =============================================
// Vault — Customers & Instruments (Standalone Suite product)
// Handles: browse / create / update / delete customers and card, SEPA and bank instruments through
//          the Checkout.com Customers + Instruments APIs.
// Backend: POST /standalone/vault (allowlisted proxy: get / patch / delete / create-customer)
//          POST /standalone/instruments (existing route — instrument creation)
// The API has no list endpoints, so the customers/instruments you create or load are remembered in
// localStorage ("cko-vault-directory") and "Refresh all" re-fetches each one for real server state.
// Every request is written to the API log sidebar.
// =============================================

(function () {

    const API_BASE = window.APP_CONFIG?.apiBaseUrl || '';
    const CKO_BASE = 'https://api.sandbox.checkout.com';   // best-effort base for calls made through this app's existing raw routes
    const LS_DIR = 'cko-vault-directory';          // { customers: { cus_… : obj|null }, loose: { src_… : obj|null } }
    const LS_SUITE = 'cko-suite-instruments';      // saved by the other Suite products — used to seed the directory once
    const DEFAULT_CUSTOMER = 'cus_xhsalsrfvkjuxhsxcab2eo4m2y';   // sm_hasnain96@hotmail.com
    const TEST_PANS = [
        ['4242424242424242', 'Visa'], ['5436031030606378', 'Mastercard'],
        ['4485040371536584', 'Visa · 3DS frictionless'], ['4243754271700719', 'Visa · 3DS challenge'],
    ];

    const $ = (id) => document.getElementById(id);
    const val = (id) => $(id)?.value ?? '';
    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const visible = () => $('sa-panel-vault') && $('sa-panel-vault').style.display !== 'none';

    const state = {
        customers: {}, loose: {},
        selected: null,            // { kind: 'customer' | 'loose' | 'new', id? }
        editCust: false, editInst: null, details: {},
        addMode: 'flow', busy: false,
        flow: { comp: null, mounting: false, needs: true },
    };

    // =====================================================================
    // Directory persistence
    // =====================================================================
    function save() {
        try { localStorage.setItem(LS_DIR, JSON.stringify({ customers: state.customers, loose: state.loose, seededDefault: true })); } catch (e) { /* storage full */ }
    }
    function load() {
        let dir = null;
        try { dir = JSON.parse(localStorage.getItem(LS_DIR) || 'null'); } catch (e) { dir = null; }
        if (dir) {
            state.customers = dir.customers || {}; state.loose = dir.loose || {};
            if (!dir.seededDefault) { if (!(DEFAULT_CUSTOMER in state.customers)) state.customers[DEFAULT_CUSTOMER] = null; save(); }
            return;
        }
        // First run: pick up everything the other Suite products already saved (ids only; data arrives on refresh).
        try {
            JSON.parse(localStorage.getItem(LS_SUITE) || '[]').forEach(i => {
                if (i.customer_id) { if (!(i.customer_id in state.customers)) state.customers[i.customer_id] = null; }
                else if (i.id && !(i.id in state.loose)) state.loose[i.id] = null;
            });
        } catch (e) { /* ignore */ }
        if (!(DEFAULT_CUSTOMER in state.customers)) state.customers[DEFAULT_CUSTOMER] = null;
        save();
    }

    // =====================================================================
    // HTTP
    // =====================================================================
    async function request(url, method, body, label) {
        const headers = { 'Content-Type': 'application/json' };
        const mode = val('sa-auth-mode');
        if (mode) headers['x-auth-mode'] = mode;
        let status = 0, env;
        const t0 = performance.now();
        try {
            const res = await fetch(url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
            status = res.status;
            env = await res.json().catch(() => ({ upstream_status: status, data: { error: `Non-JSON response (HTTP ${status}) — is the API Gateway route deployed?` } }));
        } catch (err) {
            env = { upstream_status: 0, data: { error: 'Network error: ' + err.message } };
        }
        if (env.upstream_status === undefined) env = { upstream_status: status, upstream: null, data: env };
        env.ok = env.upstream_status >= 200 && env.upstream_status < 300;
        // Log only the Checkout.com exchange (request body, response body, status, full CKO URL) — not our proxy envelope,
        // and nothing for calls that never reached Checkout.com (those surface as toasts).
        const meta = { duration_ms: Math.round(performance.now() - t0), ...(env.cko_request_id ? { request_id: env.cko_request_id } : {}) };
        const up = String(env.upstream || '').match(/^([A-Z]+)\s+(https?:\/\/\S+)$/);
        if (up) addToApiLog(label.method, label.title || up[2].replace(/^https?:\/\/[^/]+/, ''), env.upstream_status, label.body ?? {}, env.data ?? null, up[2], meta);
        else if (label.url) addToApiLog(label.method, label.title || label.path, env.upstream_status || status, label.body ?? {}, env.data ?? null, label.url, meta);   // existing route that returns the raw CKO body
        return env;
    }
    const vcall = (method, path, body) =>
        request(`${API_BASE}/standalone/vault`, 'POST', { method, path, ...(body !== undefined ? { body } : {}) }, { method, path, body });
    const createInstrumentCall = (body) =>
        request(`${API_BASE}/standalone/instruments`, 'POST', body, { method: 'POST', path: '/instruments', body });

    const errText = (env) => env.data?.error_codes?.join(', ') || env.data?.error || env.data?.error_type || `HTTP ${env.upstream_status}`;

    async function withBusy(fn) {
        if (state.busy) return;
        state.busy = true;
        $('sa-panel-vault')?.classList.add('va-busy');
        try { return await fn(); }
        catch (err) { if (err.message !== 'invalid-input') { console.error('[vault]', err); showToast(err.message || 'Request failed', 'error'); } }
        finally {
            state.busy = false;
            $('sa-panel-vault')?.classList.remove('va-busy');
            render();
        }
    }

    // =====================================================================
    // Data operations
    // =====================================================================
    async function loadCustomer(identifier, { quiet } = {}) {
        const env = await vcall('GET', `/customers/${encodeURIComponent(identifier)}`);
        if (!env.ok) { if (!quiet) showToast(env.upstream_status === 404 ? 'Customer not found' : 'Load failed: ' + errText(env), 'error'); return env; }
        state.customers[env.data.id] = env.data;
        save();
        return env;
    }
    async function loadInstrument(id, { quiet } = {}) {
        const env = await vcall('GET', `/instruments/${encodeURIComponent(id)}`);
        if (!env.ok) { if (!quiet) showToast(env.upstream_status === 404 ? 'Instrument not found' : 'Load failed: ' + errText(env), 'error'); return env; }
        state.details[id] = env.data;
        const cid = env.data.customer?.id;
        if (cid) await loadCustomer(cid, { quiet: true });
        else { state.loose[id] = env.data; save(); }
        return env;
    }

    async function lookup() {
        const v = val('va-lookup').trim();
        if (!v) return;
        const isInst = /^src_/i.test(v);
        const env = isInst ? await loadInstrument(v) : await loadCustomer(v);
        if (!env.ok) return;
        if (isInst) {
            const cid = env.data.customer?.id;
            select(cid ? { kind: 'customer', id: cid } : { kind: 'loose', id: v });
        } else {
            select({ kind: 'customer', id: env.data.id });
        }
        $('va-lookup').value = '';
    }

    async function refreshAll() {
        const ids = Object.keys(state.customers), srcs = Object.keys(state.loose);
        const total = ids.length + srcs.length;
        if (!total) return showToast('Nothing to refresh yet');
        let n = 0, gone = 0;
        const btn = $('va-refresh-btn'), label = btn.textContent;
        for (const id of ids) {
            btn.textContent = `Refreshing ${++n}/${total}…`;
            const env = await loadCustomer(id, { quiet: true });
            if (!env.ok && env.upstream_status === 404) { delete state.customers[id]; gone++; }
        }
        for (const id of srcs) {
            btn.textContent = `Refreshing ${++n}/${total}…`;
            const env = await vcall('GET', `/instruments/${encodeURIComponent(id)}`);
            if (env.ok && env.data.customer?.id) { delete state.loose[id]; await loadCustomer(env.data.customer.id, { quiet: true }); }
            else if (env.ok) state.loose[id] = env.data;
            else if (env.upstream_status === 404) { delete state.loose[id]; gone++; }
        }
        btn.textContent = label;
        save();
        if (state.selected && !exists(state.selected)) state.selected = null;
        showToast(gone ? `Refreshed — ${gone} no longer exist and were removed` : 'Refreshed');
    }
    const exists = (sel) => sel.kind === 'customer' ? sel.id in state.customers : sel.kind === 'loose' ? sel.id in state.loose : true;

    async function createCustomer() {
        const email = val('va-c-email').trim();
        if (!email) return showToast('email is required', 'error');
        const body = { email };
        if (val('va-c-name').trim()) body.name = val('va-c-name').trim();
        const cc = val('va-c-cc').trim(), num = val('va-c-num').trim();
        if (cc || num) body.phone = { country_code: cc, number: num };
        const meta = parseJson(val('va-c-meta'), 'metadata');
        if (meta) body.metadata = meta;
        const env = await vcall('POST', '/customers', body);
        if (!env.ok) return showToast('Create failed: ' + errText(env), 'error');
        const g = await loadCustomer(env.data.id, { quiet: true });
        if (!g.ok) { state.customers[env.data.id] = { id: env.data.id, email, ...(body.name ? { name: body.name } : {}), instruments: [] }; save(); }
        select({ kind: 'customer', id: env.data.id });
        showToast(`Created ${env.data.id}`);
    }

    async function saveCustomer(id) {
        const body = {};
        const f = (k) => val('va-e-' + k).trim();
        const cur = state.customers[id] || {};
        if (f('name') && f('name') !== (cur.name || '')) body.name = f('name');
        if (f('email') && f('email') !== (cur.email || '')) body.email = f('email');
        if (f('cc') || f('num')) body.phone = { country_code: f('cc'), number: f('num') };
        if (f('meta')) { const m = parseJson(f('meta'), 'metadata'); if (!m) return; body.metadata = m; }
        if (f('default') && f('default') !== (cur.default || '')) body.default = f('default');
        if (!Object.keys(body).length) { state.editCust = false; return; }
        const env = await vcall('PATCH', `/customers/${encodeURIComponent(id)}`, body);
        if (!env.ok) return showToast('Update failed: ' + errText(env), 'error');
        state.editCust = false;
        await loadCustomer(id, { quiet: true });
        showToast('Customer updated');
    }

    async function deleteCustomer(id) {
        if (!confirm(`Delete ${id} and ALL of its instruments at Checkout.com?`)) return;
        const env = await vcall('DELETE', `/customers/${encodeURIComponent(id)}`);
        if (!env.ok && env.upstream_status !== 404) return showToast('Delete failed: ' + errText(env), 'error');
        delete state.customers[id];
        save();
        state.selected = null;
        showToast(`Deleted ${id}`);
    }

    async function makeDefault(cus, src) {
        const env = await vcall('PATCH', `/customers/${encodeURIComponent(cus)}`, { default: src });
        if (!env.ok) return showToast('Failed: ' + errText(env), 'error');
        await loadCustomer(cus, { quiet: true });
        showToast(`${src} is now the default`);
    }

    async function saveInstrument(src, type) {
        let body;
        if (type === 'card') {
            body = { type: 'card' };
            const f = (k) => val(`va-i-${k}`).trim();
            if (f('month')) body.expiry_month = parseInt(f('month'), 10);
            if (f('year')) body.expiry_year = parseInt(f('year'), 10);
            if (f('name')) body.name = f('name');
            const holder = {};
            if (f('first')) holder.first_name = f('first');
            if (f('last')) holder.last_name = f('last');
            if (Object.keys(holder).length) body.account_holder = holder;
        } else {
            body = parseJson(val('va-i-json'), 'request');
            if (!body) return;
            body.type = body.type || type;
        }
        const env = await vcall('PATCH', `/instruments/${encodeURIComponent(src)}`, body);
        if (!env.ok) return showToast('Update failed: ' + errText(env), 'error');
        state.editInst = null;
        delete state.details[src];
        await reloadFor(src);
        showToast('Instrument updated');
    }

    async function deleteInstrument(src) {
        if (!confirm(`Delete ${src}?`)) return;
        const env = await vcall('DELETE', `/instruments/${encodeURIComponent(src)}`);
        if (!env.ok && env.upstream_status !== 404) return showToast('Delete failed: ' + errText(env), 'error');
        const owner = ownerOf(src);
        delete state.loose[src]; delete state.details[src];
        save();
        if (owner) await loadCustomer(owner, { quiet: true }); else if (state.selected?.id === src) state.selected = null;
        showToast(`Deleted ${src}`);
    }

    async function showDetails(src) {
        if (state.details[src] && state.details[src] !== 'open') { delete state.details[src]; return; }   // toggle
        const env = await vcall('GET', `/instruments/${encodeURIComponent(src)}`);
        if (env.ok) state.details[src] = env.data; else showToast('Load failed: ' + errText(env), 'error');
    }

    const ownerOf = (src) => Object.values(state.customers).find(c => c?.instruments?.some(i => i.id === src))?.id;
    async function reloadFor(src) {
        const owner = ownerOf(src);
        if (owner) return loadCustomer(owner, { quiet: true });
        const env = await vcall('GET', `/instruments/${encodeURIComponent(src)}`);
        if (env.ok) { state.loose[src] = env.data; save(); }
    }

    // ----- add instrument -----
    function parseJson(text, what) {
        if (!text || !text.trim()) return null;
        try { const v = JSON.parse(text); if (v && typeof v === 'object') return v; } catch (e) { /* fall through */ }
        showToast(`Invalid JSON in ${what}`, 'error');
        return null;
    }
    function deepMerge(t, x) {
        Object.keys(x).forEach(k => {
            if (x[k] && typeof x[k] === 'object' && !Array.isArray(x[k]) && t[k] && typeof t[k] === 'object') deepMerge(t[k], x[k]); else t[k] = x[k];
        });
        return t;
    }
    function customerFragment() {
        const target = val('va-target');
        const def = $('va-add-default').checked ? { default: true } : {};
        if (target === 'none') return undefined;
        if (target === 'new') {
            const email = val('va-nc-email').trim();
            if (!email) { showToast('Enter the new customer\'s email', 'error'); throw new Error('invalid-input'); }
            return { email, ...(val('va-nc-name').trim() ? { name: val('va-nc-name').trim() } : {}), ...def };
        }
        return { id: target, ...def };
    }
    function finalize(body) {
        const raw = val('va-add-extra').trim();
        if (raw) {
            const extra = parseJson(raw, 'extra JSON');
            if (!extra) throw new Error('invalid-input');
            deepMerge(body, extra);
        }
        return body;
    }

    async function submitInstrument(body) {
        const env = await createInstrumentCall(body);
        if (!env.ok || !env.data?.id) { showToast('Create failed: ' + errText(env), 'error'); return false; }
        // SEPA responses omit `customer` — fall back to the customer we asked for, or read it back from the instrument.
        let cid = env.data.customer?.id || body.customer?.id;
        if (!cid && body.customer) cid = (await vcall('GET', `/instruments/${encodeURIComponent(env.data.id)}`)).data?.customer?.id;
        if (cid) { await loadCustomer(cid, { quiet: true }); select({ kind: 'customer', id: cid }); }
        else { state.loose[env.data.id] = env.data; save(); select({ kind: 'loose', id: env.data.id }); }
        showToast(`${env.upstream_status === 200 ? 'Already stored' : 'Created'} ${env.data.id}`);
        return true;
    }

    async function addRaw() {
        const body = finalize({
            type: 'card', number: val('va-raw-number').replace(/\s+/g, ''),
            expiry_month: parseInt(val('va-raw-month'), 10), expiry_year: parseInt(val('va-raw-year'), 10),
            ...(val('va-raw-name').trim() ? { name: val('va-raw-name').trim() } : {}),
            processing_channel_id: window.APP_CONFIG?.processingChannelId,
        });
        const c = customerFragment(); if (c) body.customer = c;
        await submitInstrument(body);
    }
    async function addSepa() {
        const body = finalize({
            type: 'sepa',
            instrument_data: { account_number: val('va-sepa-iban').trim(), country: val('va-sepa-country').trim(), currency: val('va-sepa-currency').trim(), payment_type: val('va-sepa-ptype'), type: val('va-sepa-mtype') },
            account_holder: {
                first_name: val('va-sepa-first'), last_name: val('va-sepa-last'),
                billing_address: { address_line1: val('va-sepa-line1'), address_line2: val('va-sepa-line2'), city: val('va-sepa-city'), zip: val('va-sepa-zip'), country: val('va-sepa-bcountry') },
            },
        });
        const c = customerFragment(); if (c) body.customer = c;
        await submitInstrument(body);
    }
    async function addBank() {
        const holder = { type: val('va-bank-htype') };
        if (holder.type === 'corporate') holder.company_name = val('va-bank-company'); else { holder.first_name = val('va-bank-first'); holder.last_name = val('va-bank-last'); }
        const body = { type: 'bank_account', country: val('va-bank-country').trim(), currency: val('va-bank-currency').trim(), account_holder: holder };
        ['iban', 'bic', 'acct', 'code'].forEach(k => {
            const v = val('va-bank-' + k).trim();
            if (v) body[{ iban: 'iban', bic: 'swift_bic', acct: 'account_number', code: 'bank_code' }[k]] = v;
        });
        finalize(body);
        const c = customerFragment(); if (c) body.customer = c;
        await submitInstrument(body);
    }


    // ----- Stored cards in Flow -----
    let sfRendered = false, sfBusy = false;
    async function renderStoredFlow() {
        if (sfBusy) return;
        sfBusy = true;
        const btn = $('va-sf-btn'), label = btn.textContent;
        btn.disabled = true; btn.textContent = 'Rendering…';
        const host = $('va-sf-host');
        try {
            const cus = val('va-sf-cus').trim(), email = val('va-sf-email').trim();
            if (!cus) throw new Error('Enter a customer id (cus_…)');
            host.innerHTML = '';
            const body = {
                amount: parseInt(val('va-sf-amount'), 10) || 1000,
                currency: val('va-sf-currency'),
                reference: `vault-stored-${Date.now()}`,
                billing: { address: { country: val('va-sf-country').trim() || 'DE' } },
                customer: { id: cus, ...(email ? { email } : {}) },
                payment_method_configuration: {
                    card: { store_payment_details: 'collect_consent' },
                    stored_card: { customer_id: cus },
                },
                disabled_payment_methods: ['remember_me'],
                processing_channel_id: window.APP_CONFIG.processingChannelId,
                success_url: `${window.location.origin}/success.html`,
                failure_url: `${window.location.origin}/failure.html`,
            };
            const env = await request(`${API_BASE}/payment-sessions`, 'POST', body, { method: 'POST', path: '/payment-sessions', title: '/payment-sessions (Vault — stored cards)', url: `${CKO_BASE}/payment-sessions`, body });
            if (!env.data?.id) throw new Error(errText(env) || 'Payment session creation failed');
            const checkout = await CheckoutWebComponents({
                publicKey: window.APP_CONFIG.publicKey, environment: 'sandbox', locale: 'en-GB', paymentSession: env.data,
                componentOptions: { stored_card: { displayMode: 'all', ...($('va-sf-cvv').checked ? { captureCardCvv: true } : {}) } },
                appearance: getFlowAppearance(),
                onError: (_c, e) => { console.error('Vault stored-card Flow error:', e); showToast(e?.message || 'Flow error', 'error'); },
            });
            const flow = checkout.create('flow');
            if (await flow.isAvailable()) flow.mount(host);
            sfRendered = true;
            $('va-sf-clear').style.display = '';
        } catch (err) {
            showToast(err.message || 'Failed to render Flow', 'error');
        } finally {
            btn.disabled = false; btn.textContent = label; sfBusy = false;
        }
    }

    // ----- Flow tokenization -----
    async function mountFlow() {
        const f = state.flow;
        if (f.mounting || !f.needs || !visible() || state.addMode !== 'flow') return;
        f.mounting = true; f.needs = false;
        const host = $('va-flow-host');
        host.innerHTML = '';
        $('va-flow-loading').style.display = '';
        $('va-flow-btn').disabled = true;
        try {
            const sessionBody = {
                amount: 100, currency: 'EUR', processing_channel_id: window.APP_CONFIG.processingChannelId,
                reference: `vault-tokenize-${Date.now()}`,
                success_url: `${window.location.origin}/success.html`, failure_url: `${window.location.origin}/failure.html`,
                disabled_payment_methods: ['remember_me'], billing: { address: { country: 'DE' } },
            };
            const env = await request(`${API_BASE}/payment-sessions`, 'POST', sessionBody, { method: 'POST', path: '/payment-sessions', title: '/payment-sessions (Vault tokenizer)', url: `${CKO_BASE}/payment-sessions`, body: sessionBody });
            if (!env.data?.id) throw new Error('Payment session creation failed');
            const checkout = await CheckoutWebComponents({
                publicKey: window.APP_CONFIG.publicKey, environment: 'sandbox', locale: 'en-GB', paymentSession: env.data,
                componentOptions: { card: { data: { cardholderName: 'Test Cardholder' }, displayCardholderName: 'bottom' } },
                appearance: getFlowAppearance(),
                onReady: () => {}, onChange: () => {}, onError: (_c, e) => console.error('Vault tokenizer error:', e),
            });
            f.comp = checkout.create('card', { showPayButton: false });
            if (await f.comp.isAvailable()) f.comp.mount(host);
            $('va-flow-btn').disabled = false;
        } catch (err) {
            f.needs = true;
            showToast('Failed to load card field: ' + err.message, 'error');
        } finally {
            $('va-flow-loading').style.display = 'none';
            f.mounting = false;
        }
    }

    async function addFlow() {
        if (!state.flow.comp) return showToast('Card field is not ready yet', 'error');
        const { data } = await state.flow.comp.tokenize();
        if (!data?.token) throw new Error('Tokenization returned no token');
        const body = finalize({ type: 'token', token: data.token });
        const c = customerFragment(); if (c) body.customer = c;
        const ok = await submitInstrument(body);
        state.flow.needs = true;                 // the field has been used — mount a fresh one
        if (!ok) return;
    }

    // =====================================================================
    // Rendering
    // =====================================================================
    const chip = (v, label) => v ? `<span class="va-chip" data-va-copy="${esc(v)}" title="Click to copy">${esc(label || v)}</span>` : '';
    const custName = (c, id) => c?.name || c?.email || id;
    const tail4 = (v) => (v ? String(v).replace(/\s+/g, '').slice(-4) : '');
    const instLabel = (i) => {
        if (i.type === 'card') return `${(i.scheme || 'CARD').toUpperCase()} •••• ${i.last4 || '????'}`;
        const t = tail4(i.instrument_data?.account_number || i.iban || i.account_number);
        return `${String(i.type || 'instrument').replace('_', ' ').toUpperCase()}${t ? ' •••• ' + t : ''}`;
    };

    function select(sel) {
        state.selected = sel; state.editCust = false; state.editInst = null;
        if (sel?.kind === 'customer') {
            const picked = state.customers[sel.id];
            if ($('va-sf-cus')) { $('va-sf-cus').value = sel.id; if (picked?.email) $('va-sf-email').value = picked.email; }
            const t = $('va-target');
            populateTarget();
            if (t && sel.id in state.customers) t.value = sel.id;
            syncTarget();
        }
    }

    function renderList() {
        const cs = Object.entries(state.customers), ls = Object.entries(state.loose);
        const sel = state.selected;
        let html = `<div class="va-list-h">Customers (${cs.length})</div>`;
        html += cs.length ? cs.map(([id, c]) => {
            const n = c?.instruments?.length;
            const def = c?.instruments?.find(i => i.id === c.default);
            return `<div class="va-row ${sel?.kind === 'customer' && sel.id === id ? 'active' : ''}" data-va-act="select" data-kind="customer" data-id="${esc(id)}">
                <div class="t">${esc(custName(c, id))}</div>
                <div class="s">${esc(id)}</div>
                <div class="s">${c ? `${n} card${n === 1 ? '' : 's'}${def ? ' · default •••• ' + esc(def.last4 || '') : ''}` : 'not loaded — Refresh all'}</div>
            </div>`;
        }).join('') : '<div class="va-row"><div class="s">None yet. Use + Customer, or Load an id.</div></div>';
        if (ls.length) {
            html += `<div class="va-list-h" style="border-top:1px solid var(--border);">Unlinked instruments (${ls.length})</div>`;
            html += ls.map(([id, i]) => `<div class="va-row ${sel?.kind === 'loose' && sel.id === id ? 'active' : ''}" data-va-act="select" data-kind="loose" data-id="${esc(id)}">
                <div class="t">${esc(i ? instLabel(i) : id)}</div><div class="s">${esc(id)}</div></div>`).join('');
        }
        $('va-list').innerHTML = html;
    }

    function fieldsRow(items) {
        return `<div class="sa-grid three">${items.map(([id, label, v, ph]) =>
            `<div><label for="${id}">${esc(label)}</label><input type="text" id="${id}" class="text-input" value="${esc(v ?? '')}" ${ph ? `placeholder="${esc(ph)}"` : ''}></div>`).join('')}</div>`;
    }

    function instTile(i, cus, isDefault) {
        const d = state.details[i.id];
        const known = d && typeof d === 'object' ? d : null;
        const sub = [
            i.type === 'card' ? `exp ${String(i.expiry_month || '').padStart(2, '0')}/${i.expiry_year || ''}` : null,
            i.card_type, i.issuer_country || i.country || i.instrument_data?.country, i.currency || i.instrument_data?.currency, i.instrument_data?.payment_type,
            (known?.name || i.name), [i.account_holder?.first_name, i.account_holder?.last_name].filter(Boolean).join(' ') || null,
        ].filter(Boolean).join(' · ');
        let edit = '';
        if (state.editInst === i.id) {
            edit = i.type === 'card'
                ? `<div class="va-form">${fieldsRow([['va-i-month', 'expiry_month', i.expiry_month], ['va-i-year', 'expiry_year', i.expiry_year], ['va-i-name', 'name', known?.name || i.name || '']])}
                   ${fieldsRow([['va-i-first', 'account_holder.first_name', ''], ['va-i-last', 'account_holder.last_name', '']])}
                   <div class="va-actions" style="margin-top:10px;"><button class="main-button" data-va-act="save-inst" data-id="${esc(i.id)}" data-type="card" type="button">Save</button><button class="copy-btn" data-va-act="cancel" type="button">Cancel</button></div></div>`
                : `<div class="va-form"><textarea id="va-i-json" class="sa-textarea" placeholder='{ "account_holder": { … } }'>{}</textarea>
                   <div class="va-actions" style="margin-top:10px;"><button class="main-button" data-va-act="save-inst" data-id="${esc(i.id)}" data-type="${esc(i.type)}" type="button">Save</button><button class="copy-btn" data-va-act="cancel" type="button">Cancel</button></div></div>`;
        }
        return `<div class="va-card ${isDefault ? 'def' : ''}">
            <div class="top"><span class="num">${esc(instLabel(i))}</span>${isDefault ? '<span class="va-badge def">DEFAULT</span>' : `<span class="va-badge">${esc(i.type)}</span>`}</div>
            <div class="sub">${esc(sub)}</div>
            <div>${chip(i.id)}${chip(i.fingerprint, 'fingerprint')}</div>
            <div class="btns">
                ${cus && !isDefault ? `<button class="copy-btn" data-va-act="default" data-cus="${esc(cus)}" data-id="${esc(i.id)}" type="button">Make default</button>` : ''}
                <button class="copy-btn" data-va-act="edit-inst" data-id="${esc(i.id)}" type="button">Edit</button>
                <button class="copy-btn" data-va-act="details" data-id="${esc(i.id)}" type="button">${known ? 'Hide' : 'Details'}</button>
                <button class="copy-btn va-danger" data-va-act="del-inst" data-id="${esc(i.id)}" type="button">Delete</button>
            </div>
            ${edit}
            ${known ? `<pre class="sa-preview" style="margin-top:8px;">${esc(JSON.stringify(known, null, 2))}</pre>` : ''}
        </div>`;
    }

    function renderDetail() {
        const sel = state.selected, box = $('va-detail');
        if (!sel) { box.innerHTML = '<div class="va-empty">Select a customer, load one, or create one.</div>'; return; }

        if (sel.kind === 'new') {
            box.innerHTML = `<div class="va-head"><h3>New customer</h3></div><div class="va-form" style="border-top:0; margin-top:0;">
                <div class="sa-grid">
                    <div><label for="va-c-email">email *</label><input type="email" id="va-c-email" class="text-input" placeholder="test.user@example.com"></div>
                    <div><label for="va-c-name">name</label><input type="text" id="va-c-name" class="text-input" value="Test Customer"></div>
                    <div><label for="va-c-cc">phone.country_code</label><input type="text" id="va-c-cc" class="text-input" placeholder="+44"></div>
                    <div><label for="va-c-num">phone.number</label><input type="text" id="va-c-num" class="text-input" placeholder="7700900123"></div>
                </div>
                <label class="sa-lbl" for="va-c-meta" style="margin-top:10px;">metadata (JSON, optional)</label>
                <textarea id="va-c-meta" class="sa-textarea" placeholder='{ "coupon_code": "NY2018" }'></textarea>
                <div class="va-actions" style="margin-top:10px;"><button class="main-button" data-va-act="create-cust" type="button">Create customer</button><button class="copy-btn" data-va-act="cancel" type="button">Cancel</button></div></div>`;
            return;
        }

        if (sel.kind === 'loose') {
            const i = state.loose[sel.id];
            box.innerHTML = `<div class="va-head"><h3>Unlinked instrument</h3></div>` +
                (i ? `<div class="va-cards">${instTile(i, null, false)}</div>` : `<div class="va-empty">${chip(sel.id)} — not loaded, press Refresh all.</div>`);
            return;
        }

        const c = state.customers[sel.id];
        if (!c) { box.innerHTML = `<div class="va-head"><h3>${esc(sel.id)}</h3></div><div class="va-empty">Not loaded — press Refresh all.</div>`; return; }
        const meta = Object.entries(c.metadata || {});
        let edit = '';
        if (state.editCust) {
            edit = `<div class="va-form"><div class="sa-grid">
                <div><label for="va-e-name">name</label><input type="text" id="va-e-name" class="text-input" value="${esc(c.name || '')}"></div>
                <div><label for="va-e-email">email</label><input type="email" id="va-e-email" class="text-input" value="${esc(c.email || '')}"></div>
                <div><label for="va-e-cc">phone.country_code</label><input type="text" id="va-e-cc" class="text-input" value="${esc(c.phone?.country_code || '')}"></div>
                <div><label for="va-e-num">phone.number</label><input type="text" id="va-e-num" class="text-input" value="${esc(c.phone?.number || '')}"></div>
                <div><label for="va-e-default">default instrument</label><select id="va-e-default" class="select-input"><option value="">(unchanged)</option>${(c.instruments || []).map(i => `<option value="${esc(i.id)}">${esc(instLabel(i))} — ${esc(i.id)}</option>`).join('')}</select></div>
            </div>
            <label class="sa-lbl" for="va-e-meta" style="margin-top:10px;">metadata (JSON — replaces the existing metadata)</label>
            <textarea id="va-e-meta" class="sa-textarea">${esc(meta.length ? JSON.stringify(c.metadata, null, 2) : '')}</textarea>
            <div class="va-actions" style="margin-top:10px;"><button class="main-button" data-va-act="save-cust" data-id="${esc(c.id)}" type="button">Save</button><button class="copy-btn" data-va-act="cancel" type="button">Cancel</button></div></div>`;
        }
        box.innerHTML = `
            <div class="va-head">
                <div>
                    <h3>${esc(custName(c, c.id))}</h3>
                    <div style="margin-top:6px;">${chip(c.id)}${c.email ? chip(c.email) : ''}${c.phone ? chip(`${c.phone.country_code} ${c.phone.number}`) : ''}</div>
                    ${meta.length ? `<div class="va-meta">${meta.map(([k, v]) => `${esc(k)}: ${esc(typeof v === 'object' ? JSON.stringify(v) : v)}`).join(' · ')}</div>` : ''}
                </div>
                <div class="va-actions">
                    <button class="copy-btn" data-va-act="edit-cust" type="button">Edit</button>
                    <button class="copy-btn" data-va-act="details-cust" data-id="${esc(c.id)}" type="button">${state.details[c.id] ? 'Hide' : 'Details'}</button>
                    <button class="copy-btn va-danger" data-va-act="del-cust" data-id="${esc(c.id)}" type="button">Delete</button>
                </div>
            </div>
            ${edit}
            ${state.details[c.id] ? `<pre class="sa-preview" style="margin-top:10px;">${esc(JSON.stringify(c, null, 2))}</pre>` : ''}
            <div class="va-cards">${(c.instruments || []).length
                ? c.instruments.map(i => instTile(i, c.id, i.id === c.default)).join('')
                : '<div class="va-empty">No instruments — add one below.</div>'}</div>`;
    }

    function populateTarget() {
        const t = $('va-target'); if (!t) return;
        const prev = t.value;
        t.innerHTML = Object.entries(state.customers).map(([id, c]) => `<option value="${esc(id)}">${esc(custName(c, id))} (${esc(id)})</option>`).join('')
            + '<option value="new">New customer (from email)…</option><option value="none">None (unlinked)</option>';
        if ([...t.options].some(o => o.value === prev)) t.value = prev;
        else t.value = Object.keys(state.customers)[0] || 'new';
        syncTarget();
    }
    function syncTarget() {
        $('va-newcust-fields').style.display = val('va-target') === 'new' ? '' : 'none';
        $('va-add-default').disabled = val('va-target') === 'none';
    }

    function render() { renderList(); renderDetail(); populateTarget(); }

    function setAddMode(mode) {
        state.addMode = mode;
        document.querySelectorAll('#va-add-pills .sa-pill').forEach(p => p.classList.toggle('active', p.dataset.vaAdd === mode));
        ['flow', 'raw', 'sepa', 'bank'].forEach(m => { $('va-add-' + m).style.display = m === mode ? '' : 'none'; });
        if (mode === 'flow') mountFlow();
    }

    // =====================================================================
    // Events
    // =====================================================================
    async function copy(el) {
        const v = el.dataset.vaCopy;
        try { await navigator.clipboard.writeText(v); }
        catch (e) { const t = document.createElement('textarea'); t.value = v; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); }
        el.classList.add('copied'); setTimeout(() => el.classList.remove('copied'), 900);
    }

    function onClick(ev) {
        const cp = ev.target.closest('[data-va-copy]');
        if (cp) { ev.stopPropagation(); return copy(cp); }
        const pan = ev.target.closest('[data-va-pan]');
        if (pan) { $('va-raw-number').value = pan.dataset.vaPan; return; }
        const pill = ev.target.closest('#va-add-pills [data-va-add]');
        if (pill) return setAddMode(pill.dataset.vaAdd);
        const el = ev.target.closest('[data-va-act]');
        if (!el) return;
        const id = el.dataset.id, act = el.dataset.vaAct;
        switch (act) {
            case 'select': return select({ kind: el.dataset.kind, id }) || render();
            case 'cancel': state.editCust = false; state.editInst = null; if (state.selected?.kind === 'new') state.selected = null; return render();
            case 'edit-cust': state.editCust = true; return render();
            case 'edit-inst': state.editInst = id; return render();
            case 'save-cust': return withBusy(() => saveCustomer(id));
            case 'del-cust': return withBusy(() => deleteCustomer(id));
            case 'default': return withBusy(() => makeDefault(el.dataset.cus, id));
            case 'save-inst': return withBusy(() => saveInstrument(id, el.dataset.type));
            case 'del-inst': return withBusy(() => deleteInstrument(id));
            case 'details': return withBusy(() => showDetails(id));
            case 'details-cust':
                if (state.details[id]) { delete state.details[id]; return render(); }
                return withBusy(async () => { const env = await loadCustomer(id); if (env.ok) state.details[id] = true; });
            case 'create-cust': return withBusy(createCustomer);
        }
    }

    function onShow() {
        if (!$('sa-panel-vault')) return;
        render();
        if (state.addMode === 'flow') mountFlow();
        // First visit after seeding: fetch real data for ids that were only remembered.
        const unloaded = Object.values(state.customers).some(v => v === null) || Object.values(state.loose).some(v => v === null);
        if (unloaded && !state.busy) withBusy(refreshAll);
    }

    function init() {
        if (!$('sa-panel-vault')) return;
        load();
        $('va-raw-cards').innerHTML = TEST_PANS.map(([p, l]) => `<span class="sa-chip" data-va-pan="${p}">${esc(l)} <small>${p.slice(0, 4)}…${p.slice(-4)}</small></span>`).join('');
        $('sa-panel-vault').addEventListener('click', onClick);
        $('va-load-btn').addEventListener('click', () => withBusy(lookup));
        $('va-lookup').addEventListener('keydown', (e) => { if (e.key === 'Enter') withBusy(lookup); });
        $('va-refresh-btn').addEventListener('click', () => withBusy(refreshAll));
        $('va-new-cust-btn').addEventListener('click', () => { select({ kind: 'new' }); render(); });
        $('va-forget-btn').addEventListener('click', () => {
            if (!confirm('Forget the saved list in this browser? (Nothing is deleted at Checkout.com.)')) return;
            state.customers = {}; state.loose = {}; state.selected = null; save(); render();
        });
        $('va-target').addEventListener('change', syncTarget);
        $('va-sf-btn').addEventListener('click', renderStoredFlow);
        $('va-sf-clear').addEventListener('click', () => { $('va-sf-host').innerHTML = ''; $('va-sf-clear').style.display = 'none'; sfRendered = false; });
        $('va-flow-btn').addEventListener('click', () => withBusy(addFlow));
        $('va-raw-btn').addEventListener('click', () => withBusy(addRaw));
        $('va-sepa-btn').addEventListener('click', () => withBusy(addSepa));
        $('va-bank-btn').addEventListener('click', () => withBusy(addBank));
        document.addEventListener('themechange', () => { if (visible() && state.addMode === 'flow' && !state.flow.mounting) { state.flow.needs = true; mountFlow(); } if (visible() && sfRendered) renderStoredFlow(); });
        render();
    }

    window.SuiteVault = { onShow };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

})();
