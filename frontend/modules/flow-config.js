// =============================================
// Flow session options (Checkout Flow tab → "Advanced session options")
// Builds the request for POST /payment-sessions used by **Render Standard Flow** only.
//   - The existing default payload (flow.js `paymentSessionBody`) is the starting point and is never mutated.
//   - Every control here starts at "(default)"; a control only changes the request once you set it.
//   - window.FlowConfig.apply(base) → { body, changes, errors } — flow.js calls it right before creating a
//     standard session. "Tokenize only" never calls it, so it keeps sending the untouched default payload.
// Payment-method catalogue: LINK_PAYMENT_METHODS in data.js (same ids Flow accepts).
// =============================================

(function () {
    const $ = (id) => document.getElementById(id);
    const val = (id) => $(id)?.value ?? '';
    const trim = (id) => val(id).trim();
    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    const SECTIONS = ['methods', 'wallets', 'stored', 'risk', 'more'];
    const state = { sec: 'methods', pmMode: 'default', pmSel: new Set() };
    // chips offered in addition to the catalogue (Flow-specific method, already used by the default payload)
    const EXTRA_METHODS = [{ id: 'remember_me', label: 'Remember Me', countries: null, currencies: null }];

    const clone = (o) => JSON.parse(JSON.stringify(o));
    function deepMerge(t, x) {
        Object.keys(x).forEach(k => {
            if (x[k] && typeof x[k] === 'object' && !Array.isArray(x[k]) && t[k] && typeof t[k] === 'object') deepMerge(t[k], x[k]); else t[k] = x[k];
        });
        return t;
    }

    function methodList() {
        const base = (typeof LINK_PAYMENT_METHODS !== 'undefined' ? LINK_PAYMENT_METHODS : []).map(m => ({ id: m.id, label: m.label, countries: m.countries, currencies: m.currencies }));
        return [...base, ...EXTRA_METHODS];
    }
    function compatOk(m) {
        const c = val('country-select'), cur = val('currency-select');
        return (!m.countries || m.countries.includes(c)) && (!m.currencies || m.currencies.includes(cur));
    }

    // ------------------------------------------------------------------
    // Build the request
    // ------------------------------------------------------------------
    function apply(base) {
        const body = clone(base);
        const changes = [], errors = [];
        const set = (section, path, value) => {
            const keys = path.split('.');
            let o = body;
            keys.slice(0, -1).forEach(k => { if (!o[k] || typeof o[k] !== 'object') o[k] = {}; o = o[k]; });
            o[keys[keys.length - 1]] = value;
            changes.push({ section, path, value });
        };
        const drop = (section, path) => {
            const keys = path.split('.'); let o = body;
            for (const k of keys.slice(0, -1)) { if (!o?.[k]) return; o = o[k]; }
            delete o[keys[keys.length - 1]];
            changes.push({ section, path, value: '(removed)' });
        };
        const json = (id, what) => {
            if (!trim(id)) return null;
            try { const v = JSON.parse(val(id)); if (v && typeof v === 'object' && !Array.isArray(v)) return v; } catch (e) { /* fall through */ }
            errors.push(`${what} is not valid JSON`); return null;
        };

        // payment methods
        const sel = [...state.pmSel];
        if (state.pmMode === 'allow') {
            if (!sel.length) errors.push('“Only these” needs at least one payment method');
            else set('methods', 'enabled_payment_methods', sel);
        } else if (state.pmMode === 'deny' && sel.length) {
            const existing = Array.isArray(body.disabled_payment_methods) ? body.disabled_payment_methods : [];
            set('methods', 'disabled_payment_methods', [...new Set([...existing, ...sel])]);
        }

        // cards & wallets
        if (val('fc-card-store')) set('wallets', 'payment_method_configuration.card.store_payment_details', val('fc-card-store'));
        if (val('fc-apple-store')) set('wallets', 'payment_method_configuration.applepay.store_payment_details', val('fc-apple-store'));
        if (val('fc-apple-total')) set('wallets', 'payment_method_configuration.applepay.total_type', val('fc-apple-total'));
        if (val('fc-google-store')) set('wallets', 'payment_method_configuration.googlepay.store_payment_details', val('fc-google-store'));
        if (val('fc-google-total')) set('wallets', 'payment_method_configuration.googlepay.total_price_status', val('fc-google-total'));

        // stored cards
        const scMode = val('fc-sc-mode');
        if (scMode === 'off') drop('stored', 'payment_method_configuration.stored_card');
        if (scMode === 'customer') {
            if (!trim('fc-sc-cus')) errors.push('stored_card.customer_id is empty');
            else {
                set('stored', 'payment_method_configuration.stored_card', { customer_id: trim('fc-sc-cus'), ...(trim('fc-sc-def') ? { default_instrument_id: trim('fc-sc-def') } : {}) });
            }
        }
        if (scMode === 'ids') {
            const ids = trim('fc-sc-ids').split(/[\s,]+/).filter(Boolean);
            if (!ids.length) errors.push('stored_card.instrument_ids is empty');
            else if (ids.length > 10) errors.push('stored_card.instrument_ids allows at most 10');
            else set('stored', 'payment_method_configuration.stored_card', { instrument_ids: ids, ...(trim('fc-sc-def') ? { default_instrument_id: trim('fc-sc-def') } : {}) });
        }

        // 3DS, capture, risk, retries
        if (val('fc-3ds-ci')) set('risk', '3ds.challenge_indicator', val('fc-3ds-ci'));
        if (val('fc-3ds-ex')) set('risk', '3ds.exemption', val('fc-3ds-ex'));
        if ($('fc-3ds-n3d').checked) set('risk', '3ds.attempt_n3d', true);
        if ($('fc-3ds-noup').checked) set('risk', '3ds.allow_upgrade', false);
        if (val('fc-auth-type')) set('risk', 'authorization_type', val('fc-auth-type'));
        if (trim('fc-capture-on')) set('risk', 'capture_on', `${trim('fc-capture-on')}:00Z`);
        if (val('fc-risk')) set('risk', 'risk', { enabled: false });
        if (trim('fc-retry') !== '') set('risk', 'customer_retry', { max_attempts: Math.max(0, Math.min(5, parseInt(val('fc-retry'), 10) || 0)) });

        // more
        if (trim('fc-exp-n')) {
            const s = Math.round(parseFloat(val('fc-exp-n')) * parseInt(val('fc-exp-u'), 10));
            if (!(s >= 1) || s > 60 * 86400) errors.push('session expiry must be between 1 second and 60 days');
            else set('more', 'expires_on', new Date(Date.now() + s * 1000).toISOString());
        }
        if (trim('fc-display-name')) set('more', 'display_name', trim('fc-display-name'));
        if (trim('fc-description')) set('more', 'description', trim('fc-description'));
        if (trim('fc-bd-name') || trim('fc-bd-city')) {
            if (!trim('fc-bd-name') || !trim('fc-bd-city')) errors.push('billing_descriptor needs both a name and a city');
            else set('more', 'billing_descriptor', { name: trim('fc-bd-name'), city: trim('fc-bd-city') });
        }
        if (val('fc-pan')) set('more', 'processing.pan_preference', val('fc-pan'));
        if (val('payment-type-select') === 'Recurring' && val('fc-pp-var')) {
            const pp = { amount_variability: val('fc-pp-var') };
            if (trim('fc-pp-days')) pp.days_between_payments = parseInt(val('fc-pp-days'), 10);
            if (trim('fc-pp-total')) pp.total_number_of_payments = parseInt(val('fc-pp-total'), 10);
            if (trim('fc-pp-exp')) pp.expiry = trim('fc-pp-exp');
            set('more', 'payment_plan', pp);
        }
        if ($('fc-ship-on').checked) {
            const a = { country: val('fc-s-country') };
            [['line1', 'address_line1'], ['city', 'city'], ['zip', 'zip']].forEach(([id, k]) => { if (trim('fc-s-' + id)) a[k] = trim('fc-s-' + id); });
            set('more', 'shipping', { address: a });
        }
        const meta = json('fc-metadata', 'metadata');
        if (meta) set('more', 'metadata', meta);
        const extra = json('fc-extra', 'Extra JSON');
        if (extra) { deepMerge(body, extra); changes.push({ section: 'more', path: 'extra JSON', value: Object.keys(extra).join(', ') }); }

        return { body, changes, errors };
    }

    // ------------------------------------------------------------------
    // UI
    // ------------------------------------------------------------------
    function renderChips() {
        const hide = $('fc-pm-hide').checked;
        $('fc-pm-lbl').textContent = `${val('country-select')} · ${val('currency-select')}`;
        const locked = state.pmMode === 'default';   // nothing is selected in default mode; clicking a chip switches to “Only these”
        const list = methodList().filter(m => !hide || compatOk(m) || state.pmSel.has(m.id));
        $('fc-pm-chips').innerHTML = list.map(m => `<span class="fc-chip ${state.pmSel.has(m.id) && !locked ? 'sel' : ''} ${state.pmMode === 'deny' ? 'deny' : ''} ${compatOk(m) ? '' : 'off'} " data-pm="${esc(m.id)}" title="${esc(m.id)}">${esc(m.label)}</span>`).join('');
        $('fc-pm-note').textContent = state.pmMode === 'default'
            ? 'Default: Flow shows every method available for this country and currency (Remember Me is off unless the switch above is on). Pick “Only these” or “Everything except these” to change it.'
            : state.pmMode === 'allow' ? 'Only the selected methods are offered (enabled_payment_methods).' : 'The selected methods are hidden; everything else stays (added to disabled_payment_methods).';
    }

    function update() {
        $('fc-plan').style.display = val('payment-type-select') === 'Recurring' ? '' : 'none';
        $('fc-ship-fields').style.display = $('fc-ship-on').checked ? '' : 'none';
        $('fc-sc-cus-w').style.display = val('fc-sc-mode') === 'customer' ? '' : 'none';
        $('fc-sc-ids-w').style.display = val('fc-sc-mode') === 'ids' ? '' : 'none';
        $('fc-sc-def-w').style.display = ['customer', 'ids'].includes(val('fc-sc-mode')) ? '' : 'none';
        renderChips();

        const base = typeof paymentSessionBody !== 'undefined' ? paymentSessionBody : {};
        const { body, changes, errors } = apply(base);
        const n = changes.length;
        $('fc-count').textContent = n ? `${n} change${n === 1 ? '' : 's'}` : 'defaults';
        $('fc-count').classList.toggle('zero', !n);
        document.querySelectorAll('#fc-pills .fc-pill').forEach(p => {
            const c = changes.filter(x => x.section === p.dataset.sec).length;
            p.querySelector('.n')?.remove();
            if (c) p.insertAdjacentHTML('beforeend', `<span class="n">${c}</span>`);
        });
        $('fc-errors').innerHTML = errors.map(e => `<div class="fc-err">⚠ ${esc(e)}</div>`).join('');
        $('fc-diff').innerHTML = changes.length ? changes.map(c => `<span>${esc(c.path)}${typeof c.value === 'object' ? '' : ' = ' + esc(c.value)}</span>`).join('') : '<span style="background:var(--bg-card); color:var(--text-muted);">no changes — the default payload is sent</span>';
        $('fc-preview').textContent = JSON.stringify(body, null, 2);
    }

    function showSection(sec) {
        state.sec = sec;
        document.querySelectorAll('#fc-pills .fc-pill').forEach(p => p.classList.toggle('active', p.dataset.sec === sec));
        document.querySelectorAll('.fc-sec').forEach(s => { s.style.display = s.dataset.sec === sec ? '' : 'none'; });
        if (sec === 'preview') update();
    }

    function reset() {
        document.querySelectorAll('#fc-det select').forEach(s => { s.selectedIndex = 0; });
        document.querySelectorAll('#fc-det input[type="text"], #fc-det input[type="number"], #fc-det input[type="datetime-local"], #fc-det textarea').forEach(i => { i.value = ''; });
        document.querySelectorAll('#fc-det input[type="checkbox"]').forEach(c => { c.checked = c.id === 'fc-pm-hide'; });
        $('fc-exp-u').value = '3600';
        state.pmMode = 'default'; state.pmSel = new Set();
        document.querySelectorAll('#fc-pm-mode .fc-pill').forEach(p => p.classList.toggle('active', p.dataset.mode === 'default'));
        update();
    }

    function init() {
        if (!$('fc-det')) return;
        const opts = (typeof COUNTRIES !== 'undefined' ? COUNTRIES : []).map(c => `<option value="${esc(c.alpha2Code)}">${esc(c.name)} (${esc(c.alpha2Code)})</option>`).join('');
        $('fc-s-country').innerHTML = opts; $('fc-s-country').value = 'DE';

        $('fc-det').addEventListener('click', (e) => {
            const pill = e.target.closest('#fc-pills .fc-pill'); if (pill) return showSection(pill.dataset.sec);
            const mode = e.target.closest('#fc-pm-mode .fc-pill');
            if (mode) {
                state.pmMode = mode.dataset.mode;
                document.querySelectorAll('#fc-pm-mode .fc-pill').forEach(p => p.classList.toggle('active', p === mode));
                return update();
            }
            const chip = e.target.closest('.fc-chip');
            if (chip && state.pmMode !== 'default') { const id = chip.dataset.pm; state.pmSel.has(id) ? state.pmSel.delete(id) : state.pmSel.add(id); return update(); }
            if (chip) { state.pmMode = 'allow'; document.querySelectorAll('#fc-pm-mode .fc-pill').forEach(p => p.classList.toggle('active', p.dataset.mode === 'allow')); state.pmSel.add(chip.dataset.pm); return update(); }
        });
        $('fc-det').addEventListener('input', update);
        $('fc-det').addEventListener('change', update);
        $('fc-reset').addEventListener('click', reset);
        // the main form feeds the base payload and compatibility hints — keep the preview in step with it
        ['country-select', 'currency-select', 'payment-type-select', '3ds-toggle', 'capture-toggle', 'remember-me-toggle', 'amount-input', 'email-input', 'name-input', 'flow-locale-select']
            .forEach(id => $(id)?.addEventListener('change', () => setTimeout(update, 0)));
        ['amount-input', 'email-input', 'name-input'].forEach(id => $(id)?.addEventListener('input', () => setTimeout(update, 0)));
        showSection('methods');
        setTimeout(update, 0);   // after flow.js has built paymentSessionBody
    }

    window.FlowConfig = { apply };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
