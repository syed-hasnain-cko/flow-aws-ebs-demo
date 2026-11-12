// =============================================
// Test Data Generator — creates sample SANDBOX transactions for an account (tab "🧪 Test Data").
// The browser builds the plan and runs it (live progress, Stop); every call goes to POST /testdata/call, which validates it and forwards ONE
// allowlisted Checkout.com request (see amplify/.../testdata/testdata-routes.js). Secret keys are sealed server-side — the browser keeps an
// opaque token, like Wallet Onboarding. Facts this file relies on were verified against the demo sandbox account (docs/test-data-generator.md).
// =============================================
(function () {
    'use strict';
    const { $, esc, Store } = window.Common;
    const API = ((window.APP_CONFIG && window.APP_CONFIG.apiBaseUrl) || '') + '/testdata';
    const K = { profiles: 'cko-testdata-profiles', prefs: 'cko-testdata-prefs', last: 'cko-testdata-last' };
    const MAX_TOTAL = 500;

    // ---- the transaction types (what the user splits the total over) ---------------------------------------------------------------
    const CATS = [
        { id: 'cit_oneoff',    icon: '🛒', label: 'Customer payment · one-off',        def: 9, help: 'A customer-present card payment, as if a shopper paid at your checkout. Sent without 3D Secure (nobody is there to approve it). Approved.' },
        { id: 'cit_setup',     icon: '🔁', label: 'Customer payment · recurring setup', def: 3, help: 'The first payment of a subscription: customer-present, and the card is stored for later (payment_type Recurring). The merchant-initiated payments below link back to these.' },
        { id: 'mit_recurring', icon: '📆', label: 'Merchant-initiated · recurring',    def: 3, help: 'A charge you make on a stored card with the customer absent, e.g. the monthly renewal. Backend-only, linked to one of this batch’s recurring setups.' },
        { id: 'mit_unscheduled', icon: '⚡', label: 'Merchant-initiated · unscheduled', def: 2, help: 'A merchant-initiated charge at no fixed schedule, e.g. a top-up or a late fee. Linked to a recurring setup too.' },
        { id: 'ptc',           icon: '💳', label: 'Pay to card',                       def: 2, help: 'A payout from your currency account to a card (Visa Direct / Mastercard Send test cards). The card is turned into a token by the server — no card form needed. Settles asynchronously.' },
        { id: 'ptb',           icon: '🏦', label: 'Pay to bank',                       def: 2, help: 'A payout from your currency account to a bank account (EUR, SEPA test IBANs). Settles asynchronously.' },
        { id: 'declined',      icon: '⛔', label: 'Declined payments',                 def: 2, help: 'Customer-present payments the issuer declines. The decline code is picked at random from the ones you tick in “Declined payments” below.' },
        { id: 'dispute',       icon: '⚖️', label: 'Disputes',                          def: 2, help: 'Payments with the sandbox’s special amount and the card expiry 01/2099 (GBP). Checkout.com raises a test dispute for each a few minutes later.' },
    ];

    // ---- test cards (all from the Checkout.com test-cards page; “verified” = tried on the demo account on 2026-11-12) --------------------
    // Every brand with documented approval test cards. A brand must be ENABLED for the sandbox account before it can be used — one that is not
    // is refused by the API (HTTP 422 "<brand>_scheme_not_configured") and the generator then skips it and carries on with the others.
    const SCHEMES = {
        visa:             { label: 'Visa',             on: true,  cards: [{ n: '4242424242424242', cvv: '100' }, { n: '4659105569051157', cvv: '100' }, { n: '4000020000000000', cvv: '100' }] },
        mastercard:       { label: 'Mastercard',       on: true,  cards: [{ n: '5436031030606378', cvv: '100' }, { n: '5305484748800098', cvv: '100' }] },
        amex:             { label: 'American Express', on: true,  cards: [{ n: '345678901234564', cvv: '1234' }] },
        cartes_bancaires: { label: 'Cartes Bancaires', on: false, cards: [{ n: '4010061700000021', cvv: '100' }] },
        jcb:              { label: 'JCB',              on: false, hint: 'EEA & UK only', cards: [{ n: '3530111333300000', cvv: '100' }, { n: '3582069482684995', cvv: '100' }] },
        discover:         { label: 'Discover',         on: false, cards: [{ n: '6011111111111117', cvv: '100' }, { n: '6445979375892355607', cvv: '100' }] },
        diners:           { label: 'Diners Club',      on: false, cards: [{ n: '36160940933914', cvv: '100' }] },
        unionpay:         { label: 'UnionPay',         on: false, hint: 'test card documented for 3D Secure only', cards: [{ n: '6224120000000094', cvv: '100' }] },
    };
    const defaultSchemes = () => Object.fromEntries(Object.keys(SCHEMES).map(k => [k, SCHEMES[k].on]));
    const DECLINES = [
        { code: '20051', text: 'Insufficient funds',                    scheme: 'mastercard', n: '5437821135399682', v: 1 },
        { code: '20005', text: 'Do not honour',                         scheme: 'mastercard', n: '5585076576791786', v: 1 },
        { code: '20061', text: 'Exceeds withdrawal amount / limits',    scheme: 'mastercard', n: '5420951756276171', v: 1 },
        { code: '20062', text: 'Restricted card',                       scheme: 'mastercard', n: '5279988405398834', v: 1 },
        { code: '20003', text: 'Invalid merchant',                      scheme: 'mastercard', n: '5510696303117979', v: 1 },
        { code: '20057', text: 'Transaction not permitted to cardholder', scheme: 'mastercard', n: '5355222710253469', v: 1 },
        { code: '20072', text: 'Account not yet activated',             scheme: 'mastercard', n: '5525192142230028', v: 1 },
        { code: '30041', text: 'Lost card – pick up',                   scheme: 'mastercard', n: '5363450180402239', v: 1 },
        { code: '20005', text: 'Do not honour',                         scheme: 'amex',       n: '341829238058580',  cvv: '1234', v: 1 },
        { code: '20154', text: '3D Secure authentication required',     scheme: 'visa',       n: '4500622868341387', v: 1 },
        { code: '20051', text: 'Insufficient funds',                    scheme: 'visa',       n: '4544249167673670', v: 0 },
        { code: '20005', text: 'Do not honour',                         scheme: 'visa',       n: '4539467987109256', v: 0 },
        { code: '20061', text: 'Exceeds withdrawal amount / limits',    scheme: 'visa',       n: '4556294593757189', v: 0 },
        { code: '20078', text: 'Blocked, first use',                    scheme: 'visa',       n: '4532819413487978', v: 0 },
        { code: '20012', text: 'Invalid transaction',                   scheme: 'visa',       n: '4024007103573027', v: 0 },
        { code: '20062', text: 'Restricted card',                       scheme: 'visa',       n: '4818924250131070', v: 0 },
        { code: '20059', text: 'Suspected fraud',                       scheme: 'visa',       n: '4897453568485113', v: 0 },
        { code: '30041', text: 'Lost card – pick up',                   scheme: 'visa',       n: '4941202060999329', v: 0 },
        { code: '20005', text: 'Do not honour',                         scheme: 'jcb',        n: '3528257085901927', v: 1 },
        { code: '20005', text: 'Do not honour',                         scheme: 'discover',   n: '6011201559638046790', v: 0 },
        { code: '20005', text: 'Do not honour',                         scheme: 'diners',     n: '36160912071610',   v: 0 },
    ].map(d => ({ ...d, key: `${d.scheme}:${d.code}:${d.n.slice(-4)}`, cvv: d.cvv || '100' }));
    // Pay-to-card test cards that Checkout.com ACCEPTED from the demo account in EUR (Mastercard FR → processing_error and US → cross-border not supported were refused, so they are left out)
    const PAYOUT_CARDS = [
        { vendor: 'visa', n: '4921817844445119', country: 'GB' }, { vendor: 'visa', n: '4978313915783283', country: 'FR' },
        { vendor: 'visa', n: '4076613139850359', country: 'SG' }, { vendor: 'visa', n: '4024764449971519', country: 'US' },
        { vendor: 'mastercard', n: '5355224968521878', country: 'GB' }, { vendor: 'mastercard', n: '5526303170157160', country: 'SG' },
    ];
    const BANKS = [   // Pay-to-bank recipients that Checkout.com accepted in the sandbox
        { country: 'DE', iban: 'DE89370400440532013000',   bic: 'COBADEFFXXX', line1: 'Unter den Linden 1', city: 'Berlin', zip: '10117' },
        { country: 'FR', iban: 'FR7630006000011234567890189', bic: 'BNPAFRPP',  line1: '10 Rue de Rivoli',   city: 'Paris',  zip: '75001' },
    ];
    const FIRST = ['Alex', 'Sam', 'Jordan', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Jamie', 'Avery', 'Charlie', 'Emma', 'Liam', 'Olivia', 'Noah', 'Mia', 'Lucas', 'Sofia', 'Ethan', 'Chloe', 'Leo'];
    const LAST = ['Smith', 'Jones', 'Taylor', 'Brown', 'Wilson', 'Evans', 'Thomas', 'Roberts', 'Johnson', 'Walker', 'Wright', 'Robinson', 'Hughes', 'Edwards', 'Green', 'Hall'];
    const CCYS = ['GBP', 'EUR', 'USD'];

    // ---- small helpers --------------------------------------------------------------------------------------------------------------
    const rnd = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const shuffle = (a) => { const x = a.slice(); for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; };
    const uid = () => 'm' + Math.random().toString(36).slice(2, 9);
    const now = () => Date.now();
    const base = (ccy) => (typeof CURRENCIES !== 'undefined' && (CURRENCIES.find(c => c.iso4217 === ccy) || {}).base) || 100;
    const money = (minor, ccy) => (minor / base(ccy)).toFixed(Math.log10(base(ccy))) + ' ' + ccy;
    const pad = (n) => String(n).padStart(3, '0');
    const jget = (k, d) => Store.getJSON(k, d);
    const toast = (m, t) => { if (typeof window.showToast === 'function') window.showToast(m, t); };
    const pill = (txt, cls) => `<span class="td-pill ${cls || ''}">${esc(txt)}</span>`;
    const copyChip = (v) => v ? `<span class="td-copy" data-copy="${esc(v)}" title="Click to copy">${esc(v)}</span>` : '';
    // split `total` over weights, whole numbers that sum exactly (largest remainder)
    function allocate(total, weights) {
        const sum = weights.reduce((a, b) => a + b, 0) || 1;
        const raw = weights.map(w => (w / sum) * total), out = raw.map(Math.floor);
        let left = total - out.reduce((a, b) => a + b, 0);
        raw.map((r, i) => [r - Math.floor(r), i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (left-- > 0) out[i]++; });
        return out;
    }

    // ---- state --------------------------------------------------------------------------------------------------------------------------
    const S = { cfg: null, sel: 'default', counts: {}, running: false, stop: false, tasks: [], batch: '', startedAt: 0, bad: new Map() };
    const machine = window.Common.machine('testdata-run', {
        initial: 'idle',
        states: {
            idle:       { CONFIRM: 'confirming' },
            confirming: { CANCEL: 'idle', START: 'running' },
            running:    { STOP: 'stopping', FINISH: 'finished' },
            stopping:   { FINISH: 'stopped' },
            finished:   { CONFIRM: 'confirming' }, stopped: { CONFIRM: 'confirming' },
        },
    });

    // ---- profiles (public values as is, secret key sealed by the server) -------------------------------------------------------------
    const profiles = () => jget(K.profiles, []);
    const saveProfiles = (l) => Store.setJSON(K.profiles, l);
    const prefs = () => jget(K.prefs, {});
    const savePrefs = (patch) => Store.setJSON(K.prefs, { ...prefs(), ...patch });
    const profileById = (id) => (id === 'default' ? null : profiles().find(p => p.id === id) || null);
    const current = () => profileById(S.sel);
    const payload = (p) => (!p ? { kind: 'default' } : { kind: 'merchant', prefix: p.prefix || undefined, publicKey: p.publicKey || undefined, token: p.token });
    const keyExpired = (p) => !!p && (!p.token || p.expiresAt < now());
    // per-profile settings: processing channels, currency account, which card brands to use
    function settings() {
        const p = current();
        if (p) return { channels: p.channels || [], ca: p.ca || '', schemes: { ...defaultSchemes(), ...(p.schemes || {}) } };
        const d = (prefs().def || {}), dc = (S.cfg && S.cfg.default) || {};
        return {
            channels: d.channels || (dc.processingChannelId ? [dc.processingChannelId] : []),
            ca: d.ca !== undefined ? d.ca : (dc.currencyAccountId || ''),
            schemes: { ...defaultSchemes(), ...(d.schemes || {}) },
        };
    }
    function saveSettings(patch) {
        const p = current();
        if (p) { const l = profiles(), i = l.findIndex(x => x.id === p.id); if (i > -1) { l[i] = { ...l[i], ...patch }; saveProfiles(l); } }
        else savePrefs({ def: { ...(prefs().def || {}), ...patch } });
    }

    // ---- server calls -----------------------------------------------------------------------------------------------------------------
    async function call(op, params, idem) {
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                const res = await fetch(`${API}/call`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op, params, profile: payload(current()), idempotencyKey: idem }) });
                const j = await res.json().catch(() => ({}));
                if (res.status === 401 || res.status === 403 || res.status === 400) return { ok: false, local: true, error: j.error || `HTTP ${res.status}` };
                if (j.upstream_status === 429 || (j.upstream_status >= 500 && attempt < 2)) { await sleep(1500 * (attempt + 1)); continue; }
                if (!res.ok && !j.upstream_status) { if (attempt < 2) { await sleep(1000); continue; } return { ok: false, error: j.error || `HTTP ${res.status}` }; }
                return { ok: j.upstream_status >= 200 && j.upstream_status < 300, status: j.upstream_status, data: j.data, env: j, error: j.error };
            } catch (e) { if (attempt < 2) { await sleep(1000); continue; } return { ok: false, error: 'Network error: ' + e.message }; }
        }
        return { ok: false, error: 'Request failed' };
    }
    function logCall(env, label, force) {
        if (typeof window.addToApiLog !== 'function' || !env || !env.upstream) return;
        if (!force && !$('td-logall').checked) return;
        const m = String(env.upstream).match(/^([A-Z]+)\s+(https?:\/\/\S+)$/); if (!m) return;
        window.addToApiLog(m[1], `${label} — ${m[2].replace(/^https?:\/\/[^/]+/, '')}`, env.upstream_status, (env.request && env.request.body) || {}, env.data ?? null, m[2], { duration_ms: env.duration_ms, ...(env.cko_request_id ? { request_id: env.cko_request_id } : {}) });
    }

    // ---- profile bar -------------------------------------------------------------------------------------------------------------------
    const untilTxt = (t) => { const h = Math.max(0, Math.round((t - now()) / 3600000)); return h >= 48 ? `${Math.round(h / 24)} days` : `${h} h`; };
    function renderProfileBar() {
        const sel = $('td-profile');
        sel.innerHTML = '<option value="default">Default account · Settings / server</option>' + profiles().map(p => `<option value="${esc(p.id)}">${esc(p.label)}</option>`).join('');
        if (!profileById(S.sel)) S.sel = 'default';
        sel.value = S.sel;
        const p = current(), info = $('td-prof-info');
        $('td-prof-edit').disabled = $('td-prof-del').disabled = !p;
        if (!p) {
            const d = S.cfgOk ? S.cfg.default : null;
            info.innerHTML = !S.cfgOk ? `${pill('unreachable', 'bad')} The test-data service did not answer — see the note above.` : d ? `${pill(d.sandbox ? 'sandbox' : 'NOT sandbox', d.sandbox ? 'info' : 'bad')} ${d.source === 'settings-account' ? 'Using your <b>Settings</b> account' : 'Using the <b>server’s</b> account'} · secret key <code>${esc(d.secretKey && d.secretKey.masked || 'not set')}</code>` : 'Loading…';
        } else {
            info.innerHTML = `${pill('sandbox', 'info')} ${p.prefix ? `prefix <code>${esc(p.prefix)}</code> · ` : ''}${p.publicKey ? `public key <code>${esc(p.publicKey.slice(0, 14))}…</code> · ` : '<span style="color:var(--error);">no public key — needed for Pay to card</span> · '}` +
                (keyExpired(p) ? '<span style="color:var(--error);font-weight:600;">secret key expired — choose Edit and enter it again</span>' : `🔒 secret key sealed <code>${esc(p.masked || '')}</code> · expires in ${untilTxt(p.expiresAt)}`);
        }
        const flag = $('td-sandbox-flag');
        if (!S.cfgOk) { flag.hidden = false; flag.textContent = 'The test-data service is not reachable yet (GET /testdata/config) — deploy the backend and check the API Gateway route, then reload.'; }
        else {
            flag.hidden = !(S.cfg.default && !S.cfg.default.sandbox && !p);
            if (!flag.hidden) flag.textContent = 'The default account is not a sandbox account — test data can only be generated in the sandbox. Pick a sandbox merchant instead.';
        }
        renderSettings();
    }
    function renderSettings() {
        const st = settings();
        $('td-channels').innerHTML = st.channels.length ? st.channels.map(c => `<span class="td-chip">${esc(c)}<button type="button" data-ch-del="${esc(c)}" aria-label="Remove ${esc(c)}">×</button></span>`).join('') : '<span class="td-note">No processing channel yet — add at least one.</span>';
        if ($('td-ca') !== document.activeElement) $('td-ca').value = st.ca;
        renderSchemes();
    }
    function openProfileEditor(existing) {
        return new Promise((resolve) => {
            const e = existing || {};
            const back = document.createElement('div');
            back.className = 'td-modal-back';
            back.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;padding:16px;';
            back.innerHTML = `<div class="td-modal" role="dialog" aria-modal="true"><h3>${existing ? 'Edit merchant' : 'New merchant'}</h3>
                <div class="td-note">Sandbox accounts only. Public values stay in this browser as they are; the secret key is encrypted by the server — this browser only keeps an opaque token.</div>
                <div class="td-grid">
                    <div><label class="l">Name</label><input id="td-pe-name" class="text-input" placeholder="Acme Ltd (sandbox)" value="${esc(e.label || '')}" autocomplete="off"></div>
                    <div><label class="l">Account prefix <small>(optional)</small></label><input id="td-pe-prefix" class="text-input" placeholder="the {prefix} in your base URL" value="${esc(e.prefix || '')}" autocomplete="off"></div>
                    <div><label class="l">Public key <small>(needed for Pay to card)</small></label><input id="td-pe-pk" class="text-input" placeholder="pk_sbox_…" value="${esc(e.publicKey || '')}" autocomplete="off" spellcheck="false"></div>
                    <div><label class="l">Keep the secret key for</label><select id="td-pe-ttl" class="select-input"><option value="8">8 hours</option><option value="24" selected>24 hours</option><option value="168">7 days</option></select></div>
                    <div style="grid-column:1/-1;"><label class="l">Secret key ${existing && e.token && e.expiresAt > now() ? `<small>— 🔒 sealed <code>${esc(e.masked || '')}</code>, leave empty to keep it</small>` : ''}</label>
                        <input id="td-pe-sk" class="text-input" type="password" placeholder="sk_sbox_…" autocomplete="new-password" spellcheck="false"></div>
                </div>
                <div class="err" id="td-pe-err"></div>
                <div class="td-actions"><button type="button" class="copy-btn" data-m="no">Cancel</button><button type="button" class="main-button" data-m="yes">Save merchant</button></div></div>`;
            document.body.appendChild(back);
            const q = (id) => back.querySelector('#' + id), err = (m) => { q('td-pe-err').textContent = m || ''; };
            const close = (v) => { document.removeEventListener('keydown', onKey, true); back.remove(); resolve(v); };
            const onKey = (ev) => { if (ev.key === 'Escape') { ev.stopPropagation(); close(null); } };
            document.addEventListener('keydown', onKey, true);
            back.addEventListener('click', async (ev) => {
                if (ev.target === back) return close(null);
                const m = ev.target.closest('[data-m]'); if (!m) return;
                if (m.dataset.m === 'no') return close(null);
                const name = q('td-pe-name').value.trim(), prefix = q('td-pe-prefix').value.trim().toLowerCase(), pk = q('td-pe-pk').value.trim(), sk = q('td-pe-sk').value.trim();
                if (!name) return err('Give the merchant a name.');
                if (prefix && !/^[a-z0-9]{1,24}$/.test(prefix)) return err('The prefix may only contain lowercase letters and digits.');
                if (pk && !/^pk_sbox_[A-Za-z0-9_-]{16,}$/.test(pk)) return err('That is not a sandbox public key (pk_sbox_…).');
                if (!existing && !sk) return err('Enter the merchant’s sandbox secret key.');
                let sealed = {};
                if (sk) {
                    if (!/^sk_sbox_[A-Za-z0-9_-]{16,}$/.test(sk)) return err('Only sandbox secret keys (sk_sbox_…) can be used — test data is never generated in a live account.');
                    m.disabled = true; m.textContent = 'Sealing…';
                    try {
                        const r = await fetch(`${API}/seal`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ secretKey: sk, ttlHours: parseInt(q('td-pe-ttl').value, 10) }) });
                        const j = await r.json().catch(() => ({}));
                        if (!r.ok) { m.disabled = false; m.textContent = 'Save merchant'; return err(j.error || `Could not seal the key (HTTP ${r.status})`); }
                        sealed = { token: j.token, expiresAt: j.expiresAt, masked: j.masked };
                    } catch (x) { m.disabled = false; m.textContent = 'Save merchant'; return err('Network error: ' + x.message); }
                }
                close({ channels: [], ca: '', schemes: defaultSchemes(), ...(existing || { id: uid() }), label: name, prefix, publicKey: pk, ...sealed });
            });
            q('td-pe-name').focus();
        });
    }

    // ---- the split table + details --------------------------------------------------------------------------------------------------
    const total = () => Math.max(1, Math.min(MAX_TOTAL, parseInt($('td-total').value, 10) || 0));
    const sumCounts = () => CATS.reduce((a, c) => a + (S.counts[c.id] || 0), 0);
    function renderCats() {
        $('td-cats').innerHTML = CATS.map(c => `<div class="td-cat"><div class="ico" aria-hidden="true">${c.icon}</div><div><div class="t">${esc(c.label)}</div><div class="h">${esc(c.help)}</div></div>` +
            `<input class="text-input" type="number" min="0" max="${MAX_TOTAL}" data-cat="${c.id}" value="${S.counts[c.id] || 0}" aria-label="${esc(c.label)}"></div>`).join('');
        updateAssigned();
    }
    function resetSplit() { const t = total(); const a = allocate(t, CATS.map(c => c.def)); CATS.forEach((c, i) => { S.counts[c.id] = a[i]; }); renderCats(); }
    function rescaleSplit() { const t = total(); const w = CATS.map(c => S.counts[c.id] || 0); const a = allocate(t, w.some(x => x > 0) ? w : CATS.map(c => c.def)); CATS.forEach((c, i) => { S.counts[c.id] = a[i]; }); renderCats(); }
    function updateAssigned() {
        const t = total(), s = sumCounts(), left = t - s, m = $('td-meter');
        $('td-assigned').innerHTML = left === 0 ? `<b>${s} of ${t}</b> transactions assigned ✓` : left > 0 ? `<b>${s} of ${t}</b> assigned — <span style="color:var(--error);">${left} more to assign</span>` : `<b>${s} of ${t}</b> assigned — <span style="color:var(--error);">${-left} too many</span>`;
        m.className = 'td-meter' + (left === 0 ? ' done' : left < 0 ? ' over' : '');
        m.firstElementChild.style.width = Math.min(100, (s / t) * 100) + '%';
        $('td-follow-of').textContent = S.counts.cit_oneoff || 0;
        updateFollowNote();
    }
    const followVals = () => ({ auth: +$('td-f-auth').value || 0, void: +$('td-f-void').value || 0, cap: +$('td-f-cap').value || 0, ref: +$('td-f-ref').value || 0, pref: +$('td-f-pref').value || 0 });
    function updateFollowNote() {
        const f = followVals(), used = f.auth + f.void + f.cap + f.ref + f.pref, n = S.counts.cit_oneoff || 0;
        $('td-follow-note').innerHTML = used > n ? `<span style="color:var(--error);">That is ${used} follow-ups for only ${n} one-off payments — reduce them.</span>` : `${n - used} of the ${n} one-off payments will simply be captured right away.`;
    }
    function renderCcys() {
        const pr = prefs(); const sel = pr.ccys || CCYS;
        $('td-ccys').innerHTML = CCYS.map(c => `<label><input type="checkbox" data-ccy="${c}" ${sel.includes(c) ? 'checked' : ''}><span>${c}</span></label>`).join('');
    }
    function renderSchemes() {
        const st = settings();
        $('td-schemes').innerHTML = Object.keys(SCHEMES).map(k => `<label><input type="checkbox" data-scheme="${k}" ${st.schemes[k] ? 'checked' : ''}><span>${SCHEMES[k].label} <small>${SCHEMES[k].cards.length} test card${SCHEMES[k].cards.length > 1 ? 's' : ''}${SCHEMES[k].hint ? ' · ' + esc(SCHEMES[k].hint) : ''}</small></span></label>`).join('');
        renderDeclines(); renderDisputes();
    }
    function renderDeclines() {
        const pr = prefs(); const chosen = new Set(pr.decl || DECLINES.filter(d => d.v).map(d => d.key));
        $('td-decl').innerHTML = DECLINES.map(d => `<label><input type="checkbox" data-decl="${esc(d.key)}" ${chosen.has(d.key) ? 'checked' : ''}><span><b>${d.code}</b> ${esc(d.text)} <small>· ${SCHEMES[d.scheme].label} ${pill(d.v ? 'verified' : 'documented', d.v ? 'good' : '')}</small></span></label>`).join('');
    }
    const DISP = () => (typeof DISPUTE_TEST_SCENARIOS !== 'undefined' ? [...DISPUTE_TEST_SCENARIOS.core, ...DISPUTE_TEST_SCENARIOS.extended] : []);
    function renderDisputes() {
        const pr = prefs(), core = new Set((typeof DISPUTE_TEST_SCENARIOS !== 'undefined' ? DISPUTE_TEST_SCENARIOS.core : []).map(s => s.key));
        const chosen = new Set(pr.disp || [...core]), st = settings();
        $('td-disp').innerHTML = DISP().map(s => {
            const usable = s.rows.some(r => st.schemes[r.card === 'mastercard' ? 'mastercard' : r.card]);
            return `<label><input type="checkbox" data-disp="${esc(s.key)}" ${chosen.has(s.key) && usable ? 'checked' : ''} ${usable ? '' : 'disabled'}><span><b>${esc(s.label)}</b> <small>${esc(s.description)}${usable ? '' : ' — needs a card brand that is ticked above'}</small></span></label>`;
        }).join('');
    }

    // ---- reading the form ---------------------------------------------------------------------------------------------------------------
    function readConfig() {
        const st = settings();
        const checked = (attr) => [...document.querySelectorAll(`#td-root [${attr}]`)].filter(x => x.checked).map(x => x.getAttribute(attr));
        return {
            total: total(), counts: { ...S.counts }, channels: st.channels, ca: st.ca.trim(), schemes: st.schemes,
            amin: parseFloat($('td-amin').value), amax: parseFloat($('td-amax').value), pmin: parseFloat($('td-pmin').value), pmax: parseFloat($('td-pmax').value),
            ccys: checked('data-ccy'), declKeys: checked('data-decl'), dispKeys: checked('data-disp'), follow: followVals(),
            conc: parseInt($('td-conc').value, 10) || 3, prefix: ($('td-prefix').value.trim() || 'GEN').replace(/[^A-Za-z0-9]/g, '').slice(0, 12) || 'GEN', fpan: $('td-fpan').checked,
        };
    }
    function persist() {
        const c = readConfig();
        savePrefs({ total: c.total, counts: S.counts, ccys: c.ccys, decl: c.declKeys, disp: c.dispKeys, follow: c.follow, amin: c.amin, amax: c.amax, pmin: c.pmin, pmax: c.pmax, conc: c.conc, prefix: c.prefix, fpan: c.fpan, logall: $('td-logall').checked, selected: S.sel });
    }
    function validate(c) {
        const e = [];
        if (!S.cfgOk) e.push('The test-data service did not answer — deploy the backend (GET /testdata/config) and reload the page.');
        const p = current();
        if (!p && S.cfg && S.cfg.default && !S.cfg.default.sandbox) e.push('The default account is not a sandbox account.');
        if (p && keyExpired(p)) e.push('This merchant’s secret key has expired — choose Edit and enter it again.');
        if (sumCounts() !== c.total) e.push(`The split adds up to ${sumCounts()}, not ${c.total}.`);
        if (!c.channels.length) e.push('Add at least one processing channel.');
        const bad = c.channels.find(x => !/^pc_[a-z0-9]{20,40}$/.test(x)); if (bad) e.push(`“${bad}” is not a valid processing channel id.`);
        const pay = (c.counts.cit_oneoff || 0) + (c.counts.cit_setup || 0) + (c.counts.mit_recurring || 0) + (c.counts.mit_unscheduled || 0);
        const schemesOn = Object.keys(c.schemes).filter(k => c.schemes[k]);
        if (pay > 0 && !schemesOn.length) e.push('Tick at least one card brand.');
        if (pay > 0 && !c.ccys.length) e.push('Tick at least one payment currency.');
        if (!(c.amin > 0) || !(c.amax >= c.amin)) e.push('The payment amount range is not valid.');
        if (((c.counts.ptc || 0) + (c.counts.ptb || 0)) > 0) {
            if (!/^ca_[a-z0-9]{20,40}$/.test(c.ca)) e.push('Pay to card / Pay to bank need the currency account id (ca_…).');
            if (!(c.pmin > 0) || !(c.pmax >= c.pmin)) e.push('The payout amount range is not valid.');
            if (p && !p.publicKey && (c.counts.ptc || 0) > 0) e.push('Pay to card needs this merchant’s public key — choose Edit and add it.');
        }
        if ((c.counts.declined || 0) > 0 && !DECLINES.some(d => c.declKeys.includes(d.key) && c.schemes[d.scheme])) e.push('Tick at least one decline code whose card brand is ticked in “Cards”.');
        if ((c.counts.dispute || 0) > 0 && !disputeRows(c).length) e.push('Tick at least one dispute outcome that uses a ticked card brand.');
        const f = c.follow, used = f.auth + f.void + f.cap + f.ref + f.pref;
        if (used > (c.counts.cit_oneoff || 0)) e.push(`The follow-up actions (${used}) are more than the one-off customer payments (${c.counts.cit_oneoff || 0}).`);
        if (((c.counts.mit_recurring || 0) + (c.counts.mit_unscheduled || 0)) > 0 && !(c.counts.cit_setup > 0)) e.push('__warn__Merchant-initiated payments will be sent without a recurring setup to link to (that is accepted by the sandbox, but a real merchant would have one).');
        return e;
    }

    // ---- the plan ------------------------------------------------------------------------------------------------------------------------
    function disputeRows(c) {
        const out = [];
        DISP().filter(s => c.dispKeys.includes(s.key)).forEach(s => s.rows.forEach(r => { if (c.schemes[r.card]) out.push({ scenario: s, row: r }); }));
        return out;
    }
    function buildPlan(c) {
        const tasks = []; let n = 0, chIdx = 0;
        const channel = () => c.channels[chIdx++ % c.channels.length];
        const person = () => { const f = pick(FIRST), l = pick(LAST); return { name: `${f} ${l}`, email: `${f}.${l}.${rnd(10, 99)}@example.com`.toLowerCase(), first: f, last: l }; };
        const amountMinor = (ccy, lo, hi) => Math.max(1, Math.round((lo + Math.random() * (hi - lo)) * base(ccy)));
        const cardFor = (schemeKeys) => { const sk = pick(schemeKeys); const cd = pick(SCHEMES[sk].cards); return { scheme: sk, number: cd.n, cvv: cd.cvv }; };
        const on = Object.keys(c.schemes).filter(k => c.schemes[k]);
        const mk = (cat, extra) => { const t = { n: ++n, cat, status: 'queued', ...extra }; tasks.push(t); return t; };
        // follow-up states handed out to the one-off payments
        const fu = []; ['auth', 'void', 'cap', 'ref', 'pref'].forEach(k => { for (let i = 0; i < c.follow[k]; i++) fu.push(k); });
        const fuList = shuffle(fu);
        for (let i = 0; i < (c.counts.cit_oneoff || 0); i++) {
            const ccy = pick(c.ccys), card = cardFor(on), cu = person(), follow = fuList[i] || null;
            mk('cit_oneoff', { phase: 1, ccy, amount: amountMinor(ccy, c.amin, c.amax), card, cu, channel: channel(), follow, capture: !(follow === 'auth' || follow === 'void' || follow === 'cap'), expect: 'approve' });
        }
        for (let i = 0; i < (c.counts.cit_setup || 0); i++) {
            const ccy = pick(c.ccys), card = cardFor(on), cu = person();
            mk('cit_setup', { phase: 1, ccy, amount: amountMinor(ccy, c.amin, c.amax), card, cu, channel: channel(), capture: true, expect: 'approve' });
        }
        for (let i = 0; i < (c.counts.declined || 0); i++) {
            const d = pick(DECLINES.filter(x => c.declKeys.includes(x.key) && c.schemes[x.scheme])), ccy = pick(c.ccys), cu = person();
            mk('declined', { phase: 1, ccy, amount: amountMinor(ccy, c.amin, c.amax), card: { scheme: d.scheme, number: d.n, cvv: d.cvv }, cu, channel: channel(), capture: true, expect: 'decline', expectCode: d.code, expectText: d.text, fpan: c.fpan });
        }
        const byScenario = {}; disputeRows(c).forEach(x => { (byScenario[x.scenario.key] = byScenario[x.scenario.key] || []).push(x); });
        const scenarioKeys = shuffle(Object.keys(byScenario));                              // outcomes take turns, so a few disputes cover a few different outcomes
        for (let i = 0; i < (c.counts.dispute || 0); i++) {
            const { scenario, row } = pick(byScenario[scenarioKeys[i % scenarioKeys.length]]), dc = (typeof DISPUTE_TEST_CARDS !== 'undefined' ? DISPUTE_TEST_CARDS[row.card] : null) || SCHEMES[row.card].cards[0], cu = person();
            mk('dispute', { phase: 1, ccy: 'GBP', amount: row.amount, card: { scheme: row.card, number: dc.number || dc.n, cvv: dc.cvv, y: (typeof DISPUTE_EXPIRY !== 'undefined' ? DISPUTE_EXPIRY.year : 2099), m: (typeof DISPUTE_EXPIRY !== 'undefined' ? DISPUTE_EXPIRY.month : 1) },
                cu, channel: channel(), capture: true, expect: 'approve', scenario: scenario.key, scenarioLabel: scenario.label });
        }
        for (let i = 0; i < (c.counts.ptc || 0); i++) {
            const cd = pick(PAYOUT_CARDS), cu = person();
            mk('ptc', { phase: 1, ccy: 'EUR', amount: amountMinor('EUR', c.pmin, c.pmax), card: { scheme: cd.vendor, number: cd.n, cvv: '100' }, country: cd.country, cu, channel: channel(), fft: cd.vendor === 'visa' ? 'FD' : 'C55', expect: 'pending' });
        }
        for (let i = 0; i < (c.counts.ptb || 0); i++) {
            const b = pick(BANKS), cu = person();
            mk('ptb', { phase: 1, ccy: 'EUR', amount: amountMinor('EUR', c.pmin, c.pmax), bank: b, cu, channel: channel(), expect: 'pending' });
        }
        for (let i = 0; i < (c.counts.mit_recurring || 0); i++) mk('mit_recurring', { phase: 2, expect: 'approve', ptype: 'Recurring' });
        for (let i = 0; i < (c.counts.mit_unscheduled || 0); i++) mk('mit_unscheduled', { phase: 2, expect: 'approve', ptype: 'Unscheduled' });
        // MIT details are filled in once the setups they link to have run (see runMit)
        return tasks;
    }
    const catLabel = (id) => (CATS.find(c => c.id === id) || {}).label || id;
    const taskDetail = (t) => {
        if (t.cat === 'ptb') return `${t.bank.country} bank · ${t.bank.iban.slice(0, 4)}…${t.bank.iban.slice(-4)}`;
        const brand = t.card ? SCHEMES[t.card.scheme].label : '';
        return `${brand} …${t.card ? t.card.number.slice(-4) : ''}${t.amount ? ' · ' + money(t.amount, t.ccy) : ''}${t.scenarioLabel ? ' · ' + t.scenarioLabel : ''}`;
    };

    // ---- running the plan ---------------------------------------------------------------------------------------------------------------------
    const refOf = (t, suffix) => `${S.cfgRun.prefix}-${S.batch}-${pad(t.n)}${suffix ? '-' + suffix : ''}`;
    const meta = (t) => ({ generator: 'cko-demo-testdata', batch: S.batch, kind: t.cat });
    function paymentParams(t) {
        const p = { amount: t.amount, currency: t.ccy, card: { number: t.card.number, expiry_month: t.card.m || 12, expiry_year: t.card.y || 2030, cvv: t.card.cvv }, card_name: t.cu.name,
            reference: refOf(t), processing_channel_id: t.channel, capture: t.capture !== false, customer: { name: t.cu.name, email: t.cu.email }, metadata: meta(t) };
        if (t.fpan) p.pan_preference = 'fpan';
        if (t.cat === 'cit_setup') { p.payment_type = 'Recurring'; p.stored = true; }
        if (t.cat === 'mit_recurring' || t.cat === 'mit_unscheduled') { p.payment_type = t.ptype; p.merchant_initiated = true; p.stored = true; if (t.prev) p.previous_payment_id = t.prev; }
        return p;
    }
    function classify(t, r) {
        const d = r.data || {};
        t.http = r.status; t.id = d.id || ''; t.code = d.response_code || ''; t.summary = d.response_summary || '';
        if (r.local || (!r.status && r.error)) { t.status = 'failed'; t.note = r.error || 'Request refused'; return; }
        if (r.status >= 400) { t.status = 'failed'; t.note = [d.error_type, (d.error_codes || []).join(', ')].filter(Boolean).join(' · ') || `HTTP ${r.status}`; return; }
        if (r.status === 202 && d.status === 'Pending') { t.status = 'pending'; return; }
        if (d.approved === true || /^(Authorized|Captured|Card Verified)$/i.test(d.status || '')) { t.status = 'approved'; }
        else if (/declined/i.test(d.status || '') || d.approved === false) { t.status = 'declined'; }
        else { t.status = 'failed'; t.note = `Unexpected response (HTTP ${r.status}, status “${d.status || '?'}”)`; return; }
        if (t.expect === 'approve' && t.status === 'declined') {
            t.unexpected = true;
            t.note = `Expected an approval but declined ${t.code} ${t.summary}`.trim();
        }
        if (t.expect === 'decline' && t.status === 'approved') { t.unexpected = true; t.note = `Expected a decline (${t.expectCode}) but it was approved — the sandbox did not simulate this card here.`; }
        if (t.expect === 'decline' && t.status === 'declined' && t.code !== t.expectCode) t.note = `Declined ${t.code} (the card is documented as ${t.expectCode}).`;
    }
    // ---- brands the sandbox refuses ---------------------------------------------------------------------------------------------------
    // A brand that is not enabled for the account is refused by the API (HTTP 422, e.g. "discover_scheme_not_configured") — that is not a decline.
    // The generator drops the brand for the rest of the batch and re-sends the SAME transaction with a brand that works.
    const usable = () => Object.keys(S.cfgRun.schemes).filter(k => S.cfgRun.schemes[k] && !S.bad.has(k));
    const apiErrorText = (r) => [r.data && r.data.error_type, ((r.data && r.data.error_codes) || []).join(', ')].filter(Boolean).join(' · ') || r.error || `HTTP ${r.status}`;
    const isSchemeRefusal = (r) => !r.local && r.status === 422 && ((r.data && r.data.error_codes) || []).some(c => /scheme_not_(configured|enabled|supported)|(card|scheme)_(type|scheme)_not_(enabled|supported)|unsupported_(card_)?scheme/i.test(c));
    const isApiError = (r) => r.local ? false : (r.status >= 400 || (!r.status && !!r.error));
    function dropBrand(scheme, why) { if (!S.bad.has(scheme)) { S.bad.set(scheme, why); renderBrandBanner(); } }
    // give the transaction a card of another usable brand (same kind of transaction); false if none is left
    function switchBrand(t, avoid) {
        const ok = usable().filter(k => k !== avoid);
        if (!ok.length) return false;
        const from = t.card.scheme;
        if (t.cat === 'declined') {
            const cands = DECLINES.filter(x => S.cfgRun.declKeys.includes(x.key) && ok.includes(x.scheme)); if (!cands.length) return false;
            const d = pick(cands); t.card = { scheme: d.scheme, number: d.n, cvv: d.cvv }; t.expectCode = d.code; t.expectText = d.text;
        } else if (t.cat === 'dispute') {
            const rows = disputeRows(S.cfgRun).filter(x => ok.includes(x.row.card)); if (!rows.length) return false;
            const same = rows.filter(x => x.scenario.key === t.scenario); const { scenario, row } = pick(same.length ? same : rows);
            const dc = DISPUTE_TEST_CARDS[row.card]; t.card = { scheme: row.card, number: dc.number, cvv: dc.cvv, y: DISPUTE_EXPIRY.year, m: DISPUTE_EXPIRY.month }; t.amount = row.amount; t.scenario = scenario.key; t.scenarioLabel = scenario.label;
        } else {
            const sk = pick(ok), cd = pick(SCHEMES[sk].cards); t.card = { scheme: sk, number: cd.n, cvv: cd.cvv };
        }
        t.switched = `${SCHEMES[from].label} was not usable → sent with ${SCHEMES[t.card.scheme].label} instead`;
        return true;
    }
    async function runPayment(t) {
        let probe = null;
        for (let attempt = 0; attempt < 4; attempt++) {
            if (S.bad.has(t.card.scheme) && !t.linkedFixed && !switchBrand(t, t.card.scheme)) { t.status = 'failed'; t.note = 'No usable card brand left — every ticked brand was refused by the API.'; return; }
            const r = await call('payment', paymentParams(t), refOf(t) + (attempt ? `-a${attempt}` : ''));
            logCall(r.env, `generate ${catLabel(t.cat)}`, r.env && r.env.upstream_status >= 400);
            if (isApiError(r)) {
                const brand = t.card.scheme;
                if (S.bad.has(brand) && !t.linkedFixed && switchBrand(t, brand)) continue;          // another payment already showed this brand is not usable while this request was in flight
                if (isSchemeRefusal(r)) { dropBrand(brand, apiErrorText(r)); if (!t.linkedFixed && switchBrand(t, brand)) continue; if (!t.linkedFixed) { t.status = 'failed'; t.http = r.status; t.note = `No usable card brand left — ${SCHEMES[brand].label} was refused (${apiErrorText(r)}) and no other brand is ticked.`; return; } }
                else if (!probe && !t.linkedFixed && attempt === 0 && usable().length > 1) { probe = { brand, text: apiErrorText(r) }; if (switchBrand(t, brand)) continue; }   // unknown API error: try one other brand to find out whether it is the brand
            } else if (probe) { dropBrand(probe.brand, probe.text); probe = null; }               // the other brand worked → the first one was the problem
            classify(t, r); return;
        }
        t.status = 'failed'; t.note = t.note || 'The API kept refusing this payment.';
    }
    async function runPayout(t) {
        const owner = { first_name: t.cu.first, last_name: t.cu.last };
        if (t.cat === 'ptc') {
            const tk = await call('token', { card: { number: t.card.number, expiry_month: 12, expiry_year: 2030, cvv: '100' }, card_name: t.cu.name });
            logCall(tk.env, 'generate pay-to-card token');
            const tok = tk.data && tk.data.token;
            if (!tok) { t.status = 'failed'; t.note = 'Could not create the card token: ' + (tk.error || (tk.data && (tk.data.error_codes || []).join(', ')) || `HTTP ${tk.status}`); return; }
            const r = await call('payout_card', { amount: t.amount, currency: t.ccy, token: tok, currency_account_id: S.cfgRun.ca, processing_channel_id: t.channel, funds_transfer_type: t.fft,
                account_holder: { ...owner, country: t.country }, reference: refOf(t), metadata: meta(t) }, refOf(t));
            logCall(r.env, 'generate pay to card', r.env && r.env.upstream_status >= 400); classify(t, r);
        } else {
            const b = t.bank;
            const r = await call('payout_bank', { amount: t.amount, currency: t.ccy, currency_account_id: S.cfgRun.ca, processing_channel_id: t.channel, destination: { country: b.country, account_type: 'current', iban: b.iban, swift_bic: b.bic },
                account_holder: { ...owner, address_line1: b.line1, city: b.city, zip: b.zip, country: b.country }, reference: refOf(t), descriptor: 'TestPayout', metadata: meta(t) }, refOf(t));
            logCall(r.env, 'generate pay to bank', r.env && r.env.upstream_status >= 400); classify(t, r);
        }
        if (t.status === 'pending') t.note = 'Accepted — a payout settles asynchronously (see the Webhooks tab).';
    }
    function runMit(t, setups) {
        const s = setups.length ? setups[(t.n + setups.length) % setups.length] : null;
        const cu = s ? s.cu : { name: `${pick(FIRST)} ${pick(LAST)}`, email: `${pick(FIRST)}.${pick(LAST)}@example.com`.toLowerCase() };
        const card = s ? s.card : cardFor2();
        const ccy = s ? s.ccy : pick(S.cfgRun.ccys);
        Object.assign(t, { cu, card, ccy, channel: s ? s.channel : S.cfgRun.channels[t.n % S.cfgRun.channels.length], amount: Math.max(1, Math.round((S.cfgRun.amin + Math.random() * (S.cfgRun.amax - S.cfgRun.amin)) * base(ccy))), prev: s ? s.id : '', capture: true });
        t.linked = s ? `linked to ${s.id}` : 'no recurring setup to link to'; t.linkedFixed = !!s;
        return runPayment(t);
    }
    function cardFor2() { const on = usable(); const sk = pick(on.length ? on : ['mastercard']); const cd = pick(SCHEMES[sk].cards); return { scheme: sk, number: cd.n, cvv: cd.cvv }; }
    async function runFollow(t) {
        if (t.status !== 'approved' || !t.follow || !t.id) return;
        const step = async (op, params, label) => { const r = await call(op, params, `${refOf(t, label)}`); logCall(r.env, `generate ${label}`, r.env && r.env.upstream_status >= 400); return r; };
        const age = now() - (t.doneAt || 0); if (age < 2500) await sleep(2500 - age);
        let r, what;
        if (t.follow === 'void')      { r = await step('void',    { payment_id: t.id, reference: refOf(t, 'void') }, 'void'); what = 'voided'; }
        else if (t.follow === 'cap')  { r = await step('capture', { payment_id: t.id, reference: refOf(t, 'cap') }, 'cap'); what = 'captured later'; }
        else if (t.follow === 'ref')  { r = await step('refund',  { payment_id: t.id, reference: refOf(t, 'ref') }, 'ref'); what = 'fully refunded'; }
        else if (t.follow === 'pref') { r = await step('refund',  { payment_id: t.id, amount: Math.max(1, Math.floor(t.amount / 2)), reference: refOf(t, 'pref') }, 'pref'); what = 'partly refunded'; }
        else { t.after = 'left authorized'; return; }
        if (r.ok) t.after = what; else { t.after = `${what} failed`; t.followFailed = true; t.note = ((r.data && (r.data.error_codes || []).join(', ')) || r.error || `HTTP ${r.status}`); }
    }
    async function pool(items, n, worker) {
        let i = 0;
        await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
            while (i < items.length && !S.stop) { const it = items[i++]; try { await worker(it); } catch (e) { it.status = 'failed'; it.note = 'Unexpected error: ' + e.message; } renderRow(it); renderProgress(); }
        }));
    }
    async function run(c) {
        S.cfgRun = c; S.batch = Date.now().toString(36).slice(-6); S.stop = false; S.startedAt = now(); S.bad = new Map(); renderBrandBanner(); S.tasks = buildPlan(c);
        renderResults(); renderProgress(); $('td-summary').hidden = true;
        machine.send('START'); lock(true);
        const p1 = shuffle(S.tasks.filter(t => t.phase === 1)), p2 = S.tasks.filter(t => t.phase === 2);
        const mark = (t) => { t.status = 'running'; t.doneAt = 0; renderRow(t); };
        await pool(p1, c.conc, async (t) => { mark(t); if (t.cat === 'ptc' || t.cat === 'ptb') await runPayout(t); else await runPayment(t); t.doneAt = now(); });
        const setups = S.tasks.filter(t => t.cat === 'cit_setup' && t.status === 'approved' && t.id);
        await pool(p2, c.conc, async (t) => { mark(t); await runMit(t, setups); t.doneAt = now(); });
        await pool(S.tasks.filter(t => t.follow && t.status === 'approved'), c.conc, async (t) => { t.following = true; renderRow(t); try { await runFollow(t); } finally { t.following = false; } });
        S.tasks.filter(t => t.status === 'queued').forEach(t => { t.status = 'skipped'; t.note = 'Stopped before this one ran.'; renderRow(t); });
        finish();
    }
    function finish() {
        const stopped = S.stop; machine.send('FINISH'); lock(false);
        $('td-stop').hidden = true; $('td-generate').hidden = false;
        renderResults(); renderProgress(); renderSummary(stopped);
        Store.setJSON(K.last, [{ batch: S.batch, at: S.startedAt, profile: current() ? current().label : 'default', rows: S.tasks.map(t => ({ n: t.n, type: t.cat, status: t.status, id: t.id || '', code: t.code || '', ccy: t.ccy || '', amount: t.amount || 0, after: t.after || '' })) }, ...jget(K.last, [])].slice(0, 4));
    }

    // ---- rendering the run -----------------------------------------------------------------------------------------------------------------------
    function resultCell(t) {
        const m = { queued: ['queued', ''], running: ['running…', 'info'], approved: ['approved', 'good'], declined: [`declined ${t.code}`, t.unexpected ? 'bad' : 'warn'], pending: ['accepted · pending', 'info'], failed: ['failed', 'bad'], skipped: ['skipped', ''] }[t.status] || [t.status, ''];
        return pill(m[0], t.status === 'declined' && t.expect === 'decline' && !t.unexpected ? 'warn' : m[1]) + (t.following ? ' ' + pill('follow-up…', 'info') : '') + (t.unexpected ? ' ' + pill('unexpected', 'bad') : '') + (t.after ? ' ' + pill(t.after, t.followFailed ? 'bad' : '') : '');
    }
    function rowHtml(t) {
        const note = [t.note, t.switched, t.linked, t.scenarioLabel && t.cat === 'dispute' ? `dispute scenario: ${t.scenarioLabel}` : '', t.disputeNote].filter(Boolean).join(' · ');
        return `<td>${t.n}</td><td>${esc(catLabel(t.cat))}</td><td>${esc(taskDetail(t))}</td><td>${resultCell(t)}</td><td>${copyChip(t.id)}</td><td>${esc(note)}</td>`;
    }
    function renderResults() { $('td-results-wrap').hidden = !S.tasks.length; $('td-results').innerHTML = S.tasks.map(t => `<tr id="td-row-${t.n}" class="${t.status === 'running' ? 'run' : ''}">${rowHtml(t)}</tr>`).join(''); }
    function renderRow(t) { const tr = document.getElementById('td-row-' + t.n); if (tr) { tr.className = t.status === 'running' ? 'run' : ''; tr.innerHTML = rowHtml(t); } }
    function counts() {
        const c = { total: S.tasks.length, done: 0, approved: 0, declined: 0, pending: 0, failed: 0, unexpected: 0 };
        S.tasks.forEach(t => { if (['approved', 'declined', 'pending', 'failed', 'skipped'].includes(t.status)) c.done++; if (t.status === 'approved') c.approved++; if (t.status === 'declined') c.declined++; if (t.status === 'pending') c.pending++; if (t.status === 'failed') c.failed++; if (t.unexpected) c.unexpected++; });
        return c;
    }
    function renderBrandBanner() {
        const el = $('td-brands'); if (!el) return;
        el.hidden = !S.bad.size;
        el.innerHTML = [...S.bad].map(([k, why]) => `⚠️ <b>${esc(SCHEMES[k].label)}</b> is not enabled for this account — the API refused it (<code>${esc(why)}</code>). It is skipped and the rest continues with the other brands.`).join('<br>');
    }
    function brandStats() {
        const m = {}; S.tasks.forEach(t => { if (!t.card || !['approved', 'declined'].includes(t.status)) return; const b = (m[t.card.scheme] = m[t.card.scheme] || { a: 0, d: 0 }); t.status === 'approved' ? b.a++ : b.d++; });
        return Object.keys(m).map(k => `${SCHEMES[k].label} ${m[k].a ? m[k].a + ' approved' : ''}${m[k].a && m[k].d ? ', ' : ''}${m[k].d ? m[k].d + ' declined' : ''}`).join(' · ');
    }
    function renderProgress() {
        const c = counts(); $('td-progress').hidden = !c.total;
        $('td-pmeter').firstElementChild.style.width = (c.total ? (c.done / c.total) * 100 : 0) + '%';
        $('td-pmeter').className = 'td-meter' + (c.done === c.total && c.total ? ' done' : '');
        $('td-counts').innerHTML = `${pill(`${c.done} / ${c.total} done`, 'info')} ${pill(`${c.approved} approved`, c.approved ? 'good' : '')} ${pill(`${c.declined} declined`, c.declined ? 'warn' : '')} ${pill(`${c.pending} payouts pending`, c.pending ? 'info' : '')} ${c.failed ? pill(`${c.failed} failed`, 'bad') : ''} ${c.unexpected ? pill(`${c.unexpected} unexpected`, 'bad') : ''}`;
        $('td-state').textContent = S.running || machine.is('running') ? `Running batch ${S.batch}…` : '';
    }
    function renderSummary(stopped) {
        const c = counts(), box = $('td-summary'); box.hidden = false;
        const disputes = S.tasks.filter(t => t.cat === 'dispute' && t.id).length, secs = Math.round((now() - S.startedAt) / 1000);
        const cls = c.failed || c.unexpected ? 'warn' : 'good';
        box.className = `td-flag ${cls}`;
        box.innerHTML = `<b>${stopped ? 'Stopped' : 'Finished'} in ${secs} s.</b> Batch <code>${esc(S.cfgRun.prefix)}-${esc(S.batch)}</code>: ${c.approved} approved, ${c.declined} declined, ${c.pending ? c.pending + ' payouts accepted (they settle asynchronously), ' : ''}${c.failed} failed${c.unexpected ? `, <b>${c.unexpected} not as expected</b> (see the notes column)` : ''}.` +
            (S.bad.size ? `<br>⚠️ Skipped (not enabled for this account): ${[...S.bad.keys()].map(k => esc(SCHEMES[k].label)).join(', ')}.` : '') + (brandStats() ? `<br>💳 By brand: ${esc(brandStats())}.` : '') +
            (disputes ? `<br>⚖️ ${disputes} dispute payment${disputes > 1 ? 's' : ''} created — Checkout.com raises the disputes over the next few minutes (up to about 10).` : '') +
            `<div class="td-actions"><button type="button" class="copy-btn" id="td-dl-json">Download report (JSON)</button><button type="button" class="copy-btn" id="td-dl-csv">Download CSV</button>` +
            (disputes ? '<button type="button" class="copy-btn" id="td-disputes">Check disputes now</button>' : '') + '</div>';
    }
    async function checkDisputes() {
        const btn = $('td-disputes'); if (!btn) return; btn.disabled = true; btn.textContent = 'Checking…';
        const ds = S.tasks.filter(t => t.cat === 'dispute' && t.id); let found = 0;
        await pool(ds, 3, async (t) => {
            const r = await call('dispute_lookup', { payment_id: t.id }); logCall(r.env, 'check dispute');
            const d = r.data && r.data.data && r.data.data[0];
            if (d) { found++; t.disputeNote = `dispute ${d.id} · ${d.status}`; } else t.disputeNote = 'not raised yet — try again in a minute';
            renderRow(t);
        });
        btn.disabled = false; btn.textContent = 'Check disputes now'; toast(`${found} of ${ds.length} disputes have been raised so far`, found === ds.length ? 'success' : 'info');
    }
    function download(name, text, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
    function report() { return { batch: `${S.cfgRun.prefix}-${S.batch}`, generated_at: new Date(S.startedAt).toISOString(), account: current() ? current().label : 'default account', rows: S.tasks.map(t => ({ n: t.n, type: t.cat, status: t.status, payment_id: t.id || '', response_code: t.code || '', currency: t.ccy || '', amount_minor: t.amount || 0, card_brand: t.card ? t.card.scheme : '', follow_up: t.after || '', dispute_scenario: t.scenario || '', note: [t.note, t.disputeNote].filter(Boolean).join(' · ') })) }; }
    function reportCsv() { const r = report(); const cols = Object.keys(r.rows[0] || { n: 1 }); return [cols.join(','), ...r.rows.map(x => cols.map(k => `"${String(x[k] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n'); }

    // ---- confirm + go ---------------------------------------------------------------------------------------------------------------------------
    function confirmModal(c) {
        return new Promise((resolve) => {
            const p = current(), f = c.follow, nCit = c.counts.cit_oneoff || 0, calls = c.total + (c.counts.ptc || 0) + f.void + f.cap + f.ref + f.pref;
            const lines = CATS.filter(x => (c.counts[x.id] || 0) > 0).map(x => `<li><b>${c.counts[x.id]}</b> × ${esc(x.label)}</li>`).join('');
            const decl = c.counts.declined ? `<li>Decline codes drawn at random from: ${[...new Set(DECLINES.filter(d => c.declKeys.includes(d.key)).map(d => d.code))].join(', ')}</li>` : '';
            const disp = c.counts.dispute ? `<li>Dispute outcomes: ${DISP().filter(s => c.dispKeys.includes(s.key)).map(s => esc(s.label)).join(', ')} (GBP, card expiry 01/2099)</li>` : '';
            const fol = (f.auth + f.void + f.cap + f.ref + f.pref) ? `<li>Of the ${nCit} one-off payments: ${[f.auth && `${f.auth} stay authorized`, f.void && `${f.void} voided`, f.cap && `${f.cap} captured later`, f.ref && `${f.ref} fully refunded`, f.pref && `${f.pref} partly refunded`].filter(Boolean).join(', ')}; the rest are captured right away</li>` : '';
            const back = document.createElement('div');
            back.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;padding:16px;';
            back.innerHTML = `<div class="td-modal" role="dialog" aria-modal="true" aria-label="Confirm test data generation"><h3>Generate ${c.total} sandbox transaction${c.total > 1 ? 's' : ''}?</h3>
                <div class="td-note">I will create the following in <b>${esc(p ? p.label : 'the default account')}</b> (sandbox), spread over ${c.channels.length} processing channel${c.channels.length > 1 ? 's' : ''}:</div>
                <ul>${lines}${decl}${disp}${fol}<li>Card brands: ${Object.keys(c.schemes).filter(k => c.schemes[k]).map(k => esc(SCHEMES[k].label)).join(', ')} — a brand the sandbox refuses is skipped and the rest continues</li><li>Payments ${c.ccys.map(esc).join(' / ')}, ${c.amin}–${c.amax} each${(c.counts.ptc || c.counts.ptb) ? `; payouts in EUR, ${c.pmin}–${c.pmax}` : ''}; no 3D Secure</li></ul>
                <div class="td-note">About <b>${calls}</b> API calls, roughly ${Math.max(5, Math.round(calls * 1.3 / c.conc))} seconds. Keep this tab open until it finishes — you can press Stop at any time. Nothing here can touch a live account.</div>
                <div class="td-actions"><button type="button" class="copy-btn" data-m="no">Cancel</button><button type="button" class="main-button" data-m="yes">Continue</button></div></div>`;
            const done = (v) => { document.removeEventListener('keydown', onKey, true); back.remove(); resolve(v); };
            const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); done(false); } };
            back.addEventListener('click', (e) => { if (e.target === back) return done(false); const m = e.target.closest('[data-m]'); if (m) done(m.dataset.m === 'yes'); });
            document.addEventListener('keydown', onKey, true); document.body.appendChild(back); back.querySelector('[data-m="yes"]').focus();
        });
    }
    function lock(on) { S.running = on; document.querySelectorAll('#td-root .td-card:not(:last-child) :is(input,select,button)').forEach(el => { if (on) { el.dataset.tdWas = el.disabled ? '1' : ''; el.disabled = true; } else { el.disabled = el.dataset.tdWas === '1'; } }); }
    function showErrors(list) {
        const box = $('td-errors'), errs = list.filter(x => !x.startsWith('__warn__')), warns = list.filter(x => x.startsWith('__warn__')).map(x => x.slice(8));
        box.hidden = !(errs.length || warns.length); box.className = 'td-flag ' + (errs.length ? 'bad' : 'warn');
        box.innerHTML = errs.length ? '<b>Fix this first:</b><ul style="margin:6px 0 0;padding-left:18px;">' + errs.map(x => `<li>${esc(x)}</li>`).join('') + '</ul>' : warns.map(esc).join('<br>');
        return errs.length === 0;
    }
    async function onGenerate() {
        if (S.running || machine.is('confirming')) return;
        const c = readConfig(), problems = validate(c);
        if (!showErrors(problems)) { $('td-errors').scrollIntoView({ block: 'nearest', behavior: 'smooth' }); return; }
        machine.send('CONFIRM');
        const ok = await confirmModal(c);
        if (!ok) { machine.send('CANCEL'); return; }
        persist(); $('td-generate').hidden = true; $('td-stop').hidden = false; $('td-stop').disabled = false;
        await run(c);
    }

    // ---- "check which cards this account accepts" -------------------------------------------------------------------------------------------------
    async function checkAccepted() {
        const st = settings(); const out = $('td-check-res');
        const ch = st.channels.find(x => /^pc_[a-z0-9]{20,40}$/.test(x));
        if (!ch) { out.textContent = 'Add a processing channel first.'; return; }
        const done = window.Common.busyStart('td-check', 'Checking…'); if (!done) return;
        try {
            const b = Date.now().toString(36).slice(-5), res = {}; out.innerHTML = '';
            for (const k of Object.keys(SCHEMES)) {
                const cd = SCHEMES[k].cards[0];
                const r = await call('payment', { amount: 100, currency: 'GBP', card: { number: cd.n, expiry_month: 12, expiry_year: 2030, cvv: cd.cvv }, card_name: 'Test Customer', reference: `CHECK-${b}-${k}`, processing_channel_id: ch, metadata: { generator: 'cko-demo-testdata', batch: 'check', kind: 'check' } }, `check-${b}-${k}`);
                logCall(r.env, `check ${k}`, true);
                const d = r.data || {}, ok = d.approved === true || /^(Authorized|Captured)$/.test(d.status || '');
                res[k] = ok;
                const why = ok ? '' : (d.response_code ? 'declined ' + d.response_code : apiErrorText({ data: d, status: r.status, error: r.error }));
                out.innerHTML += `${pill(`${SCHEMES[k].label} ${ok ? '✓ approved' : '✗ ' + why}`, ok ? 'good' : 'bad')} `;
            }
            saveSettings({ schemes: res });
            renderSchemes();
            toast('Card brands updated from what this account approved', 'success');
        } finally { done(); }
    }

    // ---- events -----------------------------------------------------------------------------------------------------------------------------------------
    function bind() {
        const root = $('td-root');
        root.addEventListener('input', (e) => {
            const t = e.target;
            if (t.id === 'td-total') { updateAssigned(); }
            else if (t.dataset.cat) { S.counts[t.dataset.cat] = Math.max(0, parseInt(t.value, 10) || 0); updateAssigned(); }
            else if (/^td-f-/.test(t.id)) updateFollowNote();
            if (t.id !== 'td-ca' && t.id !== 'td-ch-input') persist();
        });
        root.addEventListener('change', (e) => {
            const t = e.target;
            if (t.dataset.scheme) { const st = settings(); saveSettings({ schemes: { ...st.schemes, [t.dataset.scheme]: t.checked } }); renderDisputes(); }
            if (t.id === 'td-total') rescaleSplit();
            if (t.id === 'td-ca') saveSettings({ ca: t.value.trim() });
            if (t.id === 'td-profile') { S.sel = t.value; savePrefs({ selected: S.sel }); renderProfileBar(); }
            persist();
        });
        root.addEventListener('click', async (e) => {
            const t = e.target;
            const copy = t.closest('[data-copy]'); if (copy) { try { await navigator.clipboard.writeText(copy.dataset.copy); toast('Copied', 'success'); } catch (x) { /* ignore */ } return; }
            const del = t.closest('[data-ch-del]'); if (del) { const st = settings(); saveSettings({ channels: st.channels.filter(c => c !== del.dataset.chDel) }); renderSettings(); return; }
            const all = t.closest('[data-td-all]'); if (all) { const mode = all.dataset.tdAll.split(':')[1]; document.querySelectorAll('#td-decl [data-decl]').forEach(cb => { const d = DECLINES.find(x => x.key === cb.dataset.decl); cb.checked = mode === 'all' || (mode === '1' && d.v === 1); }); persist(); return; }
            if (t.id === 'td-ch-add') {
                const v = $('td-ch-input').value.trim();
                if (!/^pc_[a-z0-9]{20,40}$/.test(v)) { toast('That is not a processing channel id (pc_…).', 'error'); return; }
                const st = settings(); if (!st.channels.includes(v)) saveSettings({ channels: [...st.channels, v] });
                $('td-ch-input').value = ''; renderSettings(); return;
            }
            if (t.id === 'td-rebalance') { resetSplit(); persist(); return; }
            if (t.id === 'td-check') return checkAccepted();
            if (t.id === 'td-generate') return onGenerate();
            if (t.id === 'td-stop') { S.stop = true; machine.send('STOP'); t.disabled = true; $('td-state').textContent = 'Stopping after the requests in flight…'; return; }
            if (t.id === 'td-dl-json') return download(`${S.cfgRun.prefix}-${S.batch}-report.json`, JSON.stringify(report(), null, 2), 'application/json');
            if (t.id === 'td-dl-csv') return download(`${S.cfgRun.prefix}-${S.batch}-report.csv`, reportCsv(), 'text/csv');
            if (t.id === 'td-disputes') return checkDisputes();
            if (t.id === 'td-prof-new') { const p = await openProfileEditor(null); if (p) { const l = profiles(); l.push(p); saveProfiles(l); S.sel = p.id; savePrefs({ selected: p.id }); renderProfileBar(); } return; }
            if (t.id === 'td-prof-edit') { const cur = current(); if (!cur) return; const p = await openProfileEditor(cur); if (p) { const l = profiles(), i = l.findIndex(x => x.id === p.id); if (i > -1) { l[i] = p; saveProfiles(l); renderProfileBar(); } } return; }
            if (t.id === 'td-prof-del') { const cur = current(); if (!cur) return; const ok = await window.Common.confirmDialog({ title: `Remove ${cur.label}?`, text: 'Its sealed secret key and saved settings are forgotten in this browser. Nothing is deleted in Checkout.com.', confirmLabel: 'Remove', danger: true }); if (ok) { saveProfiles(profiles().filter(x => x.id !== cur.id)); S.sel = 'default'; renderProfileBar(); } }
        });
        $('td-ch-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('td-ch-add').click(); } });
    }

    // ---- start ---------------------------------------------------------------------------------------------------------------------------------------------
    async function loadConfig() {
        try { const r = await fetch(`${API}/config`); S.cfg = r.ok ? await r.json() : null; } catch (e) { S.cfg = null; }
        S.cfgOk = !!S.cfg;
        if (!S.cfg) { const f = $('td-sandbox-flag'); f.hidden = false; f.textContent = 'The test-data service is not reachable yet (GET /testdata/config) — deploy the backend and check the API Gateway route.'; S.cfg = { sealingAvailable: false, default: {} }; }
    }
    async function init() {
        if (!$('td-root')) return;
        machine.bind($('td-root'));
        const pr = prefs();
        S.sel = pr.selected || 'default';
        if (pr.total) $('td-total').value = pr.total;
        ['amin', 'amax', 'pmin', 'pmax'].forEach(k => { if (pr[k] !== undefined && !isNaN(pr[k])) $('td-' + k).value = pr[k]; });
        if (pr.conc) $('td-conc').value = pr.conc; if (pr.prefix) $('td-prefix').value = pr.prefix;
        if (pr.fpan !== undefined) $('td-fpan').checked = pr.fpan; if (pr.logall) $('td-logall').checked = true;
        if (pr.follow) { $('td-f-auth').value = pr.follow.auth || 0; $('td-f-void').value = pr.follow.void || 0; $('td-f-cap').value = pr.follow.cap || 0; $('td-f-ref').value = pr.follow.ref || 0; $('td-f-pref').value = pr.follow.pref || 0; }
        if (pr.counts && Object.values(pr.counts).reduce((a, b) => a + b, 0) === total()) { S.counts = pr.counts; } else { const a = allocate(total(), CATS.map(c => c.def)); CATS.forEach((c, i) => { S.counts[c.id] = a[i]; }); }
        renderCats(); renderCcys(); bind();
        await loadConfig();
        renderProfileBar();
    }
    window.TestData = { onShow() { if (!S.cfg) return; loadConfig().then(renderProfileBar); }, plan: (c) => buildPlan(c), _test: { allocate, DECLINES, SCHEMES, CATS, readConfig, validate, buildPlan } };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
