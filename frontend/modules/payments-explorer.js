// =============================================
// Payments Explorer
// Handles: find any payment on the account (Payment Search API), open it to see its details, balances,
//          action history and webhooks, and run capture / void / refund on it.
// Backend: POST /standalone/vault (allowlisted proxy — payments search / get / actions / captures / voids /
//          refunds) and the existing GET /standalone/webhook-events buffer for the webhook timeline.
// Every request is written to the API log sidebar (Checkout.com request + response only).
// =============================================

(function () {

    const API_BASE = window.APP_CONFIG?.apiBaseUrl || '';

    const $ = (id) => document.getElementById(id);
    const val = (id) => $(id)?.value ?? '';
    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const tabActive = () => $('payments-tab')?.classList.contains('active');

    const state = { results: [], selected: null, pay: null, actions: [], events: [], busy: false, loaded: false, lastQuery: null, timers: [] };

    // =====================================================================
    // HTTP — everything goes through the allowlisted proxy; only the Checkout.com exchange is logged
    // =====================================================================
    async function pcall(method, path, body) {
        const t0 = performance.now();
        let status = 0, env;
        try {
            const res = await fetch(`${API_BASE}/standalone/vault`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ method, path, ...(body !== undefined ? { body } : {}) }),
            });
            status = res.status;
            env = await res.json().catch(() => ({ upstream_status: status, data: { error: `Non-JSON response (HTTP ${status}) — is POST /standalone/vault deployed in API Gateway?` } }));
        } catch (err) {
            env = { upstream_status: 0, data: { error: 'Network error: ' + err.message } };
        }
        if (env.upstream_status === undefined) env = { upstream_status: status, upstream: null, data: env };
        env.ok = env.upstream_status >= 200 && env.upstream_status < 300;
        const up = String(env.upstream || '').match(/^([A-Z]+)\s+(https?:\/\/\S+)$/);
        if (up) {
            addToApiLog(method, up[2].replace(/^https?:\/\/[^/]+/, ''), env.upstream_status, body ?? {}, env.data ?? null, up[2],
                { duration_ms: Math.round(performance.now() - t0), ...(env.cko_request_id ? { request_id: env.cko_request_id } : {}) });
        }
        return env;
    }
    const errText = (env) => env.data?.error_codes?.join(', ') || env.data?.error_type || env.data?.error || `HTTP ${env.upstream_status}`;

    // One request at a time (buttons are locked while it runs). A click that arrives meanwhile is not dropped: the
    // most recent one is queued and runs as soon as the current request finishes.
    async function withBusy(fn) {
        if (state.busy) { state.queued = fn; return; }
        state.busy = true;
        $('pe-root').classList.add('pe-busy');
        try { return await fn(); }
        catch (err) { console.error('[payments]', err); showToast(err.message || 'Request failed', 'error'); }
        finally {
            state.busy = false; $('pe-root').classList.remove('pe-busy'); render();
            const next = state.queued; state.queued = null;
            if (next) withBusy(next);
        }
    }

    // =====================================================================
    // Helpers
    // =====================================================================
    function money(amount, currency) {
        if (amount === undefined || amount === null) return '—';
        const base = (typeof CURRENCIES !== 'undefined' && CURRENCIES.find(c => c.iso4217 === currency)?.base) || 100;
        const n = amount / base;
        try { return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(n); }
        catch (e) { return `${n.toFixed(Math.log10(base))} ${currency || ''}`.trim(); }
    }
    function statusClass(s) {
        const v = String(s || '').toLowerCase();
        if (/^(captured|paid|authorized|card verified)$/.test(v)) return 'good';
        if (/refund/.test(v)) return 'info';
        if (/pending|requested|partially|deferred|retry/.test(v)) return 'warn';
        if (/declin|cancel|void|expire|reject|fail|return|flag|disput/.test(v)) return 'bad';
        return '';
    }
    const badge = (s) => `<span class="pe-badge ${statusClass(s)}">${esc(s || 'unknown')}</span>`;
    const chip = (v, label) => v ? `<span class="pe-chip" data-pe-copy="${esc(v)}" title="Click to copy">${esc(label || v)}</span>` : '';
    const ago = (iso) => {
        if (!iso) return '';
        const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
        if (s < 60) return `${s}s ago`; if (s < 3600) return `${Math.round(s / 60)}m ago`; if (s < 86400) return `${Math.round(s / 3600)}h ago`; return `${Math.round(s / 86400)}d ago`;
    };
    const kvRow = (k, v) => (v === undefined || v === null || v === '') ? '' : `<div><div class="k">${esc(k)}</div><div class="v">${v}</div></div>`;

    // =====================================================================
    // Search
    // =====================================================================
    // Free text → the right search field; anything containing `:` is treated as a raw query (documented syntax).
    function termFor(text) {
        const t = text.trim();
        if (!t) return '';
        if (/^pay_/i.test(t)) return `id:'${t}'`;
        if (t.includes(':')) return t;
        if (/^\S+@\S+\.\S+$/.test(t)) return `email:'${t}'`;
        if (/^\d{4}$/.test(t)) return `last4:'${t}'`;
        return `reference:'${t.replace(/'/g, "\\'")}'`;
    }
    function buildSearch() {
        const parts = [];
        const free = termFor(val('pe-q'));
        if (free) parts.push(free);
        if (val('pe-status')) parts.push(`status:'${val('pe-status')}'`);
        if (val('pe-currency')) parts.push(`currency:'${val('pe-currency')}'`);
        const body = { limit: parseInt(val('pe-limit'), 10) || 20 };
        if (parts.length) body.query = parts.join(' AND ');
        const days = parseInt(val('pe-period'), 10);
        if (days) { body.from = new Date(Date.now() - days * 86400000).toISOString(); body.to = new Date().toISOString(); }
        return body;
    }

    async function runSearch() {
        const body = buildSearch();
        state.lastQuery = body;
        $('pe-query-note').innerHTML = body.query ? `query: <code>${esc(body.query)}</code>` : 'No filter — newest payments first.';
        const env = await pcall('POST', '/payments/search', body);
        if (!env.ok) {
            state.results = [];
            const scope = env.upstream_status === 401 || env.upstream_status === 403;
            showToast(scope ? 'Search needs the payments:search scope on the API key' : 'Search failed: ' + errText(env), 'error');
            return;
        }
        state.results = env.data?.data || [];
        state.loaded = true;
        const direct = /^pay_/i.test(val('pe-q').trim()) ? val('pe-q').trim() : null;
        if (direct && !state.results.some(p => p.id === direct)) await loadPayment(direct);   // search index can lag a fresh payment
        else if (state.results.length && !state.results.some(p => p.id === state.selected)) await loadPayment(state.results[0].id, { quiet: true });   // the open payment is not in these results — show the first one
        else if (state.selected && state.results.some(p => p.id === state.selected)) await loadPayment(state.selected, { quiet: true });
    }

    // =====================================================================
    // Payment detail
    // =====================================================================
    async function loadPayment(id, { quiet } = {}) {
        state.selected = id;
        const [d, a] = await Promise.all([pcall('GET', `/payments/${encodeURIComponent(id)}`), pcall('GET', `/payments/${encodeURIComponent(id)}/actions`)]);
        if (!d.ok) {
            if (!quiet) showToast(d.upstream_status === 404 ? 'Payment not found' : 'Load failed: ' + errText(d), 'error');
            if (d.upstream_status === 404 && state.selected === id) { state.pay = null; state.actions = []; }
            return false;
        }
        state.pay = d.data;
        state.actions = a.ok && Array.isArray(a.data) ? a.data : [];
        await loadEvents(id);
        return true;
    }

    async function loadEvents(id) {
        try {
            const res = await fetch(`${API_BASE}/standalone/webhook-events?match=${encodeURIComponent(id)}`);
            const j = await res.json();
            state.events = res.ok ? (j.events || []).slice().reverse() : [];
        } catch (e) { state.events = []; }
    }

    // Capture / void / refund bodies are exactly what the API accepts: optional amount + reference.
    async function runAction(kind) {
        const id = state.selected;
        const body = {};
        const amt = parseInt(val('pe-amount'), 10);
        if (amt) body.amount = amt;
        if (val('pe-reference').trim()) body.reference = val('pe-reference').trim();
        if (kind !== 'voids' && !amt && !confirm(`${kind === 'refunds' ? 'Refund' : 'Capture'} the FULL remaining amount?`)) return;
        const env = await pcall('POST', `/payments/${encodeURIComponent(id)}/${kind}`, body);
        if (!env.ok) return showToast(`${kind.slice(0, -1)} failed: ${errText(env)}`, 'error');
        showToast(`${kind.slice(0, -1)} accepted (${env.data?.action_id || env.upstream_status})`);
        await loadPayment(id, { quiet: true });
        // The final state and the webhook arrive a moment later — re-check a few times without blocking the UI.
        state.timers.forEach(clearTimeout);
        state.timers = [3000, 8000, 15000].map(ms => setTimeout(async () => { if (state.selected === id && tabActive() && !state.busy) { await loadPayment(id, { quiet: true }); render(); } }, ms));
    }

    // =====================================================================
    // Rendering
    // =====================================================================
    function renderList() {
        const box = $('pe-list');
        if (!state.loaded && !state.results.length) { box.innerHTML = '<div class="pe-empty">Searching…</div>'; return; }
        if (!state.results.length) { box.innerHTML = '<div class="pe-empty">No payments match.<br><span class="pe-note">A payment created seconds ago can take a few moments to become searchable — try ↻ Refresh, or paste its <code>pay_…</code> id.</span></div>'; return; }
        box.innerHTML = state.results.map(p => `
            <div class="pe-row ${p.id === state.selected ? 'active' : ''}" data-pe-select="${esc(p.id)}">
                <div class="a"><span>${esc(money(p.amount, p.currency))}</span>${badge(p.status)}</div>
                <div class="b">${esc(p.reference || '—')}</div>
                <div class="c">${esc(p.id)} · ${esc(ago(p.requested_on))}</div>
            </div>`).join('');
    }

    function sourceText(src) {
        if (!src) return '';
        if (src.type === 'card' || src.last4) return `${esc(src.scheme || 'Card')} •••• ${esc(src.last4 || '????')}${src.expiry_month ? ` · ${esc(String(src.expiry_month).padStart(2, '0'))}/${esc(src.expiry_year)}` : ''}${src.card_wallet_type ? ` · ${esc(src.card_wallet_type)}` : ''}`;
        return esc(src.type || '');
    }

    function renderDetail() {
        const box = $('pe-detail');
        const p = state.pay;
        if (!p) { box.innerHTML = '<div class="pe-empty">Select a payment, or search by <code>pay_…</code>.</div>'; return; }
        const bal = p.balances || {};
        const links = p._links || {};
        const can = {
            captures: !!links.capture || (bal.available_to_capture > 0),
            voids: !!links.void || (bal.available_to_void > 0),
            refunds: !!links.refund || (bal.available_to_refund > 0),
        };
        const balRows = ['total_authorized', 'total_captured', 'total_refunded', 'total_voided', 'available_to_capture', 'available_to_void', 'available_to_refund']
            .filter(k => bal[k] !== undefined && (bal[k] || k.startsWith('total_authorized')))
            .map(k => kvRow(k.replace(/_/g, ' '), esc(money(bal[k], p.currency))));
        const tds = p['3ds'] || {};
        const btn = (kind, label) => `<button class="${kind === 'refunds' ? 'copy-btn' : 'main-button'}" data-pe-act="${kind}" type="button" ${can[kind] ? '' : `disabled title="Not available — the payment has no ${kind.slice(0, -1)} link"`}>${label}</button>`;

        box.innerHTML = `
            <div class="pe-head">
                <h3>${esc(money(p.amount, p.currency))} ${badge(p.status)}${p.approved === false ? '<span class="pe-badge bad">not approved</span>' : ''}</h3>
                <div><button class="copy-btn" data-pe-act="raw" type="button">${state.showRaw ? 'Hide JSON' : 'Raw JSON'}</button></div>
            </div>
            <div style="margin-top:8px;">${chip(p.id)}${chip(p.reference, p.reference ? 'ref: ' + p.reference : '')}${chip(p.source?.id)}${chip(p.customer?.id)}${chip(p.customer?.email)}</div>
            ${state.showRaw ? `<pre class="pe-ev" style="padding:10px; max-height:320px; overflow:auto; font-size:11px; white-space:pre-wrap; word-break:break-all; font-family:'JetBrains Mono', monospace;">${esc(JSON.stringify(p, null, 2))}</pre>` : ''}
            <div class="pe-kv">
                ${kvRow('Source', sourceText(p.source))}
                ${kvRow('Response', p.response_code ? `${esc(p.response_code)} ${esc(p.response_summary || '')}` : (state.actions[0]?.response_code ? `${esc(state.actions[0].response_code)} ${esc(state.actions[0].response_summary || '')}` : ''))}
                ${kvRow('Payment type', esc(p.payment_type))}
                ${kvRow('Issuer country', esc(p.source?.issuer_country))}
                ${kvRow('3DS', tds.version || tds.eci ? esc([tds.version && 'v' + tds.version, tds.eci && 'eci ' + tds.eci].filter(Boolean).join(' · ')) : (p.eci ? 'eci ' + esc(p.eci) : ''))}
                ${kvRow('Risk', p.risk ? esc(`${p.risk.flagged ? 'flagged' : 'not flagged'}${p.risk.score !== undefined ? ' · score ' + p.risk.score : ''}`) : '')}
                ${kvRow('Processing channel', esc(p.processing_channel_id))}
                ${kvRow('Acquirer txn id', esc(p.processing?.acquirer_transaction_id))}
                ${kvRow('Requested', p.requested_on ? esc(new Date(p.requested_on).toLocaleString()) + ' · ' + esc(ago(p.requested_on)) : '')}
                ${kvRow('Expires', p.expires_on ? esc(new Date(p.expires_on).toLocaleString()) : '')}
            </div>
            ${balRows.length ? `<div class="pe-sec"><div class="t">Balances</div><div class="pe-kv" style="margin-top:0;">${balRows.join('')}</div></div>` : ''}
            <div class="pe-sec">
                <div class="t">Actions</div>
                <div class="pe-actions">
                    <div><label for="pe-amount">amount (minor units, optional)</label><input type="number" id="pe-amount" class="text-input" placeholder="full amount"></div>
                    <div><label for="pe-reference">reference (optional)</label><input type="text" id="pe-reference" class="text-input"></div>
                    ${btn('captures', 'Capture')}${btn('voids', 'Void')}${btn('refunds', 'Refund')}
                </div>
            </div>
            <div class="pe-sec">
                <div class="t"><span>Action history</span></div>
                ${state.actions.length ? `<table class="pe-table"><tr><th>Type</th><th>Amount</th><th>Result</th><th>Response</th><th>When</th><th>Id</th></tr>${state.actions.map(a => `
                    <tr><td>${esc(a.type)}</td><td>${esc(money(a.amount, p.currency))}</td><td>${a.approved ? '<span class="pe-badge good">approved</span>' : '<span class="pe-badge bad">declined</span>'}</td>
                    <td>${esc(a.response_code || '')} ${esc(a.response_summary || '')}</td><td>${esc(ago(a.processed_on))}</td><td>${chip(a.id)}</td></tr>`).join('')}</table>` : '<div class="pe-empty">No actions.</div>'}
            </div>
            <div class="pe-sec">
                <div class="t"><span>Webhooks</span><button class="copy-btn" data-pe-act="events" type="button">↻</button></div>
                ${state.events.length ? state.events.map(e => `
                    <details class="pe-ev"><summary><b>${esc(e.type)}</b><span class="pe-note">${esc(new Date(e.received_at).toLocaleTimeString())}</span></summary>
                    <pre>${esc(JSON.stringify({ id: e.event_id, type: e.type, created_on: e.created_on, data: e.data }, null, 2))}</pre></details>`).join('')
                    : '<div class="pe-empty">None received yet (events are kept per warm Lambda container).</div>'}
            </div>`;
    }

    function render() { renderList(); renderDetail(); }

    // =====================================================================
    // Events
    // =====================================================================
    async function copy(el) {
        const v = el.dataset.peCopy;
        try { await navigator.clipboard.writeText(v); }
        catch (e) { const t = document.createElement('textarea'); t.value = v; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); }
        el.classList.add('copied'); setTimeout(() => el.classList.remove('copied'), 900);
    }

    function onClick(ev) {
        const cp = ev.target.closest('[data-pe-copy]');
        if (cp) return copy(cp);
        const row = ev.target.closest('[data-pe-select]');
        if (row) { const id = row.dataset.peSelect; state.showRaw = false; return withBusy(() => loadPayment(id)); }
        const act = ev.target.closest('[data-pe-act]');
        if (!act || act.disabled) return;
        const k = act.dataset.peAct;
        if (k === 'raw') { state.showRaw = !state.showRaw; return render(); }
        if (k === 'events') return withBusy(() => loadEvents(state.selected));
        return withBusy(() => runAction(k));
    }

    function onShow() {
        if (!$('pe-root')) return;
        if (!state.loaded && !state.busy) withBusy(runSearch);
    }

    function init() {
        if (!$('pe-root')) return;
        const cur = $('pe-currency');
        (typeof CURRENCIES !== 'undefined' ? CURRENCIES : []).forEach(c => { const o = document.createElement('option'); o.value = c.iso4217; o.text = c.iso4217; cur.appendChild(o); });
        $('pe-root').addEventListener('click', onClick);
        $('pe-search').addEventListener('click', () => { state.showRaw = false; withBusy(runSearch); });
        $('pe-q').addEventListener('keydown', (e) => { if (e.key === 'Enter') { state.showRaw = false; withBusy(runSearch); } });
        ['pe-status', 'pe-currency', 'pe-period', 'pe-limit'].forEach(id => $(id).addEventListener('change', () => withBusy(runSearch)));
        $('pe-refresh').addEventListener('click', () => withBusy(async () => { await runSearch(); }));
        document.querySelector('[onclick*="payments-tab"]')?.addEventListener('click', () => setTimeout(onShow, 0));
        render();
    }

    window.PaymentsExplorer = { onShow, open: (id) => { $('pe-q').value = id; return withBusy(runSearch); } };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

})();
