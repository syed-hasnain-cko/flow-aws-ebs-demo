// =============================================
// Forward API Module
// Handles: forwarding a token/instrument to any destination (built-in or
// custom), raw/encrypted headers, CIT/MIT source gating, live Postman-style
// request/response viewer with lock/unlock two-way sync.
// =============================================

(function () {

    const API_BASE = window.APP_CONFIG?.apiBaseUrl || '';
    const CFG_STORAGE_KEY = 'cko-forward-config';
    const CUSTOM_DEST_STORAGE_KEY = 'cko-forward-custom-destinations';
    const DEST_AUTH_STORAGE_KEY = 'cko-forward-destination-auth'; // per-destination Authorization header override

    // ─── State ──────────────────────────────────────────────────────────
    let _config = { secretKey: '', publicKey: '', processingChannelId: '', stripeKey: '', adyenKey: '' };
    let _useCase = 'cit';                 // 'cit' | 'mit'
    let _source = 'instrument';           // 'token' | 'instrument' — defaults to instrument
    let _latestToken = null;
    let _tokenCardComponent = null;
    let _selectedInstrument = null;       // { id, scheme, last4, type }
    let _activeDestKey = null;            // key of active built-in/custom destination, or null (custom typed)
    let _activeDest = null;               // the full destination object currently applied
    let _authEditorKey = null;            // destination key currently being edited in the auth override popover
    let _headersRows = [];                // [{ key, value }]
    let _queryRows = [];                  // [{ name, value }] — destination_request.query
    let _variableRows = [];               // [{ name, value }] — destination_request.variables
    let _lastEncryptedPreview = '';
    let _encryptedDebounce = null;
    let _activeEditorTab = 'request';
    let _lastForwardResponse = null;      // raw ForwardResponse from POST /forward-request
    let _lastForwardError = null;

    // ─── DOM helpers ────────────────────────────────────────────────────
    function val(id) { return document.getElementById(id)?.value ?? ''; }
    function setVal(id, v) { const e = document.getElementById(id); if (e) e.value = v; }
    function checked(id) { return document.getElementById(id)?.checked ?? false; }
    function show(id) { const e = document.getElementById(id); if (e) e.style.display = ''; }
    function hide(id) { const e = document.getElementById(id); if (e) e.style.display = 'none'; }
    function el(id) { return document.getElementById(id); }

    // ─── Config panel ───────────────────────────────────────────────────
    async function loadForwardConfig() {
        let stored = null;
        try { stored = JSON.parse(localStorage.getItem(CFG_STORAGE_KEY) || 'null'); } catch { /* ignore */ }

        let envDefaults = { secretKey: '', publicKey: '', processingChannelId: '', stripeApiKey: '', adyenApiKey: '' };
        try {
            const res = await fetch(`${API_BASE}/forward-config`);
            envDefaults = await res.json();
        } catch (err) {
            showToast('Could not load Forward API defaults from backend — enter credentials manually', 'error');
        }

        // All five fields are editable in the Forward API Config panel and persisted
        // together in `stored` when saved — env values are just the starting default.
        _config = {
            secretKey: stored?.secretKey ?? envDefaults.secretKey ?? '',
            publicKey: stored?.publicKey ?? envDefaults.publicKey ?? '',
            processingChannelId: stored?.processingChannelId ?? envDefaults.processingChannelId ?? '',
            stripeKey: stored?.stripeKey ?? envDefaults.stripeApiKey ?? '',
            adyenKey: stored?.adyenKey ?? envDefaults.adyenApiKey ?? '',
        };

        setVal('fwd-cfg-secret-key', _config.secretKey);
        setVal('fwd-cfg-public-key', _config.publicKey);
        setVal('fwd-cfg-channel-id', _config.processingChannelId);
        setVal('fwd-cfg-stripe-key', _config.stripeKey);
        setVal('fwd-cfg-adyen-key', _config.adyenKey);
        setVal('fwd-processing-channel-display', _config.processingChannelId);
    }

    function saveForwardConfig() {
        _config = {
            secretKey: val('fwd-cfg-secret-key'),
            publicKey: val('fwd-cfg-public-key'),
            processingChannelId: val('fwd-cfg-channel-id'),
            stripeKey: val('fwd-cfg-stripe-key'),
            adyenKey: val('fwd-cfg-adyen-key'),
        };
        localStorage.setItem(CFG_STORAGE_KEY, JSON.stringify(_config));
        setVal('fwd-processing-channel-display', _config.processingChannelId);
        const statusEl = el('fwd-cfg-status');
        statusEl.style.display = '';
        statusEl.style.color = 'var(--success)';
        statusEl.textContent = '✓ Saved to this browser. Used only for Forward API calls on this tab.';
        setTimeout(() => { statusEl.style.display = 'none'; }, 3000);
        // Re-mount tokenizer with new creds if token source is active
        if (_source === 'token') mountTokenCardField();
        refreshActiveDestinationCreds();
    }

    async function resetForwardConfig() {
        localStorage.removeItem(CFG_STORAGE_KEY);
        await loadForwardConfig();
        showToast('Forward API config reset to .env defaults', 'success');
        if (_source === 'token') mountTokenCardField();
        refreshActiveDestinationCreds();
    }

    function toggleConfigPanel() {
        const panel = el('fwd-config-panel');
        const chevron = el('fwd-config-chevron');
        const isOpen = panel.style.display !== 'none';
        panel.style.display = isOpen ? 'none' : '';
        chevron.textContent = isOpen ? '▸ expand' : '▾ collapse';
    }

    // ─── Use case (CIT/MIT) ─────────────────────────────────────────────
    function selectUseCase(uc) {
        _useCase = uc;
        el('fwd-usecase-cit').classList.toggle('active', uc === 'cit');
        el('fwd-usecase-mit').classList.toggle('active', uc === 'mit');

        const tokenOption = el('fwd-source-token');
        if (uc === 'mit') {
            // MIT: no cardholder present — tokenization isn't applicable. Force instrument source.
            tokenOption.style.opacity = '0.4';
            tokenOption.style.pointerEvents = 'none';
            tokenOption.title = 'Not available for MIT — no cardholder present to tokenize a card';
            if (_source === 'token') selectSource('instrument');
        } else {
            tokenOption.style.opacity = '';
            tokenOption.style.pointerEvents = '';
            tokenOption.title = '';
        }
        updateMitCheckoutPanel();
        rebuildAndRenderEditor();
    }

    // ─── Source (token/instrument) ──────────────────────────────────────
    function selectSource(src) {
        if (_useCase === 'mit' && src === 'token') return; // guarded — MIT can't tokenize
        _source = src;
        el('fwd-source-token').classList.toggle('active', src === 'token');
        el('fwd-source-instrument').classList.toggle('active', src === 'instrument');

        if (src === 'token') {
            show('fwd-token-fields');
            hide('fwd-instrument-fields');
            mountTokenCardField();
        } else {
            hide('fwd-token-fields');
            show('fwd-instrument-fields');
        }
        rebuildAndRenderEditor();
    }

    // ─── Token source: Flow tokenization-only card field ────────────────
    async function mountTokenCardField() {
        const host = el('fwd-token-card-host');
        if (!host) return;
        if (!_config.publicKey || !_config.processingChannelId) {
            host.innerHTML = `<div style="font-size:12px; color:var(--error); padding:12px 0;">
                ⚠️ No public key / processing channel ID configured. Open <strong>Forward API Config</strong> above
                and fill them in (or click "Reset to .env defaults" if <code>GET /forward-config</code> isn't reachable yet —
                check the new backend routes are deployed).</div>`;
            el('fwd-tokenize-btn').disabled = true;
            return;
        }
        host.innerHTML = '<div style="font-size:12px; color:var(--text-secondary); padding:12px 0;">Loading card field…</div>';
        el('fwd-tokenize-btn').disabled = true;

        try {
            const sessionBody = {
                amount: 200,
                currency: 'USD',
                processing_channel_id: _config.processingChannelId,
                reference: `forward-tokenize-${Date.now()}`,
                success_url: `${window.location.origin}/success.html`,
                failure_url: `${window.location.origin}/failure.html`,
                disabled_payment_methods: ['remember_me'],
                billing: { address: { country: 'DE' } },
                overrideSecretKey: _config.secretKey,
            };
            const sessionRes = await fetch(`${API_BASE}/payment-sessions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(sessionBody),
            });
            const paymentSession = await sessionRes.json();
            addToApiLog('POST', '/payment-sessions (forward tokenizer)', sessionRes.status, { ...sessionBody, overrideSecretKey: '•••' }, paymentSession);

            if (!paymentSession?.id) throw new Error('Payment session creation failed: ' + JSON.stringify(paymentSession));

            const checkout = await CheckoutWebComponents({
                publicKey: _config.publicKey,
                environment: 'sandbox',
                locale: 'en-GB',
                paymentSession,
                componentOptions: { card: { data: { cardholderName: 'Syed Hasnain' }, displayCardholderName: 'bottom' } },
                appearance: getFlowAppearance(),
                onReady: () => {},
                onChange: () => {},
                onError: (_c, error) => console.error('Forward tokenizer error:', error),
            });

            _tokenCardComponent = checkout.create('card', { showPayButton: false });
            host.innerHTML = '';
            if (await _tokenCardComponent.isAvailable()) _tokenCardComponent.mount(host);
            el('fwd-tokenize-btn').disabled = false;
        } catch (err) {
            host.innerHTML = `<div style="font-size:12px; color:var(--error); padding:12px 0;">Failed to load card field: ${err.message}</div>`;
            console.error(err);
        }
    }

    async function onTokenizeClick() {
        if (!_tokenCardComponent) { showToast('Card field not ready yet', 'error'); return; }
        const btn = el('fwd-tokenize-btn');
        btn.disabled = true;
        btn.textContent = 'Tokenizing…';
        try {
            const { data } = await _tokenCardComponent.tokenize();
            if (!data?.token) throw new Error('Tokenization returned no token');
            _latestToken = data.token; // re-tokenizing always swaps to the latest token
            el('fwd-token-value').textContent = _latestToken;
            show('fwd-token-badge');
            showToast('Card tokenized — token loaded into the request', 'success');
            rebuildAndRenderEditor();
        } catch (err) {
            showToast('Tokenization failed: ' + err.message, 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Tokenize Card';
        }
    }

    // ─── Instrument source: customer picker ─────────────────────────────
    async function loadCustomerInstruments() {
        const customerId = val('fwd-customer-id').trim();
        if (!customerId) { showToast('Enter a customer ID first', 'error'); return; }
        const select = el('fwd-instrument-select');
        const hint = el('fwd-instrument-hint');
        select.innerHTML = '<option value="">Loading…</option>';
        hint.textContent = '';

        try {
            const url = `${API_BASE}/forward-customer-instruments?customerId=${encodeURIComponent(customerId)}&overrideSecretKey=${encodeURIComponent(_config.secretKey)}`;
            const res = await fetch(url);
            const data = await res.json();
            addToApiLog('GET', '/forward-customer-instruments', res.status, { customerId, overrideSecretKey: '•••' }, data);

            if (!res.ok) throw new Error(data?.error?.error_type || data?.error || `Request failed (${res.status})`);

            const instruments = (data.instruments || []).filter(i => i.id && i.id.startsWith('src_'));
            if (instruments.length === 0) {
                select.innerHTML = '<option value="">No card instruments found for this customer</option>';
                hint.textContent = 'This customer has no stored card instruments.';
                return;
            }

            select.innerHTML = instruments.map(i => {
                const scheme = i.scheme || i.card_type || 'card';
                const last4 = i.last4 || i.card_details?.last4 || '••••';
                const type = i.card_category || i.card_type || '';
                return `<option value="${i.id}" data-scheme="${scheme}" data-last4="${last4}">${scheme.toUpperCase()} •••• ${last4}${type ? ` — ${type}` : ''}</option>`;
            }).join('');
            onInstrumentSelect();
            showToast(`Loaded ${instruments.length} instrument(s)`, 'success');
        } catch (err) {
            select.innerHTML = '<option value="">Failed to load</option>';
            hint.textContent = 'Error: ' + err.message;
            showToast('Failed to load instruments: ' + err.message, 'error');
        }
    }

    function onInstrumentSelect() {
        const select = el('fwd-instrument-select');
        const opt = select.selectedOptions[0];
        if (!opt || !opt.value) { _selectedInstrument = null; return; }
        _selectedInstrument = { id: opt.value, scheme: opt.dataset.scheme, last4: opt.dataset.last4 };
        el('fwd-instrument-hint').textContent = `Selected: ${opt.dataset.scheme?.toUpperCase()} card ending in ${opt.dataset.last4}`;
        rebuildAndRenderEditor();
    }

    // ─── Destination: saved list ─────────────────────────────────────────
    function getCustomDestinations() {
        try { return JSON.parse(localStorage.getItem(CUSTOM_DEST_STORAGE_KEY) || '[]'); } catch { return []; }
    }
    function saveCustomDestination(dest) {
        const list = getCustomDestinations();
        list.push(dest);
        localStorage.setItem(CUSTOM_DEST_STORAGE_KEY, JSON.stringify(list));
        renderDestSavedList();
    }

    function getAllDestinations() {
        return [...FORWARD_BUILTIN_DESTINATIONS, ...getCustomDestinations()];
    }

    // ─── Per-destination Authorization override ──────────────────────────
    // Lets you configure the auth header for ANY destination (built-in or
    // custom) independently, persisted per browser — separate from the
    // one-off raw headers editing in section 4.
    function getAuthOverrides() {
        try { return JSON.parse(localStorage.getItem(DEST_AUTH_STORAGE_KEY) || '{}'); } catch { return {}; }
    }
    function setAuthOverride(key, value) {
        const overrides = getAuthOverrides();
        if (value) overrides[key] = value; else delete overrides[key];
        localStorage.setItem(DEST_AUTH_STORAGE_KEY, JSON.stringify(overrides));
    }

    // Resolves what the Authorization header value should actually be for a
    // destination: manual override > built-in auto-auth (Checkout.com uses
    // the live Forward API Config secret key) > the template default.
    function authHeaderName(dest) { return dest.authHeaderName || 'Authorization'; }

    function resolveAuthValue(dest) {
        const overrides = getAuthOverrides();
        if (overrides[dest.key]) return overrides[dest.key];
        if (dest.autoAuth === 'forwardConfigSecretKey') {
            return `Bearer ${_config.secretKey || '<set a secret key in Forward API Config>'}`;
        }
        if (dest.autoAuth === 'forwardConfigStripeKey') {
            return `Bearer ${_config.stripeKey || '<set Stripe API Key in Forward API Config>'}`;
        }
        if (dest.autoAuth === 'forwardConfigAdyenKey') {
            return _config.adyenKey || '<set Adyen API Key in Forward API Config>';
        }
        const headerName = authHeaderName(dest).toLowerCase();
        const authHeader = (dest.headers || []).find(h => h.key.toLowerCase() === headerName);
        return authHeader?.value || '';
    }

    function renderDestSavedList() {
        const container = el('fwd-dest-saved-list');
        if (!container) return;
        const all = getAllDestinations();
        container.innerHTML = all.map(d => `
            <div class="fwd-dest-card${_activeDestKey === d.key ? ' active' : ''}" data-dest-key="${d.key}">
                <span class="fwd-dest-dot" style="background:${d.color || 'var(--primary)'}"></span>
                <span data-dest-select="${d.key}">${d.label}</span>
                <button type="button" class="fwd-dest-auth-btn" data-dest-auth="${d.key}" title="Configure auth for this destination">🔑</button>
            </div>`).join('');

        container.querySelectorAll('[data-dest-select]').forEach(labelEl => {
            labelEl.addEventListener('click', () => {
                const dest = all.find(d => d.key === labelEl.dataset.destSelect);
                if (dest) applyDestination(dest);
            });
        });
        container.querySelectorAll('[data-dest-auth]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                _authEditorKey = _authEditorKey === btn.dataset.destAuth ? null : btn.dataset.destAuth;
                renderAuthEditor();
            });
        });
        renderAuthEditor();
    }

    function renderAuthEditor() {
        const box = el('fwd-dest-auth-editor');
        if (!box) return;
        if (!_authEditorKey) { box.style.display = 'none'; box.innerHTML = ''; return; }

        const dest = getAllDestinations().find(d => d.key === _authEditorKey);
        if (!dest) { box.style.display = 'none'; return; }

        const current = resolveAuthValue(dest);
        const isAuto = !!dest.autoAuth && !getAuthOverrides()[dest.key];
        // All three keys now live in the Forward API Config panel — that panel itself
        // defaults from .env until edited, so "auto" always just means "from that panel".
        const autoSourceLabel = dest.autoAuth ? 'Forward API Config' : '';
        box.style.display = 'flex';
        box.innerHTML = `
            <div style="flex:1; min-width:220px;">
                <div style="font-size:11px; font-weight:700; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.04em; margin-bottom:4px;">
                    ${authHeaderName(dest)} header for ${dest.label}${isAuto ? ` (auto-filled from ${autoSourceLabel})` : ''}
                </div>
                <input type="text" id="fwd-dest-auth-input" class="text-input" style="font-family:monospace; font-size:12px;"
                    value="${escapeAttr(current)}" placeholder="e.g. Bearer sk_test_...">
            </div>
            <div style="display:flex; gap:6px; align-self:end;">
                <button id="fwd-dest-auth-save" class="main-button" style="padding:6px 14px; font-size:12px;">Save</button>
                ${!isAuto ? `<button id="fwd-dest-auth-clear" class="copy-btn" style="font-size:12px;">Reset to auto</button>` : ''}
                <button id="fwd-dest-auth-close" class="copy-btn" style="font-size:12px;">Close</button>
            </div>`;

        el('fwd-dest-auth-save').addEventListener('click', () => {
            setAuthOverride(dest.key, val('fwd-dest-auth-input'));
            showToast(`Auth saved for ${dest.label}`, 'success');
            if (_activeDestKey === dest.key) applyDestination(dest);
            _authEditorKey = null;
            renderDestSavedList();
        });
        const clearBtn = el('fwd-dest-auth-clear');
        if (clearBtn) clearBtn.addEventListener('click', () => {
            setAuthOverride(dest.key, null);
            showToast(`Reset to auto for ${dest.label}`, 'success');
            if (_activeDestKey === dest.key) applyDestination(dest);
            _authEditorKey = null;
            renderDestSavedList();
        });
        el('fwd-dest-auth-close').addEventListener('click', () => { _authEditorKey = null; renderDestSavedList(); });
    }

    function isCustomDestinationKey(key) { return typeof key === 'string' && key.startsWith('custom-'); }

    // ─── MIT → Checkout.com body wiring ───────────────────────────────────
    // Only the built-in 'checkout' destination gets merchant_initiated/payment_type/
    // previous_payment_id auto-wired into its body. Every other destination (built-in
    // or custom) is left completely untouched, per the MIT usecase being CKO-specific.
    function updateMitCheckoutPanel() {
        const isMitCheckout = _useCase === 'mit' && _activeDestKey === 'checkout';
        if (isMitCheckout) show('fwd-mit-checkout-panel'); else hide('fwd-mit-checkout-panel');
        syncMitFieldsIntoBody(isMitCheckout);
    }

    function syncMitFieldsIntoBody(enable) {
        if (_activeDestKey !== 'checkout') return; // never touch any other destination's body
        const ta = el('fwd-body-textarea');
        let parsed;
        try {
            parsed = JSON.parse(ta.value);
        } catch {
            return; // body isn't valid JSON right now (e.g. mid manual-edit) — don't clobber it
        }
        if (enable) {
            parsed.merchant_initiated = true;
            parsed.payment_type = val('fwd-mit-payment-type');
            const prevId = val('fwd-mit-previous-payment-id').trim();
            if (prevId) parsed.previous_payment_id = prevId;
            else delete parsed.previous_payment_id;
        } else {
            delete parsed.merchant_initiated;
            delete parsed.previous_payment_id;
            delete parsed.payment_type;
        }
        ta.value = JSON.stringify(parsed, null, 2);
        rebuildAndRenderEditor();
    }

    function applyDestination(dest) {
        _activeDestKey = dest.key;
        _activeDest = dest;
        setVal('fwd-dest-url', dest.url);
        setVal('fwd-dest-method', dest.method || 'POST');
        setVal('fwd-headers-type', dest.headersType || 'raw');

        _headersRows = (dest.headers || []).map(h => ({ ...h }));
        const headerName = authHeaderName(dest);
        const authRow = _headersRows.find(h => h.key.toLowerCase() === headerName.toLowerCase());
        const resolvedAuth = resolveAuthValue(dest);
        if (authRow) authRow.value = resolvedAuth;
        else if (resolvedAuth) _headersRows.unshift({ key: headerName, value: resolvedAuth });

        _queryRows = (dest.query || []).map(q => ({ ...q }));
        _variableRows = (dest.variables || []).map(v => ({ ...v }));

        let body = dest.body || '';
        if (dest.autoChannelId && _config.processingChannelId) {
            body = body.replace(/pc_x+[a-z0-9x]*/i, _config.processingChannelId);
        }
        setVal('fwd-body-textarea', body);

        // Query & Variables default to OFF regardless of the destination's demo data —
        // the rows are pre-populated so the example is one click away, but the user has
        // to explicitly enable a section before it's included in the request.
        // Set toggle state AFTER the body is loaded — the sync it triggers operates
        // on the destination's own (now current) body, not a stale leftover one.
        el('fwd-query-enable').checked = false;
        el('fwd-variable-enable').checked = false;
        onQueryEnableToggle();
        onVariableEnableToggle();

        onHeadersTypeChange();
        renderHeadersRows();
        renderQueryRows();
        renderVariableRows();
        renderDestSavedList();
        hide('fwd-dest-save-banner');
        el('fwd-dest-manage-row').style.display = isCustomDestinationKey(dest.key) ? 'flex' : 'none';
        updateMitCheckoutPanel();
        rebuildAndRenderEditor();
    }

    // Re-applies the currently active destination so an auto-filled auth
    // header / channel ID picks up fresh values after Forward API Config changes.
    function refreshActiveDestinationCreds() {
        if (_activeDest) applyDestination(_activeDest);
    }

    function onDestFieldManualChange() {
        _activeDestKey = null;
        renderDestSavedList();
        el('fwd-dest-manage-row').style.display = 'none';
        updateMitCheckoutPanel(); // leaving 'checkout' via manual edit — hide/clean up the MIT panel
        rebuildAndRenderEditor();
    }

    function onDestUrlBlur() {
        const url = val('fwd-dest-url').trim();
        if (!url) { hide('fwd-dest-save-banner'); return; }
        const known = [...FORWARD_BUILTIN_DESTINATIONS, ...getCustomDestinations()];
        const matches = known.some(d => d.url === url);
        if (!matches) show('fwd-dest-save-banner'); else hide('fwd-dest-save-banner');
    }

    function onSaveDestinationClick() {
        const name = val('fwd-dest-save-name').trim();
        if (!name) { showToast('Give the destination a name first', 'error'); return; }
        const key = 'custom-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now();
        const dest = {
            key,
            label: name,
            color: '#8B5CF6',
            url: val('fwd-dest-url'),
            method: val('fwd-dest-method'),
            headersType: val('fwd-headers-type'),
            headers: _headersRows.map(h => ({ ...h })),
            query: buildQueryArray(),
            variables: buildVariablesArray(),
            body: val('fwd-body-textarea'),
        };
        saveCustomDestination(dest);
        _activeDestKey = key;
        _activeDest = dest;
        renderDestSavedList();
        hide('fwd-dest-save-banner');
        el('fwd-dest-manage-row').style.display = 'flex';
        showToast(`Saved "${name}" for future use`, 'success');
    }

    function setCustomDestinations(list) {
        localStorage.setItem(CUSTOM_DEST_STORAGE_KEY, JSON.stringify(list));
    }

    function onUpdateDestinationClick() {
        if (!isCustomDestinationKey(_activeDestKey)) return;
        const list = getCustomDestinations();
        const idx = list.findIndex(d => d.key === _activeDestKey);
        if (idx === -1) { showToast('Could not find this saved destination', 'error'); return; }
        list[idx] = {
            ...list[idx],
            url: val('fwd-dest-url'),
            method: val('fwd-dest-method'),
            headersType: val('fwd-headers-type'),
            headers: _headersRows.map(h => ({ ...h })),
            query: buildQueryArray(),
            variables: buildVariablesArray(),
            body: val('fwd-body-textarea'),
        };
        setCustomDestinations(list);
        _activeDest = list[idx];
        renderDestSavedList();
        showToast(`Updated "${list[idx].label}"`, 'success');
    }

    function onDeleteDestinationClick() {
        if (!isCustomDestinationKey(_activeDestKey)) return;
        const list = getCustomDestinations();
        const dest = list.find(d => d.key === _activeDestKey);
        setCustomDestinations(list.filter(d => d.key !== _activeDestKey));
        setAuthOverride(_activeDestKey, null);
        _activeDestKey = null;
        _activeDest = null;
        hide('fwd-dest-manage-row');
        renderDestSavedList();
        showToast(`Deleted "${dest?.label || 'destination'}"`, 'success');
    }

    // ─── Headers builder ──────────────────────────────────────────────────
    function renderHeadersRows() {
        const container = el('fwd-headers-rows');
        if (!container) return;
        if (_headersRows.length === 0) _headersRows = [{ key: '', value: '' }];

        container.innerHTML = _headersRows.map((_, i) => `
            <div class="fwd-header-row" data-row="${i}">
                <input type="text" class="fwd-header-key" placeholder="Header-Name" value="${escapeAttr(_headersRows[i].key)}">
                <input type="text" class="fwd-header-value" placeholder="value" value="${escapeAttr(_headersRows[i].value)}">
                <button class="fwd-header-del" title="Delete header" type="button">✕</button>
            </div>`).join('');

        container.querySelectorAll('[data-row]').forEach(row => {
            const i = parseInt(row.dataset.row, 10);
            row.querySelector('.fwd-header-key').addEventListener('input', (e) => { _headersRows[i].key = e.target.value; onHeadersChanged(); });
            row.querySelector('.fwd-header-value').addEventListener('input', (e) => { _headersRows[i].value = e.target.value; onHeadersChanged(); });
            row.querySelector('.fwd-header-del').addEventListener('click', () => {
                _headersRows.splice(i, 1);
                renderHeadersRows();
                onHeadersChanged();
            });
        });
    }

    function addHeaderRow() {
        _headersRows.push({ key: '', value: '' });
        renderHeadersRows();
    }

    function escapeAttr(s) {
        return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    }

    function buildHeadersRawObject() {
        const obj = {};
        _headersRows.forEach(({ key, value }) => { if (key && key.trim()) obj[key.trim()] = value ?? ''; });
        return obj;
    }

    // ─── Generic name/value row builder — used for Query Params & Variables ──
    function renderNameValueRows(containerId, rows, onChange, namePlaceholder) {
        const container = el(containerId);
        if (!container) return;

        container.innerHTML = rows.map((_, i) => `
            <div class="fwd-header-row" data-row="${i}">
                <input type="text" class="fwd-nv-name" placeholder="${namePlaceholder}" value="${escapeAttr(rows[i].name)}">
                <input type="text" class="fwd-nv-value" placeholder="value" value="${escapeAttr(rows[i].value)}">
                <button class="fwd-header-del" title="Delete" type="button">✕</button>
            </div>`).join('');

        container.querySelectorAll('[data-row]').forEach(row => {
            const i = parseInt(row.dataset.row, 10);
            row.querySelector('.fwd-nv-name').addEventListener('input', (e) => { rows[i].name = e.target.value; onChange(); });
            row.querySelector('.fwd-nv-value').addEventListener('input', (e) => { rows[i].value = e.target.value; onChange(); });
            row.querySelector('.fwd-header-del').addEventListener('click', () => {
                rows.splice(i, 1);
                if (rows.length === 0) rows.push({ name: '', value: '' });
                renderNameValueRows(containerId, rows, onChange, namePlaceholder);
                onChange();
            });
        });
    }

    function renderQueryRows() {
        if (_queryRows.length === 0) _queryRows = [{ name: '', value: '' }];
        renderNameValueRows('fwd-query-rows', _queryRows, rebuildAndRenderEditor, 'param-name');
    }
    function addQueryRow() { _queryRows.push({ name: '', value: '' }); renderQueryRows(); }
    function buildQueryArray() {
        if (!checked('fwd-query-enable')) return [];
        return _queryRows.filter(r => r.name && r.name.trim()).map(r => ({ name: r.name.trim(), value: r.value ?? '' }));
    }
    function onQueryEnableToggle() {
        if (checked('fwd-query-enable')) show('fwd-query-fields'); else hide('fwd-query-fields');
        rebuildAndRenderEditor();
    }

    function renderVariableRows() {
        if (_variableRows.length === 0) _variableRows = [{ name: '', value: '' }];
        renderNameValueRows('fwd-variable-rows', _variableRows, rebuildAndRenderEditor, 'variable_name');
    }
    function addVariableRow() { _variableRows.push({ name: '', value: '' }); renderVariableRows(); }
    function buildVariablesArray() {
        if (!checked('fwd-variable-enable')) return [];
        return _variableRows.filter(r => r.name && r.name.trim()).map(r => ({ name: r.name.trim(), value: r.value ?? '' }));
    }
    function onVariableEnableToggle() {
        const enabled = checked('fwd-variable-enable');
        if (enabled) show('fwd-variable-fields'); else hide('fwd-variable-fields');
        syncCardDataReferenceInBody(enabled);
        rebuildAndRenderEditor();
    }

    // The built-in destinations reference the default `card_data` variable directly
    // in their body (metadata.card_data). If Variables gets disabled, that reference
    // would otherwise sit in the body unresolved and still get sent to the destination.
    // Only touches the body for destinations we authored this exact shape for — a
    // custom/other destination's body is left alone (its own variables just stop
    // being defined, which is enough for those).
    function syncCardDataReferenceInBody(enabled) {
        if (!['checkout', 'stripe', 'adyen'].includes(_activeDestKey)) return;
        const ta = el('fwd-body-textarea');

        if (_activeDestKey === 'stripe') {
            if (enabled) {
                if (!ta.value.includes('metadata[card_data]')) ta.value += '&metadata[card_data]={{card_data}}';
            } else {
                ta.value = ta.value.replace(/&metadata\[card_data\]=\{\{card_data\}\}/, '');
            }
            return;
        }

        let parsed;
        try { parsed = JSON.parse(ta.value); } catch { return; } // mid manual-edit — don't clobber
        if (enabled) {
            parsed.metadata = { ...(parsed.metadata || {}), card_data: '{{card_data}}' };
        } else if (parsed.metadata) {
            delete parsed.metadata.card_data;
            if (Object.keys(parsed.metadata).length === 0) delete parsed.metadata;
        }
        ta.value = JSON.stringify(parsed, null, 2);
    }

    function onHeadersTypeChange() {
        const type = val('fwd-headers-type');
        if (type === 'encrypted') { show('fwd-headers-encrypted-wrap'); computeEncryptedPreview(); }
        else hide('fwd-headers-encrypted-wrap');
        rebuildAndRenderEditor();
    }

    function onHeadersChanged() {
        if (val('fwd-headers-type') === 'encrypted') computeEncryptedPreview();
        rebuildAndRenderEditor();
    }

    async function computeEncryptedPreview() {
        clearTimeout(_encryptedDebounce);
        _encryptedDebounce = setTimeout(async () => {
            const raw = buildHeadersRawObject();
            const preview = el('fwd-headers-encrypted-preview');
            if (Object.keys(raw).length === 0) {
                preview.textContent = 'Add a raw header above to see the encrypted preview…';
                _lastEncryptedPreview = '';
                return;
            }
            preview.textContent = 'Encrypting…';
            try {
                if (typeof window.joseEncryptHeaders !== 'function') throw new Error('Encryption module still loading — try again in a moment');
                const jwe = await window.joseEncryptHeaders(raw);
                _lastEncryptedPreview = jwe;
                preview.textContent = jwe;
                rebuildAndRenderEditor();
            } catch (err) {
                preview.textContent = '❌ Encryption failed: ' + err.message;
                _lastEncryptedPreview = '';
            }
        }, 350);
    }

    // ─── Network token & signature ───────────────────────────────────────
    function onNetworkTokenToggle() {
        if (checked('fwd-nt-enable')) {
            show('fwd-nt-fields');
            // Sensible default: CIT wants a cryptogram, MIT doesn't.
            el('fwd-nt-cryptogram').checked = (_useCase === 'cit');
        } else {
            hide('fwd-nt-fields');
        }
        rebuildAndRenderEditor();
    }

    function onSignatureTypeChange() {
        const type = val('fwd-signature-type');
        ['dlocal', 'mastercard', 'visa'].forEach(t => {
            const box = el(`fwd-sig-${t}`);
            if (box) box.style.display = (t === type) ? '' : 'none';
        });
        rebuildAndRenderEditor();
    }

    // ─── Reference ────────────────────────────────────────────────────────
    function generateReference() {
        setVal('fwd-reference', `FWD-${Math.floor(1000 + Math.random() * 9000)}`);
        rebuildAndRenderEditor();
    }

    // ─── Placeholder reference panel ─────────────────────────────────────
    function togglePhPanel() {
        const panel = el('fwd-ph-panel');
        const chevron = el('fwd-ph-chevron');
        const isOpen = panel.style.display !== 'none';
        panel.style.display = isOpen ? 'none' : '';
        chevron.textContent = isOpen ? '▸ expand' : '▾ collapse';
    }

    let _activePhTab = 'card';
    function renderPhTabs() {
        const tabsEl = el('fwd-ph-tabs');
        tabsEl.innerHTML = Object.keys(FORWARD_PLACEHOLDERS).map(key =>
            `<div class="fwd-ph-tab${key === _activePhTab ? ' fwd-ph-tab-active' : ''}" data-ph-tab="${key}">${FORWARD_PLACEHOLDERS[key].label}</div>`
        ).join('');
        tabsEl.querySelectorAll('[data-ph-tab]').forEach(t => t.addEventListener('click', () => { _activePhTab = t.dataset.phTab; renderPhTabs(); renderPhChips(); }));
        renderPhChips();
    }
    function renderPhChips() {
        const body = el('fwd-ph-body');
        body.innerHTML = FORWARD_PLACEHOLDERS[_activePhTab].values.map(v =>
            `<span class="fwd-ph-chip" data-tag="${v.tag}" title="${escapeAttr(v.desc)}">${v.tag}</span>`
        ).join('');
        body.querySelectorAll('.fwd-ph-chip').forEach(chip => chip.addEventListener('click', () => insertPlaceholder(chip.dataset.tag)));
    }
    function insertPlaceholder(tag) {
        const ta = el('fwd-body-textarea');
        const start = ta.selectionStart ?? ta.value.length;
        const end = ta.selectionEnd ?? ta.value.length;
        ta.value = ta.value.slice(0, start) + tag + ta.value.slice(end);
        ta.focus();
        ta.selectionStart = ta.selectionEnd = start + tag.length;
        rebuildAndRenderEditor();
    }

    // ─── Build the Forward Request body ──────────────────────────────────
    function buildSource() {
        if (_source === 'token') return { type: 'token', token: _latestToken || '<tokenize a card first>' };
        return { type: 'id', id: _selectedInstrument?.id || '<load and select an instrument first>' };
    }

    function buildHeaders() {
        const type = val('fwd-headers-type');
        if (type === 'encrypted') return { raw: {}, encrypted: _lastEncryptedPreview || '<add raw headers to generate>' };
        return { raw: buildHeadersRawObject() };
    }

    function buildSignature() {
        const type = val('fwd-signature-type');
        if (type === 'dlocal') {
            return { type: 'dlocal', dlocal_parameters: { secret_key: val('fwd-sig-dlocal-secret') } };
        }
        if (type === 'mastercard') {
            return { type: 'mastercard', mastercard_parameters: { consumer_key: val('fwd-sig-mc-consumer'), signing_key: val('fwd-sig-mc-signing') } };
        }
        if (type === 'visa') {
            const sig = { type: 'visa', visa_parameters: { shared_secret: val('fwd-sig-visa-secret') } };
            const prefix = val('fwd-sig-visa-prefix');
            if (prefix) sig.visa_parameters.remove_resource_path_prefix = prefix;
            return sig;
        }
        return null;
    }

    function buildDestinationRequest() {
        const dr = {
            url: val('fwd-dest-url'),
            method: val('fwd-dest-method'),
            headers: buildHeaders(),
            body: val('fwd-body-textarea'),
        };
        const query = buildQueryArray();
        if (query.length) dr.query = query;
        const variables = buildVariablesArray();
        if (variables.length) dr.variables = variables;
        const signature = buildSignature();
        if (signature) dr.signature = signature;
        return dr;
    }

    function buildNetworkToken() {
        if (!checked('fwd-nt-enable')) return null;
        return { enabled: true, request_cryptogram: checked('fwd-nt-cryptogram') };
    }

    function buildForwardRequestBody() {
        const body = {
            source: buildSource(),
            reference: val('fwd-reference'),
            processing_channel_id: _config.processingChannelId,
            destination_request: buildDestinationRequest(),
        };
        const networkToken = buildNetworkToken();
        if (networkToken) body.network_token = networkToken;
        return body;
    }

    // ─── Editor viewer ────────────────────────────────────────────────────
    function switchEditorTab(tab) {
        _activeEditorTab = tab;
        document.querySelectorAll('.fwd-tab-btn').forEach(b => b.classList.toggle('fwd-tab-active', b.dataset.tab === tab));
        renderEditor();
    }

    function renderEditor() {
        const pane = el('fwd-editor-pane');
        const textarea = el('fwd-editor-textarea');
        const applyBtn = el('fwd-editor-apply-btn');
        const unlocked = checked('fwd-editor-unlock') && _activeEditorTab === 'request';

        let content;
        switch (_activeEditorTab) {
            case 'request':
                content = JSON.stringify(buildForwardRequestBody(), null, 2);
                break;
            case 'response':
                if (!_lastForwardResponse && !_lastForwardError) content = '// Submit a request to see the Forward API response here.';
                else if (_lastForwardError) content = JSON.stringify(_lastForwardError, null, 2);
                else {
                    const { destination_response, ...rest } = _lastForwardResponse;
                    content = JSON.stringify(rest, null, 2);
                }
                break;
            case 'dest-request':
                content = JSON.stringify(buildDestinationRequest(), null, 2);
                break;
            case 'dest-response':
                if (!_lastForwardResponse?.destination_response) content = '// Submit a request to see the destination\'s response here.';
                else {
                    const dr = _lastForwardResponse.destination_response;
                    let body = dr.body;
                    try { body = JSON.parse(dr.body); } catch { /* leave as string */ }
                    content = JSON.stringify({ status: dr.status, headers: dr.headers, body }, null, 2);
                }
                break;
        }

        if (unlocked) {
            pane.style.display = 'none';
            textarea.style.display = '';
            textarea.value = content;
            applyBtn.style.display = '';
        } else {
            pane.style.display = '';
            textarea.style.display = 'none';
            applyBtn.style.display = 'none';
            pane.textContent = content;
        }
    }

    function rebuildAndRenderEditor() {
        if (checked('fwd-editor-unlock') && _activeEditorTab === 'request') return; // don't clobber a pending manual edit
        renderEditor();
    }

    function applyEditsToForm() {
        let parsed;
        try {
            parsed = JSON.parse(el('fwd-editor-textarea').value);
        } catch (err) {
            showToast('Invalid JSON — fix syntax before applying: ' + err.message, 'error');
            return;
        }

        if (parsed.source) {
            if (parsed.source.type === 'token') {
                _source = 'token';
                _latestToken = parsed.source.token;
                el('fwd-token-value').textContent = _latestToken || '';
                if (_latestToken) show('fwd-token-badge');
            } else if (parsed.source.type === 'id') {
                _source = 'instrument';
                _selectedInstrument = { id: parsed.source.id };
            }
            el('fwd-source-token').classList.toggle('active', _source === 'token');
            el('fwd-source-instrument').classList.toggle('active', _source === 'instrument');
            if (_source === 'token') { show('fwd-token-fields'); hide('fwd-instrument-fields'); }
            else { hide('fwd-token-fields'); show('fwd-instrument-fields'); }
        }
        if (typeof parsed.reference === 'string') setVal('fwd-reference', parsed.reference);

        const dr = parsed.destination_request || {};
        if (typeof dr.url === 'string') setVal('fwd-dest-url', dr.url);
        if (typeof dr.method === 'string') setVal('fwd-dest-method', dr.method);
        if (typeof dr.body === 'string') setVal('fwd-body-textarea', dr.body);
        if (dr.headers) {
            if (dr.headers.encrypted) {
                setVal('fwd-headers-type', 'encrypted');
                _lastEncryptedPreview = dr.headers.encrypted;
                el('fwd-headers-encrypted-preview').textContent = _lastEncryptedPreview;
                show('fwd-headers-encrypted-wrap');
            } else {
                setVal('fwd-headers-type', 'raw');
                hide('fwd-headers-encrypted-wrap');
            }
            if (dr.headers.raw && typeof dr.headers.raw === 'object') {
                _headersRows = Object.entries(dr.headers.raw).map(([key, value]) => ({ key, value: String(value) }));
                renderHeadersRows();
            }
        }
        if (Array.isArray(dr.query)) {
            _queryRows = dr.query.map(q => ({ name: q.name || '', value: q.value ?? '' }));
            renderQueryRows();
        }
        if (Array.isArray(dr.variables)) {
            _variableRows = dr.variables.map(v => ({ name: v.name || '', value: v.value ?? '' }));
            renderVariableRows();
        }
        if (dr.signature?.type) {
            setVal('fwd-signature-type', dr.signature.type);
            onSignatureTypeChange();
            if (dr.signature.type === 'dlocal') setVal('fwd-sig-dlocal-secret', dr.signature.dlocal_parameters?.secret_key || '');
            if (dr.signature.type === 'mastercard') {
                setVal('fwd-sig-mc-consumer', dr.signature.mastercard_parameters?.consumer_key || '');
                setVal('fwd-sig-mc-signing', dr.signature.mastercard_parameters?.signing_key || '');
            }
            if (dr.signature.type === 'visa') {
                setVal('fwd-sig-visa-secret', dr.signature.visa_parameters?.shared_secret || '');
                setVal('fwd-sig-visa-prefix', dr.signature.visa_parameters?.remove_resource_path_prefix || '');
            }
        } else {
            setVal('fwd-signature-type', '');
            onSignatureTypeChange();
        }

        if (parsed.network_token?.enabled) {
            el('fwd-nt-enable').checked = true;
            el('fwd-nt-cryptogram').checked = !!parsed.network_token.request_cryptogram;
            show('fwd-nt-fields');
        } else {
            el('fwd-nt-enable').checked = false;
            hide('fwd-nt-fields');
        }

        _activeDestKey = null;
        _activeDest = null;
        hide('fwd-dest-manage-row');
        hide('fwd-mit-checkout-panel');
        renderDestSavedList();

        el('fwd-editor-unlock').checked = false;
        renderEditor();
        showToast('Edits applied to the form', 'success');
    }

    // ─── Submit ───────────────────────────────────────────────────────────
    async function onSubmit() {
        const body = buildForwardRequestBody();

        if (_source === 'token' && !_latestToken) { showToast('Tokenize a card first', 'error'); return; }
        if (_source === 'instrument' && !_selectedInstrument?.id) { showToast('Load and select an instrument first', 'error'); return; }
        if (!body.destination_request.url) { showToast('Destination URL is required', 'error'); return; }
        if (!_config.processingChannelId) { showToast('Set a processing_channel_id in Forward API Config first', 'error'); return; }

        const btn = el('fwd-submit-btn');
        btn.disabled = true;
        btn.textContent = 'Forwarding…';

        const reqPayload = { ...body, overrideSecretKey: _config.secretKey };
        const logRequest = { ...body }; // never log the secret key

        try {
            const res = await fetch(`${API_BASE}/forward-request`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(reqPayload),
            });
            const data = await res.json();
            addToApiLog('POST', '/forward-request', res.status, logRequest, data);

            if (res.ok) {
                _lastForwardResponse = data;
                _lastForwardError = null;
                const destStatus = data.destination_response?.status;
                if (destStatus && destStatus >= 400) {
                    showToast(`Forwarded — but destination responded ${destStatus}. Check Destination Response tab.`, 'error');
                } else {
                    showToast(`Forwarded successfully (${data.request_id || 'no id'})${destStatus ? ` — destination returned ${destStatus}` : ''}`, 'success');
                }
                switchEditorTab('response');
                setTimeout(() => switchEditorTab('dest-response'), 1600);
            } else {
                _lastForwardResponse = null;
                _lastForwardError = data;
                showToast(`Forward request rejected (${res.status}): ${data?.error_type || data?.error || 'see response for details'}`, 'error');
                switchEditorTab('response');
            }
        } catch (err) {
            _lastForwardError = { error: err.message };
            showToast('Network error while forwarding: ' + err.message, 'error');
            switchEditorTab('response');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Forward Request';
        }
    }

    // ─── Copy helpers ───────────────────────────────────────────────────
    async function copyText(text) {
        try { await navigator.clipboard.writeText(text); showToast('Copied to clipboard', 'success'); }
        catch { showToast('Copy failed', 'error'); }
    }

    function copyEditorJson() {
        copyText(el('fwd-editor-pane').style.display === 'none' ? el('fwd-editor-textarea').value : el('fwd-editor-pane').textContent);
    }

    function copyAsCurl() {
        let curl;
        if (_activeEditorTab === 'dest-request') {
            const dr = buildDestinationRequest();
            const headerLines = Object.entries(dr.headers.raw || {}).map(([k, v]) => `-H '${k}: ${v}'`).join(' ');
            const encryptedLine = dr.headers.encrypted ? `-H 'X-Encrypted-Headers: ${dr.headers.encrypted}'` : '';
            curl = `curl -X ${dr.method} '${dr.url}' ${headerLines} ${encryptedLine} -d '${dr.body.replace(/'/g, "'\\''")}'`;
        } else {
            const body = buildForwardRequestBody();
            curl = `curl -X POST '${(window.GW_URL_DISPLAY || 'https://api.sandbox.checkout.com')}/forward' \\\n  -H 'Authorization: Bearer ${_config.secretKey || '<your Forward API secret key>'}' \\\n  -H 'Content-Type: application/json' \\\n  -d '${JSON.stringify(body).replace(/'/g, "'\\''")}'`;
        }
        copyText(curl);
    }

    // ─── Postman collection export ────────────────────────────────────────
    function buildPostmanUrl(urlString, queryArray) {
        let parsed;
        try { parsed = new URL(urlString); } catch { parsed = null; }
        const query = (queryArray || []).map(q => ({ key: q.name, value: q.value }));
        if (!parsed) return { raw: urlString, query };
        return {
            raw: urlString,
            protocol: parsed.protocol.replace(':', ''),
            host: parsed.hostname.split('.'),
            path: parsed.pathname.split('/').filter(Boolean),
            query,
        };
    }

    function exportPostmanCollection() {
        const body = buildForwardRequestBody();
        const dr = body.destination_request;

        const forwardItem = {
            name: 'Forward API — POST /forward',
            request: {
                method: 'POST',
                header: [
                    { key: 'Authorization', value: `Bearer ${_config.secretKey || '<your Forward API secret key>'}` },
                    { key: 'Content-Type', value: 'application/json' },
                ],
                body: { mode: 'raw', raw: JSON.stringify(body, null, 2), options: { raw: { language: 'json' } } },
                url: buildPostmanUrl('https://api.sandbox.checkout.com/forward', []),
            },
            response: [],
        };

        const destHeaders = Object.entries(dr.headers.raw || {}).map(([key, value]) => ({ key, value: String(value) }));
        if (dr.headers.encrypted) destHeaders.push({ key: 'X-Encrypted-Headers-Note', value: 'headers.encrypted (JWE) — see Forward Request item for the full object' });

        const destItem = {
            name: `Destination — ${dr.method} ${(() => { try { return new URL(dr.url).hostname; } catch { return dr.url; } })()}`,
            request: {
                method: dr.method,
                header: destHeaders,
                body: { mode: 'raw', raw: dr.body },
                url: buildPostmanUrl(dr.url, dr.query),
            },
            response: [],
        };

        const collection = {
            info: {
                name: `Forward API — ${val('fwd-reference') || 'request'}`,
                schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
            },
            item: [forwardItem, destItem],
        };

        const blob = new Blob([JSON.stringify(collection, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `forward-api-${val('fwd-reference') || 'collection'}.postman_collection.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
        showToast('Postman collection downloaded', 'success');
    }

    // ─── Init ───────────────────────────────────────────────────────────
    function init() {
        if (!el('fwd-usecase-cit')) return; // tab not loaded

        loadForwardConfig().then(() => {
            applyDestination(FORWARD_BUILTIN_DESTINATIONS[0]);
            // Only mount the Flow tokenizer if Token is actually the active source —
            // default source is Instrument, so don't eagerly spend a payment-session call.
            if (_source === 'token') mountTokenCardField();
        });

        el('fwd-config-toggle').addEventListener('click', toggleConfigPanel);
        el('fwd-cfg-save-btn').addEventListener('click', saveForwardConfig);
        el('fwd-cfg-reset-btn').addEventListener('click', resetForwardConfig);
        el('fwd-cfg-secret-toggle').addEventListener('click', () => {
            const input = el('fwd-cfg-secret-key');
            input.type = input.type === 'password' ? 'text' : 'password';
        });

        el('fwd-usecase-cit').addEventListener('click', () => selectUseCase('cit'));
        el('fwd-usecase-mit').addEventListener('click', () => selectUseCase('mit'));
        el('fwd-source-token').addEventListener('click', () => selectSource('token'));
        el('fwd-source-instrument').addEventListener('click', () => selectSource('instrument'));

        el('fwd-tokenize-btn').addEventListener('click', onTokenizeClick);
        el('fwd-customer-load-btn').addEventListener('click', loadCustomerInstruments);
        el('fwd-instrument-select').addEventListener('change', onInstrumentSelect);

        el('fwd-dest-url').addEventListener('input', onDestFieldManualChange);
        el('fwd-dest-url').addEventListener('blur', onDestUrlBlur);
        el('fwd-dest-method').addEventListener('change', onDestFieldManualChange);
        el('fwd-dest-save-btn').addEventListener('click', onSaveDestinationClick);
        el('fwd-dest-save-dismiss').addEventListener('click', () => hide('fwd-dest-save-banner'));
        el('fwd-dest-update-btn').addEventListener('click', onUpdateDestinationClick);
        el('fwd-dest-delete-btn').addEventListener('click', onDeleteDestinationClick);

        el('fwd-headers-type').addEventListener('change', onHeadersTypeChange);
        el('fwd-headers-add-btn').addEventListener('click', addHeaderRow);

        el('fwd-query-add-btn').addEventListener('click', addQueryRow);
        el('fwd-variable-add-btn').addEventListener('click', addVariableRow);
        el('fwd-query-enable').addEventListener('change', onQueryEnableToggle);
        el('fwd-variable-enable').addEventListener('change', onVariableEnableToggle);

        el('fwd-mit-payment-type').addEventListener('change', () => syncMitFieldsIntoBody(true));
        el('fwd-mit-previous-payment-id').addEventListener('input', () => syncMitFieldsIntoBody(true));

        el('fwd-nt-enable').addEventListener('change', onNetworkTokenToggle);
        el('fwd-nt-cryptogram').addEventListener('change', rebuildAndRenderEditor);
        el('fwd-signature-type').addEventListener('change', onSignatureTypeChange);
        ['fwd-sig-dlocal-secret', 'fwd-sig-mc-consumer', 'fwd-sig-mc-signing', 'fwd-sig-visa-secret', 'fwd-sig-visa-prefix']
            .forEach(id => el(id).addEventListener('input', rebuildAndRenderEditor));

        el('fwd-body-textarea').addEventListener('input', rebuildAndRenderEditor);

        el('fwd-reference-regen').addEventListener('click', generateReference);
        el('fwd-ph-toggle').addEventListener('click', togglePhPanel);

        el('fwd-submit-btn').addEventListener('click', onSubmit);

        document.querySelectorAll('.fwd-tab-btn').forEach(btn => btn.addEventListener('click', () => switchEditorTab(btn.dataset.tab)));
        el('fwd-editor-unlock').addEventListener('change', renderEditor);
        el('fwd-editor-apply-btn').addEventListener('click', applyEditsToForm);
        el('fwd-editor-copy-btn').addEventListener('click', copyEditorJson);
        el('fwd-editor-copy-curl-btn').addEventListener('click', copyAsCurl);
        el('fwd-editor-export-postman-btn').addEventListener('click', exportPostmanCollection);

        generateReference();
        renderPhTabs();
        renderHeadersRows();
        renderQueryRows();
        renderVariableRows();
        switchEditorTab('request');

        document.addEventListener('themechange', () => {
            if (_source === 'token') mountTokenCardField().catch(() => {});
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
