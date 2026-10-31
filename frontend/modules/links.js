// =============================================
// Hosted Payments Page & Payment Links
// Handles: build + create a Payment Link (POST /payment-links) or a Hosted Payments Page session
//          (POST /hosted-payments), with every request option exposed as an input, then follow its status
//          (GET /payment-links/{id} | /hosted-payments/{id}) until it is paid / expired.
// Backend: no dedicated routes — everything goes through the allowlisted POST /standalone/vault proxy
//          (modules/cko-proxy.js), so only the Checkout.com request/response reaches the API log.
// Data:    LINK_PAYMENT_METHODS / LINK_LOCALES in modules/data.js.
// =============================================

(function () {

    const LS_HIST = 'cko-links-history';
    const FINAL = ['Payment Received', 'Expired', 'Canceled', 'Cancelled', 'Paid', 'Failed'];

    const $ = (id) => document.getElementById(id);
    const val = (id) => $(id)?.value ?? '';
    const trim = (id) => val(id).trim();
    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    const state = {
        kind: 'pl', pmMode: 'all', pmSel: new Set(), products: [],
        current: null, busy: false, queued: null, tick: null, showRaw: false,
    };
    const KIND = { pl: { label: 'Payment Link', path: '/payment-links', prefix: 'pl_' }, hpp: { label: 'Hosted Payments Page', path: '/hosted-payments', prefix: 'hpp_' } };

    // =====================================================================
    // Request building
    // =====================================================================
    function deepMerge(t, x) {
        Object.keys(x).forEach(k => {
            if (x[k] && typeof x[k] === 'object' && !Array.isArray(x[k]) && t[k] && typeof t[k] === 'object') deepMerge(t[k], x[k]); else t[k] = x[k];
        });
        return t;
    }
    function parseObj(text, what, errors) {
        if (!text.trim()) return null;
        try { const v = JSON.parse(text); if (v && typeof v === 'object' && !Array.isArray(v)) return v; } catch (e) { /* fall through */ }
        errors.push(`${what} is not valid JSON`);
        return null;
    }

    function expirySeconds() { return Math.round((parseFloat(val('lk-exp-n')) || 0) * parseInt(val('lk-exp-u'), 10)); }

    function buildBody() {
        const errors = [];
        const b = {};
        const amt = parseInt(val('lk-amount'), 10);
        if (!isNaN(amt)) b.amount = amt;
        b.currency = val('lk-currency');
        if (trim('lk-reference')) b.reference = trim('lk-reference');
        if (trim('lk-description')) b.description = trim('lk-description');
        if (trim('lk-display-name')) b.display_name = trim('lk-display-name');
        if (trim('lk-pc')) b.processing_channel_id = trim('lk-pc');
        if (val('lk-locale') && val('lk-locale') !== 'en-GB') b.locale = val('lk-locale');
        if (val('lk-payment-type') !== 'Regular') b.payment_type = val('lk-payment-type');
        if (val('lk-auth-type') !== 'Final') b.authorization_type = val('lk-auth-type');

        const addr = { country: val('lk-country') };
        [['line1', 'address_line1'], ['line2', 'address_line2'], ['city', 'city'], ['zip', 'zip']].forEach(([id, k]) => { if (trim('lk-b-' + id)) addr[k] = trim('lk-b-' + id); });
        b.billing = { address: addr };

        const cust = {};
        if (trim('lk-c-email')) cust.email = trim('lk-c-email');
        if (trim('lk-c-name')) cust.name = trim('lk-c-name');
        if (trim('lk-c-cc') || trim('lk-c-num')) cust.phone = { country_code: trim('lk-c-cc'), number: trim('lk-c-num') };
        if (Object.keys(cust).length) b.customer = cust;

        if ($('lk-ship-on').checked) {
            const sa = { country: val('lk-s-country') };
            [['line1', 'address_line1'], ['city', 'city'], ['zip', 'zip']].forEach(([id, k]) => { if (trim('lk-s-' + id)) sa[k] = trim('lk-s-' + id); });
            b.shipping = { address: sa };
        }
        const prods = state.products.filter(p => p.name.trim());
        if (prods.length) b.products = prods.map(p => ({
            name: p.name.trim(), quantity: parseInt(p.quantity, 10) || 1, price: parseInt(p.price, 10) || 0,
            ...(p.reference?.trim() ? { reference: p.reference.trim() } : {}),
        }));

        if (val('lk-capture')) b.capture = val('lk-capture') === 'true';
        if (trim('lk-capture-on')) b.capture_on = `${trim('lk-capture-on')}:00Z`;
        const d3 = {};
        if (val('lk-3ds')) d3.enabled = val('lk-3ds') === 'true';
        if ($('lk-3ds-n3d').checked) d3.attempt_n3d = true;
        if ($('lk-3ds-noup').checked) d3.allow_upgrade = false;
        if (val('lk-3ds-ci')) d3.challenge_indicator = val('lk-3ds-ci');
        if (val('lk-3ds-ex')) d3.exemption = val('lk-3ds-ex');
        if (Object.keys(d3).length) b['3ds'] = d3;
        if (val('lk-risk')) b.risk = { enabled: false };
        if (trim('lk-retry') !== '') b.customer_retry = { max_attempts: Math.max(0, Math.min(5, parseInt(val('lk-retry'), 10) || 0)) };
        if (trim('lk-bd-name') || trim('lk-bd-city')) {
            if (!trim('lk-bd-name') || !trim('lk-bd-city')) errors.push('billing_descriptor needs both a name and a city');
            else b.billing_descriptor = { name: trim('lk-bd-name'), city: trim('lk-bd-city') };
        }
        if (val('lk-payment-type') === 'Recurring' && val('lk-pp-var')) {
            const pp = { amount_variability: val('lk-pp-var') };
            if (trim('lk-pp-days')) pp.days_between_payments = parseInt(val('lk-pp-days'), 10);
            if (trim('lk-pp-total')) pp.total_number_of_payments = parseInt(val('lk-pp-total'), 10);
            if (trim('lk-pp-exp')) pp.expiry = trim('lk-pp-exp');
            b.payment_plan = pp;
        }
        const meta = parseObj(val('lk-metadata'), 'metadata', errors);
        if (meta) b.metadata = meta;

        const cfg = {};
        if (val('lk-store')) cfg.card = { store_payment_details: val('lk-store') };
        const excluded = (id) => (state.pmMode === 'allow' && !state.pmSel.has(id)) || (state.pmMode === 'deny' && state.pmSel.has(id));
        if (state.kind === 'hpp' && trim('lk-stored-cus') && !excluded('stored_card')) cfg.stored_card = { customer_id: trim('lk-stored-cus') };
        if (Object.keys(cfg).length) b.payment_method_configuration = cfg;

        const sel = [...state.pmSel].filter(id => !(id === 'stored_card' && state.kind !== 'hpp'));
        if (state.pmMode === 'allow') { if (!sel.length) errors.push('pick at least one payment method (or choose “Show everything available”)'); else b.allow_payment_methods = sel; }
        if (state.pmMode === 'deny' && sel.length) b.disabled_payment_methods = sel;

        if (state.kind === 'pl') {
            const s = expirySeconds();
            if (s < 1 || s > 5184000) errors.push('expiry must be between 1 second and 60 days'); else b.expires_in = s;
            if (trim('lk-return-url')) b.return_url = trim('lk-return-url');
        } else {
            b.success_url = trim('lk-success-url'); b.cancel_url = trim('lk-cancel-url'); b.failure_url = trim('lk-failure-url');
            if (!b.success_url || !b.cancel_url || !b.failure_url) errors.push('success_url, cancel_url and failure_url are required');
        }
        if (!b.currency) errors.push('currency is required');
        if (state.kind === 'pl' && !(b.amount >= 1)) errors.push('amount must be at least 1 for a Payment Link');

        const extra = parseObj(val('lk-extra'), 'extra JSON', errors);
        if (extra) deepMerge(b, extra);
        return { body: b, errors };
    }

    // =====================================================================
    // Payment-method tiles
    // =====================================================================
    function compatIssues(m) {
        const c = val('lk-country'), cur = val('lk-currency'), out = [];
        if (m.countries && !m.countries.includes(c)) out.push(`country ${m.countries.length <= 3 ? m.countries.join('/') : 'in list'}`);
        if (m.currencies && !m.currencies.includes(cur)) out.push(`currency ${m.currencies.length <= 3 ? m.currencies.join('/') : 'in list'}`);
        return out;
    }
    // Requirements the form does not currently satisfy for a method (so the user knows why a method may be rejected).
    function unmet(m) {
        const out = [];
        const has = (k) => ({
            'products': state.products.some(p => p.name.trim()),
            'customer name': !!trim('lk-c-name'), 'customer email': !!trim('lk-c-email'),
            'reference': !!trim('lk-reference'), 'description': !!trim('lk-description'),
            'shipping': $('lk-ship-on').checked, 'amount': parseInt(val('lk-amount'), 10) > 0,
            'billing address line 1': !!trim('lk-b-line1'), 'city': !!trim('lk-b-city'), 'zip': !!trim('lk-b-zip'),
            'locale ar': val('lk-locale') === 'ar', 'payment_type Regular': val('lk-payment-type') === 'Regular',
            'stored customer id': !!trim('lk-stored-cus'),
        }[k]);
        (m.needs || []).forEach(n => { if (has(n) === false) out.push(n); });
        return out;
    }
    const shortList = (a) => (a.length <= 3 ? a.join(' / ') : `${a.length} countries`);

    function renderTiles() {
        const hasMode = state.pmMode !== 'all';
        const hideOff = $('lk-hide-off').checked;
        $('lk-hide-lbl').textContent = `${val('lk-country')} · ${val('lk-currency')}`;
        const all = LINK_PAYMENT_METHODS.filter(m => !(m.hppOnly && state.kind !== 'hpp'));
        // methods the current country/currency cannot show are tucked away (a selected one always stays visible)
        const shown = all.filter(m => !hideOff || compatIssues(m).length === 0 || state.pmSel.has(m.id));
        $('lk-hide-count').textContent = hideOff && shown.length < all.length ? `(${all.length - shown.length} hidden)` : '';
        const groups = [...new Set(shown.map(m => m.group))];
        $('lk-tiles').innerHTML = groups.map(g => `<div class="lk-group"><div class="gt">${esc(g)}</div><div class="lk-tiles">${
            shown.filter(m => m.group === g).map(m => {
                const issues = compatIssues(m);
                const sub = [m.countries ? shortList(m.countries) : null, m.currencies ? (m.currencies.length <= 3 ? m.currencies.join('/') : `${m.currencies.length} currencies`) : null].filter(Boolean).join(' · ') || 'any market';
                return `<div class="lk-tile ${hasMode ? '' : 'nomode'} ${state.pmSel.has(m.id) && hasMode ? 'sel' : ''} ${state.pmMode === 'deny' ? 'deny' : ''} ${issues.length ? 'off' : ''}" data-pm="${esc(m.id)}" title="${esc(m.id)}${m.note ? ' — ' + esc(m.note) : ''}">
                    <div class="n">${esc(m.label)}</div><div class="s">${esc(sub)}</div>${issues.length ? `<div class="warn">⚠ not for ${esc(val('lk-country'))} · ${esc(val('lk-currency'))}</div>` : ''}</div>`;
            }).join('')}</div></div>`).join('');
        renderEstimate();
    }

    function renderEstimate() {
        const box = $('lk-pm-est');
        const country = val('lk-country'), cur = val('lk-currency');
        const universe = LINK_PAYMENT_METHODS.filter(m => !(m.hppOnly && state.kind !== 'hpp') && !(m.id === 'stored_card' && !trim('lk-stored-cus')));
        let offered = universe.filter(m => compatIssues(m).length === 0);
        let note = '';
        if (state.pmMode === 'allow') {
            const blocked = [...state.pmSel].map(id => LINK_PAYMENT_METHODS.find(m => m.id === id)).filter(m => m && compatIssues(m).length);
            offered = offered.filter(m => state.pmSel.has(m.id));
            if (blocked.length) note = `<div style="margin-top:6px; color:#b45309;">⚠ Selected but not available for ${esc(country)} · ${esc(cur)}: ${blocked.map(m => `<b>${esc(m.label)}</b> (needs ${esc(m.countries ? shortList(m.countries) : '')}${m.currencies ? ' · ' + esc(m.currencies.slice(0, 3).join('/')) : ''})`).join(', ')}</div>`;
            if (!state.pmSel.size) note = '<div style="margin-top:6px; color:#b45309;">⚠ Select at least one method.</div>';
        } else if (state.pmMode === 'deny') {
            offered = offered.filter(m => !state.pmSel.has(m.id));
        }
        const missing = offered.map(m => ({ m, u: unmet(m) })).filter(x => x.u.length);
        const lead = state.pmMode === 'all' ? 'Show everything available' : state.pmMode === 'allow' ? 'Only these' : 'Everything except these';
        box.innerHTML = `<div><b>${lead}</b> — estimated for <b>${esc(country)} · ${esc(cur)}</b> (Checkout.com also applies the methods enabled on your account):</div>
            <div style="margin-top:4px;">${offered.length ? offered.map(m => `<span class="lk-tag">${esc(m.label)}</span>`).join('') : '<span class="lk-note">nothing — the page would fail with <code>no_payment_methods_available</code></span>'}</div>
            ${missing.length ? `<div style="margin-top:6px;">Still needed: ${missing.map(x => `<span class="lk-tag need">${esc(x.m.label)}: ${esc(x.u.join(', '))}</span>`).join('')}</div>` : ''}${note}`;
    }

    // =====================================================================
    // Products
    // =====================================================================
    function renderProducts() {
        $('lk-products').innerHTML = state.products.map((p, i) => `<div class="lk-prod" data-i="${i}">
            <input type="text" class="text-input" data-pf="name" placeholder="name" value="${esc(p.name)}">
            <input type="number" class="text-input" data-pf="quantity" placeholder="qty" value="${esc(p.quantity)}" min="1">
            <input type="number" class="text-input" data-pf="price" placeholder="price (minor)" value="${esc(p.price)}" min="0">
            <input type="text" class="text-input" data-pf="reference" placeholder="reference / SKU" value="${esc(p.reference || '')}">
            <button class="copy-btn" type="button" data-pdel="${i}">✕</button></div>`).join('') || '<div class="lk-note" style="margin-bottom:8px;">No items.</div>';
    }

    // =====================================================================
    // Preview + refresh
    // =====================================================================
    function refresh() {
        const { body, errors } = buildBody();
        $('lk-preview').textContent = JSON.stringify(body, null, 2) + (errors.length ? `\n\n// ⚠ ${errors.join('\n// ⚠ ')}` : '');
        const s = expirySeconds();
        $('lk-exp-note').textContent = s >= 1 && s <= 5184000 ? `= ${s} s · expires ${new Date(Date.now() + s * 1000).toLocaleString()} if created now` : '⚠ must be between 1 second and 60 days (5,184,000 s)';
        $('lk-plan-det').style.display = val('lk-payment-type') === 'Recurring' ? '' : 'none';
        $('lk-sc-wrap').style.display = state.kind === 'hpp' ? '' : 'none';
        $('lk-ship-fields').style.display = $('lk-ship-on').checked ? '' : 'none';
        renderTiles();
    }

    function setKind(kind) {
        state.kind = kind;
        document.querySelectorAll('#lk-kind .lk-pill').forEach(p => p.classList.toggle('active', p.dataset.kind === kind));
        $('lk-pl-only').style.display = kind === 'pl' ? '' : 'none';
        $('lk-hpp-only').style.display = kind === 'hpp' ? '' : 'none';
        $('lk-create').textContent = `Create ${KIND[kind].label}`;
        if (/^(PL|HPP)-[A-Z0-9]+$/.test(trim('lk-reference'))) $('lk-reference').value = autoRef();   // keep the auto reference in step with the type
        refresh();
    }
    function setMode(mode) {
        state.pmMode = mode;
        document.querySelectorAll('#lk-pm-mode .lk-pill').forEach(p => p.classList.toggle('active', p.dataset.mode === mode));
        refresh();
    }

    // =====================================================================
    // Presets
    // =====================================================================
    const PRESETS = [
        { label: 'Cards + wallets only', mode: 'allow', pm: ['card', 'applepay', 'googlepay'] },
        { label: 'iDEAL (NL · EUR)', country: 'NL', currency: 'EUR', mode: 'allow', pm: ['ideal', 'card'] },
        { label: 'Klarna (DE · EUR)', country: 'DE', currency: 'EUR', mode: 'allow', pm: ['klarna'], name: 'Test Customer', products: [{ name: 'Test item', quantity: 1, price: 1000 }] },
        { label: 'SEPA (DE · EUR)', country: 'DE', currency: 'EUR', mode: 'allow', pm: ['sepa'], address: { line1: 'Cloverfield St. 23', city: 'Berlin', zip: '10115' } },
        { label: 'Everything except PayPal', mode: 'deny', pm: ['paypal'] },
        { label: 'Link expires in 2 min', kind: 'pl', exp: [2, 60] },
    ];
    function applyPreset(p) {
        if (p.kind) setKind(p.kind);
        if (p.country) $('lk-country').value = p.country;
        if (p.currency) $('lk-currency').value = p.currency;
        if (p.exp) { $('lk-exp-n').value = p.exp[0]; $('lk-exp-u').value = String(p.exp[1]); }
        if (p.name) $('lk-c-name').value = p.name;
        if (p.address) { $('lk-b-line1').value = p.address.line1; $('lk-b-city').value = p.address.city; $('lk-b-zip').value = p.address.zip; }
        if (p.products) { state.products = p.products.map(x => ({ ...x })); renderProducts(); }
        if (p.mode) { state.pmSel = new Set(p.pm || []); setMode(p.mode); } else refresh();
    }

    // =====================================================================
    // Create / status
    // =====================================================================
    async function withBusy(fn) {
        if (state.busy) { state.queued = fn; return; }
        state.busy = true; $('lk-root').classList.add('lk-busy');
        try { return await fn(); }
        catch (err) { console.error('[links]', err); showToast(err.message || 'Request failed', 'error'); }
        finally {
            state.busy = false; $('lk-root').classList.remove('lk-busy');
            const next = state.queued; state.queued = null; if (next) withBusy(next);
        }
    }

    const readHist = () => { try { return JSON.parse(localStorage.getItem(LS_HIST) || '[]'); } catch (e) { return []; } };
    const writeHist = (h) => { try { localStorage.setItem(LS_HIST, JSON.stringify(h.slice(0, 12))); } catch (e) { /* ignore */ } };

    async function create() {
        const { body, errors } = buildBody();
        if (errors.length) { showToast(errors[0], 'error'); return; }
        const kind = state.kind;
        const r = await CkoProxy.call('POST', KIND[kind].path, body);
        if (!r.ok) {
            state.current = { kind, error: r.data, status: r.status };
            renderResult();
            return showToast(`Create failed: ${CkoProxy.errText(r)}`, 'error');
        }
        const id = r.data.id;
        // No follow-up GET: the create response already has the link + expiry. Status is read only when you press Refresh.
        state.current = { kind, id, data: { ...r.data, amount: body.amount, currency: body.currency, status: 'created' }, createdAt: Date.now() };
        const h = readHist().filter(x => x.id !== id);
        h.unshift({ kind, id, reference: body.reference || r.data.reference, amount: body.amount, currency: body.currency, at: new Date().toISOString(), status: 'created', url: r.data._links?.redirect?.href });
        writeHist(h);
        showToast(`${KIND[kind].label} created`);
        $('lk-reference').value = autoRef();
        refresh();
        show();
    }

    async function loadById(kind, id) {
        const g = await CkoProxy.call('GET', `${KIND[kind].path}/${encodeURIComponent(id)}`);
        if (!g.ok) return showToast(g.status === 404 ? 'Not found' : 'Load failed: ' + CkoProxy.errText(g), 'error');
        state.current = { kind, id, data: g.data };
        patchHistory(id, g.data.status);
        show();
    }
    function patchHistory(id, status) {
        if (!status) return;
        const h = readHist(); const e = h.find(x => x.id === id); if (e) { e.status = status; writeHist(h); }
    }

    async function refreshCurrent({ quiet } = {}) {
        const c = state.current; if (!c?.id) return;
        const g = await CkoProxy.call('GET', `${KIND[c.kind].path}/${encodeURIComponent(c.id)}`);
        if (g.ok) { c.data = { ...c.data, ...g.data }; patchHistory(c.id, g.data.status); }
        else if (!quiet) showToast('Refresh failed: ' + CkoProxy.errText(g), 'error');
    }

    // Status is never polled — it is fetched only when you press ↻ Refresh status / Refresh all, or open an item from Recent.
    function show() { renderResult(); renderHistory(); }

    // =====================================================================
    // Rendering: result + history
    // =====================================================================
    const badgeClass = (s) => (s === 'Payment Received' || s === 'Paid' ? 'good' : /Expired|Cancel|Fail/.test(s || '') ? 'bad' : 'warn');
    const chip = (v, label) => v ? `<span class="lk-cid" data-lk-copy="${esc(v)}" title="Click to copy">${esc(label || v)}</span>` : '';
    function money(a, cur) { const base = (typeof CURRENCIES !== 'undefined' && CURRENCIES.find(c => c.iso4217 === cur)?.base) || 100; try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur }).format(a / base); } catch (e) { return `${a / base} ${cur}`; } }
    function countdownText(iso) {
        if (!iso) return '';
        const ms = new Date(iso).getTime() - Date.now();
        if (ms <= 0) return 'expired';
        const s = Math.floor(ms / 1000), d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), sec = s % 60;
        return `${d ? d + 'd ' : ''}${h ? h + 'h ' : ''}${m}m ${String(sec).padStart(2, '0')}s left`;
    }

    function renderResult() {
        const box = $('lk-result'), c = state.current;
        clearInterval(state.tick);
        if (!c) { box.style.display = 'none'; return; }
        box.style.display = 'block';
        if (c.error) {
            box.innerHTML = `<div class="lk-t">${esc(KIND[c.kind].label)} · creation failed <span class="lk-badge bad">${esc(c.status)}</span></div>
                <pre class="lk-ta" style="white-space:pre-wrap; margin:0;">${esc(JSON.stringify(c.error, null, 2))}</pre>`;
            return;
        }
        const d = c.data || {}, url = d._links?.redirect?.href || '';
        const exp = d.expires_on;
        box.innerHTML = `
            <div class="lk-t">${esc(KIND[c.kind].label)} <span class="lk-badge ${badgeClass(d.status)}">${esc(d.status || 'created')}</span>
                <button class="copy-btn" data-lk-act="refresh" type="button" style="margin-left:auto;" title="Reads the current status from Checkout.com (not polled automatically)">↻ Refresh status</button></div>
            <div class="lk-url"><code>${esc(url)}</code>
                <a class="main-button" href="${esc(url)}" target="_blank" rel="noopener" style="text-decoration:none; padding:7px 16px;">Open ↗</a>
                <button class="copy-btn" data-lk-copy="${esc(url)}" type="button">Copy link</button></div>
            <div class="lk-kv">
                <div><div class="k">id</div><div class="v">${chip(c.id)}</div></div>
                <div><div class="k">reference</div><div class="v">${chip(d.reference)}</div></div>
                ${d.payment_id && d.payment_id !== 'undefined' ? `<div><div class="k">payment</div><div class="v">${chip(d.payment_id)}<button class="copy-btn" data-lk-act="open-pay" data-id="${esc(d.payment_id)}" type="button">Open in Payments ↗</button></div></div>` : ''}
                ${d.amount !== undefined ? `<div><div class="k">amount</div><div class="v">${esc(money(d.amount, d.currency))}</div></div>` : ''}
                ${exp ? `<div><div class="k">expires</div><div class="v">${esc(new Date(exp).toLocaleString())}<br><span id="lk-count" class="lk-note"></span></div></div>` : ''}
                ${d.created_on ? `<div><div class="k">created</div><div class="v">${esc(new Date(d.created_on).toLocaleString())}</div></div>` : ''}
                ${d.locale ? `<div><div class="k">locale</div><div class="v">${esc(d.locale)}</div></div>` : ''}
            </div>
            <details class="lk-det"><summary>Raw response</summary><pre class="lk-ta" style="white-space:pre-wrap; word-break:break-all; margin:0; max-height:300px; overflow:auto;">${esc(JSON.stringify(d, null, 2))}</pre></details>`;
        if (exp) {
            const upd = () => { const el = $('lk-count'); if (el) el.textContent = FINAL.includes(d.status) && d.status !== 'Payment Received' ? '' : countdownText(exp); };
            upd(); state.tick = setInterval(upd, 1000);
        }
    }

    function renderHistory() {
        const h = readHist(), box = $('lk-history');
        if (!h.length) { box.innerHTML = ''; return; }
        box.innerHTML = `<div class="lk-t">Recent <button class="copy-btn" data-lk-act="hist-refresh" type="button">↻ Refresh all</button><button class="copy-btn" data-lk-act="hist-clear" type="button">Clear</button></div>` +
            h.map(x => `<div class="lk-hist-row" data-lk-load="${esc(x.id)}" data-kind="${esc(x.kind)}">
                <span class="lk-badge">${x.kind === 'pl' ? 'Link' : 'HPP'}</span><b>${esc(x.amount !== undefined ? money(x.amount, x.currency) : '')}</b>
                <span>${esc(x.reference || '')}</span><span class="lk-note" style="font-family:monospace;">${esc(x.id)}</span>
                <span class="lk-badge ${badgeClass(x.status)}" style="margin-left:auto;">${esc(x.status || '')}</span></div>`).join('');
    }

    // =====================================================================
    // Events
    // =====================================================================
    async function copy(el) {
        const v = el.dataset.lkCopy;
        try { await navigator.clipboard.writeText(v); }
        catch (e) { const t = document.createElement('textarea'); t.value = v; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); }
        const o = el.textContent; el.classList.add('copied');
        if (el.tagName === 'BUTTON') { el.textContent = 'Copied ✓'; setTimeout(() => { el.textContent = o; el.classList.remove('copied'); }, 1000); } else setTimeout(() => el.classList.remove('copied'), 900);
    }

    function onClick(ev) {
        const cp = ev.target.closest('[data-lk-copy]'); if (cp) return copy(cp);
        const kind = ev.target.closest('#lk-kind .lk-pill'); if (kind) return setKind(kind.dataset.kind);
        const mode = ev.target.closest('#lk-pm-mode .lk-pill'); if (mode) return setMode(mode.dataset.mode);
        const tile = ev.target.closest('.lk-tile[data-pm]');
        if (tile) {
            if (state.pmMode === 'all') setMode('allow');           // picking a tile means "only these" — the natural reading
            const id = tile.dataset.pm; state.pmSel.has(id) ? state.pmSel.delete(id) : state.pmSel.add(id);
            return refresh();
        }
        const pre = ev.target.closest('[data-preset]'); if (pre) return applyPreset(PRESETS[+pre.dataset.preset]);
        const ec = ev.target.closest('[data-exp]'); if (ec) { const [n, u] = ec.dataset.exp.split('x'); $('lk-exp-n').value = n; $('lk-exp-u').value = u; return refresh(); }
        const del = ev.target.closest('[data-pdel]'); if (del) { state.products.splice(+del.dataset.pdel, 1); renderProducts(); return refresh(); }
        const hist = ev.target.closest('[data-lk-load]'); if (hist && !ev.target.closest('button')) return withBusy(() => loadById(hist.dataset.kind, hist.dataset.lkLoad));
        const act = ev.target.closest('[data-lk-act]');
        if (!act) return;
        switch (act.dataset.lkAct) {
            case 'refresh': return withBusy(async () => { await refreshCurrent(); renderResult(); renderHistory(); });
            case 'open-pay': {
                const nav = document.querySelector('[onclick*="payments-tab"]'); nav?.click();
                return setTimeout(() => window.PaymentsExplorer?.open(act.dataset.id), 80);
            }
            case 'hist-clear': writeHist([]); return renderHistory();
            case 'hist-refresh': return withBusy(async () => {
                const h = readHist();
                for (const x of h) { const g = await CkoProxy.call('GET', `${KIND[x.kind].path}/${encodeURIComponent(x.id)}`); if (g.ok) x.status = g.data.status; }
                writeHist(h); renderHistory();
            });
        }
    }

    const autoRef = () => `${state.kind === 'pl' ? 'PL' : 'HPP'}-${Date.now().toString(36).toUpperCase()}`;

    function init() {
        if (!$('lk-root')) return;
        const cur = (typeof CURRENCIES !== 'undefined' ? CURRENCIES : []).map(c => c.iso4217);
        $('lk-currency').innerHTML = cur.map(c => `<option>${esc(c)}</option>`).join(''); $('lk-currency').value = 'EUR';
        const cOpts = (typeof COUNTRIES !== 'undefined' ? COUNTRIES : []).map(c => `<option value="${esc(c.alpha2Code)}">${esc(c.name)} (${esc(c.alpha2Code)})</option>`).join('');
        $('lk-country').innerHTML = cOpts; $('lk-country').value = 'DE';
        $('lk-s-country').innerHTML = cOpts; $('lk-s-country').value = 'DE';
        $('lk-locale').innerHTML = LINK_LOCALES.map(l => `<option>${l}</option>`).join('');
        $('lk-pc').value = window.APP_CONFIG?.processingChannelId || '';
        $('lk-reference').value = autoRef();
        const origin = window.location.origin;
        $('lk-return-url').value = `${origin}/success.html`;
        $('lk-success-url').value = `${origin}/success.html`; $('lk-cancel-url').value = `${origin}/failure.html`; $('lk-failure-url').value = `${origin}/failure.html`;
        $('lk-presets').innerHTML = PRESETS.map((p, i) => `<span class="lk-chip" data-preset="${i}">${esc(p.label)}</span>`).join('');
        $('lk-exp-chips').innerHTML = [['1 min', '1x60'], ['5 min', '5x60'], ['1 hour', '1x3600'], ['24 hours', '1x86400'], ['7 days', '7x86400'], ['30 days', '30x86400'], ['60 days (max)', '60x86400']]
            .map(([l, v]) => `<span class="lk-chip" data-exp="${v}">${l}</span>`).join('');

        $('lk-root').addEventListener('click', onClick);
        $('lk-root').addEventListener('input', (e) => {
            const pf = e.target.dataset?.pf;
            if (pf) { state.products[+e.target.closest('.lk-prod').dataset.i][pf] = e.target.value; }
            refresh();
        });
        $('lk-root').addEventListener('change', refresh);
        $('lk-prod-add').addEventListener('click', () => { state.products.push({ name: '', quantity: 1, price: 0, reference: '' }); renderProducts(); refresh(); });
        $('lk-prod-fill').addEventListener('click', () => { state.products = [{ name: 'Test item', quantity: 1, price: parseInt(val('lk-amount'), 10) || 0, reference: 'SKU-1' }]; renderProducts(); refresh(); });
        $('lk-create').addEventListener('click', () => withBusy(create));
        document.addEventListener('themechange', () => { /* tiles use theme variables — nothing to redo */ });

        renderProducts(); setKind('pl'); renderHistory();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
