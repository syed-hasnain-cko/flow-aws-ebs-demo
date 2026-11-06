// =============================================
// Wallet Onboarding — Apple Pay + Google Pay setup for a merchant account
// Handles: merchant profiles (public values stored as is, the secret key sealed by the server), one request per domain,
//          the Apple CSR / payment-processing-certificate workflow, and the Google Pay entity registry.
// Backend: POST /wallet-onboarding/{seal,call,inspect-cert}, GET /wallet-onboarding/config  (see wallet-onboarding-routes.js).
// Every Checkout.com exchange is written to the API log (request + response only — never a key).
// =============================================

(function () {
    const API = window.APP_CONFIG?.apiBaseUrl || '';
    const { $, val, esc, Store, confirmDialog } = window.Common;
    const K = { profiles: 'cko-wallet-onboarding-profiles', prefs: 'cko-wallet-onboarding-prefs', apple: 'cko-wallet-onboarding-apple-log', gpay: 'cko-wallet-onboarding-gpay' };
    const state = { cfg: null, sel: 'default', wallet: 'apple', at: 'domains', gt: 'enroll', prodOk: false, csr: null, cert: null };

    // =====================================================================
    // Small helpers
    // =====================================================================
    const now = () => Date.now();
    const toast = (m, t) => (window.showToast ? window.showToast(m, t) : null);
    const fmtDate = (iso) => { const d = new Date(iso); return isNaN(d) ? String(iso || '') : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); };
    const fmtTime = (ms) => new Date(ms).toLocaleString([], { hour12: false, month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    function rel(ms) {
        const diff = ms - now(), a = Math.abs(diff), m = Math.floor(a / 60000), h = Math.floor(m / 60), d = Math.floor(h / 24);
        const t = d >= 2 ? `${d} days` : h >= 1 ? `${h}h ${m % 60}m` : `${Math.max(m, 0)}m`;
        return diff >= 0 ? `in ${t}` : `${a < 60000 ? 'just now' : t + ' ago'}`;
    }
    const until = (ms) => `<span data-until="${ms}">${esc(rel(ms))}</span>`;
    const copyChip = (v, label) => v ? `<span class="wo-copy" data-copy="${esc(v)}" title="Click to copy">${esc(label || v)}</span>` : '';
    const pill = (text, tone) => `<span class="wo-pill ${tone || ''}">${esc(text)}</span>`;
    const uid = () => 'p_' + Math.random().toString(36).slice(2, 10);
    const jsonStore = (key, fallback) => Store.getJSON(key, fallback);

    function normHost(v) {                       // mirrors the server (cleanHost) so mistakes show before anything is sent
        const s = String(v || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/[/?#].*$/, '').replace(/:\d+$/, '').replace(/\.$/, '');
        if (!s) return { host: '', error: 'empty' };
        const labels = s.split('.');
        if (/^\d+(\.\d+){3}$/.test(s)) return { host: s, error: 'an IP address cannot be enrolled' };
        if (s.length > 253 || labels.length < 2 || !labels.every(l => /^(?!-)[a-z0-9-]{1,63}(?<!-)$/.test(l))) return { host: s, error: 'not a valid domain name' };
        return { host: s };
    }
    function parseDomains(text) {
        const seen = new Set(), out = [];
        String(text || '').split(/[\s,;]+/).filter(Boolean).forEach(tok => {
            const n = normHost(tok), key = n.host || tok;
            if (seen.has(key)) return; seen.add(key);
            out.push({ host: n.host || tok, error: n.error || null });
        });
        return out;
    }
    const ENT_RE = /^ent_[a-z0-9]{20,40}$/;

    // =====================================================================
    // Merchant profiles — public values as is; the secret key is sealed by the server and only an opaque token is kept here
    // =====================================================================
    const profiles = () => jsonStore(K.profiles, []);
    const saveProfiles = (l) => Store.setJSON(K.profiles, l);
    const profileById = (id) => (id === 'default' ? null : profiles().find(p => p.id === id) || null);
    const current = () => profileById(state.sel);
    const payload = (p) => (!p ? { kind: 'default' } : { kind: 'merchant', environment: p.environment, prefix: p.prefix || undefined, publicKey: p.publicKey || undefined, token: p.token });
    const isProd = (p) => (p ? p.environment === 'production' : state.cfg?.default?.environment === 'production');
    const keyExpired = (p) => !!p && (!p.token || p.expiresAt < now());
    const labelOf = (p) => (p ? p.label : 'My account');
    const prefs = () => jsonStore(K.prefs, {});
    const savePrefs = (patch) => Store.setJSON(K.prefs, { ...prefs(), ...patch });
    function entityDefaults() { const p = current(); return p ? { entityId: p.entityId || '', email: p.email || '' } : (prefs().def || { entityId: '', email: '' }); }
    function rememberEntity(entityId, email) {
        const p = current();
        if (p) { const l = profiles(), i = l.findIndex(x => x.id === p.id); if (i > -1) { if (entityId) l[i].entityId = entityId; if (email) l[i].email = email; saveProfiles(l); } }
        else savePrefs({ def: { entityId: entityId || entityDefaults().entityId, email: email || entityDefaults().email } });
    }

    function renderProfileBar() {
        const sel = $('wo-profile');
        sel.innerHTML = `<option value="default">My account · Settings / server default</option>` + profiles().map(p => `<option value="${esc(p.id)}">${esc(p.label)} · ${esc(p.environment)}</option>`).join('');
        if (!profileById(state.sel)) state.sel = 'default';
        sel.value = state.sel;
        const p = current(), info = $('wo-prof-info');
        $('wo-prof-edit').disabled = $('wo-prof-del').disabled = !p;
        if (!p) {
            const d = state.cfg?.default;
            info.innerHTML = d ? `${pill(d.environment, d.environment === 'production' ? 'bad' : 'info')} ${d.source === 'settings-account' ? 'Using your <b>Settings</b> account' : 'Using the <b>server’s</b> account'} · secret key <code>${esc(d.secretKey.masked || 'not set')}</code> · public key <code>${esc((d.publicKey || '').slice(0, 12))}…</code>` : 'Loading…';
        } else {
            const exp = keyExpired(p);
            info.innerHTML = `${pill(p.environment, p.environment === 'production' ? 'bad' : 'info')} ${p.prefix ? `prefix <code>${esc(p.prefix)}</code> · ` : ''}${p.publicKey ? `public key <code>${esc(p.publicKey.slice(0, 12))}…</code> · ` : ''}` +
                (exp ? `<span style="color:var(--error);font-weight:600;">secret key expired — choose Edit and enter it again</span>` : `🔒 secret key sealed <code>${esc(p.masked || '')}</code> · expires ${until(p.expiresAt)}`);
        }
        $('wo-auth').querySelector('option[value="public"]').disabled = !!p && !p.publicKey;
        if ($('wo-auth').value === 'public' && p && !p.publicKey) $('wo-auth').value = 'secret';
        tickCountdowns();
    }

    function openProfileEditor(existing) {
        return new Promise((resolve) => {
            const e = existing || {};
            const back = document.createElement('div');
            back.className = 'wo-modal-back';
            back.innerHTML = `<div class="wo-modal" role="dialog" aria-modal="true">
                <h3>${existing ? 'Edit merchant' : 'New merchant'}</h3>
                <div class="wo-note">Public values are kept in this browser as they are. The secret key is encrypted by the server — this browser only keeps an opaque token.</div>
                <div class="wo-grid">
                    <div><label class="l">Name</label><input id="wo-pe-name" class="text-input" placeholder="Acme Ltd" value="${esc(e.label || '')}" autocomplete="off"></div>
                    <div><label class="l">Environment</label><select id="wo-pe-env" class="select-input"><option value="sandbox">Sandbox</option><option value="production">Production</option></select></div>
                    <div><label class="l">Account prefix <small>(optional)</small></label><input id="wo-pe-prefix" class="text-input" placeholder="the {prefix} in your base URL" value="${esc(e.prefix || '')}" autocomplete="off"></div>
                    <div><label class="l">Entity ID <small>(Google Pay)</small></label><input id="wo-pe-entity" class="text-input" placeholder="ent_…" value="${esc(e.entityId || '')}" autocomplete="off" spellcheck="false"></div>
                    <div><label class="l">Public key</label><input id="wo-pe-pk" class="text-input" placeholder="pk_sbox_…" value="${esc(e.publicKey || '')}" autocomplete="off" spellcheck="false"></div>
                    <div><label class="l">Email for Google terms <small>(optional)</small></label><input id="wo-pe-email" class="text-input" type="email" value="${esc(e.email || '')}" autocomplete="off"></div>
                    <div style="grid-column:1/-1;"><label class="l">Secret key ${existing && e.token && e.expiresAt > now() ? `<small>— 🔒 sealed <code>${esc(e.masked || '')}</code>, leave empty to keep it</small>` : ''}</label>
                        <input id="wo-pe-sk" class="text-input" type="password" placeholder="sk_sbox_…" autocomplete="new-password" spellcheck="false"></div>
                    <div><label class="l">Keep the secret key for</label><select id="wo-pe-ttl" class="select-input"><option value="8">8 hours</option><option value="24" selected>24 hours</option><option value="168">7 days</option></select></div>
                </div>
                <div class="err" id="wo-pe-err"></div>
                <div class="wo-actions" style="justify-content:flex-end;"><button type="button" class="copy-btn" data-m="no">Cancel</button><button type="button" class="main-button" data-m="yes">Save merchant</button></div></div>`;
            document.body.appendChild(back);
            back.querySelector('#wo-pe-env').value = e.environment || 'sandbox';
            const q = (id) => back.querySelector('#' + id), err = (m) => { q('wo-pe-err').textContent = m || ''; };
            const close = (v) => { document.removeEventListener('keydown', onKey, true); back.remove(); resolve(v); };
            const onKey = (ev) => { if (ev.key === 'Escape') { ev.stopPropagation(); close(null); } };
            document.addEventListener('keydown', onKey, true);
            back.addEventListener('click', async (ev) => {
                if (ev.target === back) return close(null);
                const m = ev.target.closest('[data-m]'); if (!m) return;
                if (m.dataset.m === 'no') return close(null);
                const name = q('wo-pe-name').value.trim(), env = q('wo-pe-env').value, prefix = q('wo-pe-prefix').value.trim().toLowerCase(), pk = q('wo-pe-pk').value.trim();
                const entity = q('wo-pe-entity').value.trim(), email = q('wo-pe-email').value.trim(), sk = q('wo-pe-sk').value.trim();
                if (!name) return err('Give the merchant a name.');
                if (prefix && !/^[a-z0-9]{1,24}$/.test(prefix)) return err('The prefix may only contain lowercase letters and digits.');
                if (pk && !/^pk_(sbox_)?[A-Za-z0-9_-]{16,}$/.test(pk)) return err('That does not look like a public key (pk_…).');
                if (pk && (env === 'sandbox') !== /^pk_sbox_/.test(pk)) return err(`The public key does not belong to the ${env} environment.`);
                if (entity && !ENT_RE.test(entity)) return err('The entity ID should look like ent_… .');
                if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return err('That email address does not look right.');
                if (!existing && !sk) return err('Enter the merchant’s secret key.');
                if (existing && !sk && (existing.environment !== env)) return err('You changed the environment — enter the secret key for it.');
                let sealed = {};
                if (sk) {
                    if (!/^sk_(sbox_)?[A-Za-z0-9_-]{16,}$/.test(sk)) return err('That does not look like a secret key (sk_…).');
                    if ((env === 'sandbox') !== /^sk_sbox_/.test(sk)) return err(`The secret key does not belong to the ${env} environment.`);
                    m.disabled = true; m.textContent = 'Sealing…';
                    try {
                        const r = await fetch(`${API}/wallet-onboarding/seal`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ secretKey: sk, environment: env, ttlHours: parseInt(q('wo-pe-ttl').value, 10) }) });
                        const j = await r.json().catch(() => ({}));
                        if (!r.ok) { m.disabled = false; m.textContent = 'Save merchant'; return err(j.error || `Could not seal the key (HTTP ${r.status})`); }
                        sealed = { token: j.token, expiresAt: j.expiresAt, masked: j.masked };
                    } catch (x) { m.disabled = false; m.textContent = 'Save merchant'; return err('Network error: ' + x.message); }
                }
                close({ ...(existing || { id: uid() }), label: name, environment: env, prefix, publicKey: pk, entityId: entity, email, ...sealed });
            });
            q('wo-pe-name').focus();
        });
    }

    // =====================================================================
    // Calling the backend
    // =====================================================================
    const SCOPE = { 'apple.enroll': 'vault:apme-enrollment', 'google.enroll': 'vault:gpayme-enrollment', 'google.domain': 'vault:gpayme-enrollment', 'google.state': 'vault:gpayme-enrollment', 'google.domains': 'vault:gpayme-enrollment' };
    // Checkout.com answers an entity that is not enrolled with HTTP 400 + errorCodes ["Entity not onboarded for entityId: …"] (seen live); older/other paths may use 404
    const notEnrolled = (r) => !!r && !r.ok && !r.local && String(r.op || '').startsWith('google.') && (r.status === 404 || /not onboarded/i.test(JSON.stringify(r.data || '')));
    const stateOf = (d) => (d && typeof d === 'object' ? (d.state || d.status || d.enrollment_state || d.enrollmentState || '') : '');
    function domainsOf(d) {
        const arr = Array.isArray(d) ? d : (d && (d.domains || d.web_domains || d.webDomains || d.items || d.data)) || [];
        return (Array.isArray(arr) ? arr : []).map(x => (typeof x === 'string' ? x : x && (x.web_domain || x.domain || x.hostname || x.name))).filter(Boolean);
    }
    async function call(op, params, opts = {}) {
        const p = opts.profile !== undefined ? opts.profile : current();
        if (p && keyExpired(p)) return { op, ok: false, local: true, status: 0, text: 'The saved secret key has expired — choose Edit on this merchant and enter it again.' };
        const body = { op, params, profile: payload(p), auth: $('wo-auth').value, ...(state.prodOk ? { confirmProduction: true } : {}) };
        let res, j;
        try {
            res = await fetch(`${API}/wallet-onboarding/call`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            j = await res.json().catch(() => ({}));
        } catch (e) { return { op, ok: false, local: true, status: 0, text: 'Network error: ' + e.message }; }
        if (j.upstream_status === undefined) return { op, ok: false, local: true, status: res.status, text: j.error || `Request failed (HTTP ${res.status})` };   // refused before reaching Checkout.com — not logged
        const m = String(j.upstream || '').match(/^([A-Z]+)\s+(https?:\/\/\S+)$/);
        if (m && window.addToApiLog) window.addToApiLog(m[1], m[2].replace(/^https?:\/\/[^/]+/, ''), j.upstream_status, j.request?.body ?? {}, j.data ?? null, m[2], { duration_ms: j.duration_ms, ...(j.cko_request_id ? { request_id: j.cko_request_id } : {}) });
        return { op, ok: j.upstream_status >= 200 && j.upstream_status < 300, status: j.upstream_status, ms: j.duration_ms, requestId: j.cko_request_id, request: j.request, data: j.data, upstream: j.upstream, auth: j.auth, environment: j.environment };
    }
    async function withGuard(text, fn) {
        if (isProd(current())) {
            if (!(await confirmDialog({ title: 'Change a PRODUCTION account?', text, confirmLabel: 'Yes, send it', danger: true }))) return false;
            state.prodOk = true;
        }
        try { await fn(); return true; } finally { state.prodOk = false; }
    }

    const CODE_HELP = {
        domain_required: 'Enter a domain.', protocol_version_should_be_rsa_v1_or_ec_v1: 'Choose EC (ec_v1) or RSA (rsa_v1).',
        request_body_malformed: 'Checkout.com could not read the certificate — upload the .cer file exactly as Apple gave it.',
        entity_id_required: 'An entity ID is required.', email_address_required: 'An email address is required.', accept_terms_of_service_required: 'The Google terms of service must be accepted.',
    };
    const OK_TEXT = {
        'apple.enroll': () => 'Domain enrolled for Apple Pay.', 'apple.csr': () => 'Signing request generated — valid for 24 hours.',
        'apple.certificate': (r) => `Certificate uploaded${r.data?.valid_until ? ` — valid until ${fmtDate(r.data.valid_until)}` : ''}.`,
        'google.enroll': () => 'Entity enrolled with Google Pay.', 'google.domain': () => 'Domain registered.',
        'google.state': (r) => `Enrollment state: ${stateOf(r.data) || 'returned'}.`, 'google.domains': (r) => `${domainsOf(r.data).length} registered domain(s).`,
    };
    function describe(r) {
        if (r.local) return { ok: false, text: r.text };
        if (r.ok) return { ok: true, text: (OK_TEXT[r.op] || (() => 'Done.'))(r) };
        const d = r.data || {}, codes = d.error_codes || d.errorCodes || [];
        let t = codes.length && !notEnrolled(r) ? codes.map(c => CODE_HELP[c] || String(c).replace(/_/g, ' ')).join(' · ') : '';
        if (notEnrolled(r)) t = r.op === 'google.domain' ? 'This entity is not enrolled with Google Pay yet — enroll it on the first tab, then register domains.' : 'This entity is not enrolled with Google Pay yet.';
        if (!t) t = ({ 401: 'Not authorised.', 403: 'Not allowed for this key.', 404: 'Not found.', 409: 'Conflict — it may already exist.', 422: 'Checkout.com rejected the request.', 429: 'Too many requests — wait a moment and retry.' })[r.status] || (r.status >= 500 ? 'Checkout.com had a problem — try again.' : `HTTP ${r.status}`);
        if ((r.status === 401 || r.status === 403) && SCOPE[r.op]) t += ` Check the key’s environment and that it has the scope ${SCOPE[r.op]}.`;
        return { ok: false, text: t };
    }
    const rawBlock = (r) => (r.request ? `<details class="wo-d"><summary>Request &amp; response</summary><div class="wo-note"><code>${esc(r.upstream || '')}</code>${r.auth ? ' · ' + esc(r.auth) : ''}</div><pre class="wo-pre">${esc(JSON.stringify({ request: r.request.body ?? null, response: r.data ?? null, status: r.status }, null, 2))}</pre></details>` : '');
    function resultCard(r, title, extra) {
        const d = describe(r), tone = d.ok ? 'good' : 'bad';
        return `<div class="wo-res ${tone}"><div class="h">${pill(d.ok ? 'Success' : 'Failed', tone)}<b>${esc(title)}</b><span class="m">${r.local ? 'not sent' : `HTTP ${r.status} · ${r.ms} ms`}</span></div>
            <div class="t">${esc(d.text)}</div>${extra || ''}${r.requestId ? `<div class="wo-kv"><div><div class="k">Request id</div><div class="v">${copyChip(r.requestId)}</div></div></div>` : ''}${rawBlock(r)}</div>`;
    }
    const kv = (pairs) => `<div class="wo-kv">${pairs.filter(Boolean).map(([k, v]) => `<div><div class="k">${esc(k)}</div><div class="v">${v}</div></div>`).join('')}</div>`;

    // =====================================================================
    // Domain batches (Apple enroll / Google register) — one request per domain, live per-row result
    // =====================================================================
    function makeBatch(c) {
        const b = { rows: [], running: false, open: new Set() };
        function list() { const l = parseDomains($(c.input).value); $(c.chips).innerHTML = l.map(x => `<span class="wo-chip ${x.error ? 'bad' : ''}" title="${esc(x.error || '')}">${esc(x.host)}${x.error ? ' ✕ ' + esc(x.error) : ''}</span>`).join(''); return l; }
        function refresh() {
            const valid = list().filter(x => !x.error).length;
            $(c.run).disabled = b.running || !valid || (c.ready && !c.ready());
            $(c.run).textContent = b.running ? 'Working…' : valid ? `${c.verb} ${valid} domain${valid > 1 ? 's' : ''}` : `${c.verb} domains`;
        }
        function paint() {
            const done = b.rows.filter(r => r.status === 'ok').length, failed = b.rows.filter(r => r.status === 'fail').length, total = b.rows.length;
            $(c.sum).textContent = total ? `${done} of ${total} done${failed ? ` · ${failed} failed` : ''}` : '';
            $(c.retry).hidden = !b.rows.some(r => r.status === 'fail') || b.running;
            if (!total) { $(c.results).innerHTML = ''; return; }
            $(c.results).innerHTML = `<table class="wo-table"><tr><th></th><th>Domain</th><th>Result</th><th>HTTP</th><th>Request id</th></tr>` + b.rows.map((row, i) => {
                const r = row.res, icon = { pending: '•', running: '⏳', ok: '✓', fail: '✕', skipped: '–' }[row.status], d = r ? describe(r) : null;
                return `<tr><td style="width:24px;color:${row.status === 'ok' ? 'var(--success)' : row.status === 'fail' ? 'var(--error)' : 'inherit'};font-weight:700;">${icon}</td><td><code>${esc(row.host)}</code></td>
                    <td>${row.status === 'running' ? 'sending…' : row.status === 'pending' ? 'waiting' : row.status === 'skipped' ? 'not sent' : esc(d.text)}${r && r.request ? `<details class="wo-d" data-k="${esc(row.host)}" ${b.open.has(row.host) ? 'open' : ''}><summary>Request &amp; response</summary><pre class="wo-pre">${esc(JSON.stringify({ request: r.request.body ?? null, response: r.data ?? null, status: r.status }, null, 2))}</pre></details>` : ''}</td>
                    <td>${r && !r.local ? r.status : ''}</td><td>${r ? copyChip(r.requestId) : ''}</td></tr>`;
            }).join('') + '</table>';
        }
        async function run(rows) {
            if (!rows.length || b.running) return;
            b.running = true; refresh(); paint();
            const sent = await withGuard(`${c.verb} ${rows.length} domain(s) on a PRODUCTION account? This sends ${rows.length} real request(s).`, async () => {
                for (const row of rows) {
                    row.status = 'running'; paint();
                    row.res = await c.send(row.host); row.status = row.res.ok ? 'ok' : 'fail'; paint();
                    if (c.onItem) c.onItem(row, row.res);
                }
            });
            if (sent === false) rows.forEach(r => { if (r.status === 'pending') r.status = 'skipped'; });
            b.running = false; refresh(); paint();
            if (sent !== false && c.onDone) await c.onDone(b.rows);
        }
        $(c.input).addEventListener('input', refresh);
        $(c.results).addEventListener('toggle', (e) => { const k = e.target.dataset && e.target.dataset.k; if (k) (e.target.open ? b.open.add(k) : b.open.delete(k)); }, true);
        $(c.run).addEventListener('click', () => { const l = list().filter(x => !x.error); b.rows = l.map(x => ({ host: x.host, status: 'pending' })); run(b.rows); });
        $(c.retry).addEventListener('click', () => run(b.rows.filter(r => r.status === 'fail')));
        $(c.clear).addEventListener('click', () => { b.rows = []; $(c.input).value = ''; refresh(); paint(); });
        b.refresh = refresh;
        return b;
    }

    // =====================================================================
    // Apple Pay
    // =====================================================================
    const appleLog = () => jsonStore(K.apple, []);
    function logApple(entry) { Store.setJSON(K.apple, [{ at: now(), pid: state.sel, account: labelOf(current()), ...entry }, ...appleLog()].slice(0, 300)); renderActivity(); }

    let apDomains;
    function initAppleDomains() {
        apDomains = makeBatch({
            input: 'wo-ap-dom-input', chips: 'wo-ap-dom-chips', run: 'wo-ap-dom-run', retry: 'wo-ap-dom-retry', clear: 'wo-ap-dom-clear', sum: 'wo-ap-dom-sum', results: 'wo-ap-dom-results', verb: 'Enroll',
            send: (host) => call('apple.enroll', { domain: host }),
            onItem: (row, r) => logApple({ action: 'Enroll domain', target: row.host, ok: r.ok, status: r.status, requestId: r.requestId, detail: describe(r).text }),
        });
    }

    async function generateCsr() {
        const mid = val('wo-ap-mid').trim(), protocol = val('wo-ap-proto');
        if (mid && !/^merchant\.[A-Za-z0-9.\-_]+$/.test(mid)) { $('wo-ap-csr-out').innerHTML = `<div class="wo-flag bad">An Apple Merchant ID looks like <code>merchant.com.example</code>.</div>`; return; }
        $('wo-ap-csr-run').disabled = true; $('wo-ap-csr-out').innerHTML = '<div class="wo-note" style="margin-top:12px;">Generating…</div>';
        let r;
        await withGuard('Generate a signing request on a PRODUCTION account?', async () => { r = await call('apple.csr', { protocol_version: protocol }); });
        $('wo-ap-csr-run').disabled = false;
        if (!r) { $('wo-ap-csr-out').innerHTML = ''; return; }
        let extra = '';
        if (r.ok && r.data && r.data.content) {
            state.csr = { content: r.data.content, mid, protocol, at: now(), pid: state.sel };
            const file = `${mid || 'cko'}.csr`;
            extra = `<div class="wo-field"><label class="l">Signing request — valid until ${until(state.csr.at + 24 * 3600 * 1000)}</label><textarea readonly rows="4" id="wo-ap-csr-text">${esc(r.data.content)}</textarea></div>
                <div class="wo-actions"><button type="button" class="main-button" id="wo-ap-csr-dl">Download ${esc(file)}</button><button type="button" class="copy-btn" id="wo-ap-csr-copy">Copy</button><button type="button" class="copy-btn" id="wo-ap-csr-next">Next: upload the certificate →</button></div>
                <ol class="wo-steps"><li>Apple Developer → <a href="https://developer.apple.com/account/resources/identifiers/list/merchant" target="_blank" rel="noopener">Merchant IDs</a> → ${mid ? `<code>${esc(mid)}</code>` : 'your merchant ID'} → <b>Apple Pay Payment Processing Certificate</b> → Create certificate.</li><li>Upload <code>${esc(file)}</code>, then download <code>apple_pay.cer</code>.</li><li>Upload that file on the next tab.</li></ol>`;
        }
        logApple({ action: 'Generate signing request', target: mid || '(no merchant id)', mid, protocol, ok: r.ok, status: r.status, requestId: r.requestId, detail: describe(r).text, csrExpiresAt: r.ok ? now() + 24 * 3600 * 1000 : undefined });
        $('wo-ap-csr-out').innerHTML = resultCard(r, 'Signing request', extra);
        tickCountdowns();
    }
    function downloadText(name, text) {
        const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' })), a = document.createElement('a');
        a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    // certificate: read the file here, let the server decode it, show what it is BEFORE uploading
    async function inspectCert(content) {
        $('wo-ap-cert-info').innerHTML = '<div class="wo-note" style="margin-top:10px;">Reading certificate…</div>';
        state.cert = null; $('wo-ap-cert-run').disabled = true;
        try {
            const r = await fetch(`${API}/wallet-onboarding/inspect-cert`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content }) });
            const j = await r.json().catch(() => ({}));
            if (!r.ok) { $('wo-ap-cert-info').innerHTML = `<div class="wo-flag bad">${esc(j.error || 'Could not read this file.')}</div>`; return; }
            state.cert = j; renderCertInfo();
        } catch (e) { $('wo-ap-cert-info').innerHTML = `<div class="wo-flag bad">Network error: ${esc(e.message)}</div>`; }
    }
    function renderCertInfo() {
        const c = state.cert; if (!c) return;
        const mid = val('wo-ap-cert-mid').trim(), csr = state.csr && state.csr.pid === state.sel ? state.csr : null;
        const checks = [];
        if (c.isExpired) checks.push(['bad', `Expired on ${fmtDate(c.validToIso)} — it cannot be used.`]);
        if (!c.isPaymentProcessing) checks.push(['warn', 'This does not look like a <b>Payment Processing</b> certificate (it may be the Merchant Identity one). Checkout.com needs the Payment Processing certificate.']);
        if (mid && c.merchantId && mid !== c.merchantId) checks.push(['warn', `Merchant ID mismatch: you entered <code>${esc(mid)}</code>, the certificate is for <code>${esc(c.merchantId)}</code>.`]);
        if (csr && csr.protocol && c.protocolVersion && csr.protocol !== c.protocolVersion) checks.push(['warn', `Your last signing request used ${esc(csr.protocol)}, but this certificate is ${esc(c.protocolVersion)}.`]);
        if (!checks.length) checks.push(['good', 'Looks right — payment processing certificate, in date' + (mid && c.merchantId === mid ? ', merchant ID matches' : '') + '.']);
        $('wo-ap-cert-info').innerHTML = kv([['Merchant ID', esc(c.merchantId || '—')], ['Type', esc((c.keyType || '').toUpperCase() + (c.protocolVersion ? ` (${c.protocolVersion})` : ''))], ['Valid until', `${esc(fmtDate(c.validToIso))} · ${until(new Date(c.validToIso).getTime())}`], ['Organisation', esc(c.organisation || '—')]]) +
            checks.map(([t, m]) => `<div class="wo-flag ${t}">${m}</div>`).join('');
        $('wo-ap-cert-run').disabled = !!c.isExpired;
        if (!mid && c.merchantId) $('wo-ap-cert-mid').value = c.merchantId;
        tickCountdowns();
    }
    async function readCertFile(file) {
        if (!file) return;
        const bytes = new Uint8Array(await file.arrayBuffer());
        let text = ''; try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch (e) { /* binary DER */ }
        let content;
        if (text && (/-----BEGIN/.test(text) || /^[A-Za-z0-9+/=\s]{200,}$/.test(text.trim()))) content = text;
        else { let s = ''; for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192)); content = btoa(s); }
        $('wo-ap-cert-paste').value = '';
        await inspectCert(content);
    }
    async function uploadCert() {
        if (!state.cert) return;
        $('wo-ap-cert-run').disabled = true; $('wo-ap-cert-out').innerHTML = '<div class="wo-note" style="margin-top:12px;">Uploading…</div>';
        let r;
        await withGuard('Upload a payment processing certificate to a PRODUCTION account?', async () => { r = await call('apple.certificate', { content: state.cert.content }); });
        $('wo-ap-cert-run').disabled = !!state.cert.isExpired;
        if (!r) { $('wo-ap-cert-out').innerHTML = ''; return; }
        const d = r.data || {};
        const extra = r.ok ? kv([['Certificate id', copyChip(d.id)], ['Public key hash', copyChip(d.public_key_hash, (d.public_key_hash || '').slice(0, 16) + '…')], ['Valid from', esc(d.valid_from ? fmtDate(d.valid_from) : '—')], ['Valid until', d.valid_until ? `${esc(fmtDate(d.valid_until))} · ${until(new Date(d.valid_until).getTime())}` : '—']]) : '';
        logApple({ action: 'Upload certificate', target: state.cert.merchantId || '(unknown merchant id)', mid: state.cert.merchantId, ok: r.ok, status: r.status, requestId: r.requestId, detail: describe(r).text, certId: d.id, validUntil: d.valid_until });
        $('wo-ap-cert-out').innerHTML = resultCard(r, 'Payment processing certificate', extra);
        tickCountdowns();
    }

    function renderActivity() {
        const el = $('wo-ap-act-log'); if (!el) return;
        const log = appleLog().filter(x => x.pid === state.sel);
        const byMid = {};
        log.slice().reverse().forEach(x => { const m = x.mid || ''; if (!m && x.action !== 'Generate signing request') return; const o = byMid[m] = byMid[m] || {}; if (x.action === 'Generate signing request' && x.ok) o.csr = x; if (x.action === 'Upload certificate' && x.ok) o.cert = x; });
        const mids = Object.entries(byMid).filter(([, o]) => o.csr || o.cert);
        $('wo-ap-act-status').innerHTML = mids.length ? `<table class="wo-table"><tr><th>Merchant ID</th><th>Signing request</th><th>Payment processing certificate</th></tr>` + mids.map(([m, o]) => `<tr><td><code>${esc(m || '(none)')}</code></td>
            <td>${o.csr ? `${esc(fmtTime(o.csr.at))} · ${o.csr.csrExpiresAt > now() ? 'valid ' + until(o.csr.csrExpiresAt) : 'expired'}` : '—'}</td>
            <td>${o.cert ? `${pill('uploaded', 'good')} valid until ${esc(fmtDate(o.cert.validUntil))} · ${until(new Date(o.cert.validUntil).getTime())}` : pill('not uploaded', 'warn')}</td></tr>`).join('') + '</table>' : '';
        el.innerHTML = log.length ? `<table class="wo-table"><tr><th>When</th><th>Action</th><th>Target</th><th>Result</th><th>Request id</th></tr>` + log.map(x => `<tr><td>${esc(fmtTime(x.at))}</td><td>${esc(x.action)}</td><td><code>${esc(x.target || '')}</code></td>
            <td>${pill(x.ok ? 'ok' : 'failed', x.ok ? 'good' : 'bad')} <span class="wo-note">${esc(x.detail || '')}</span></td><td>${copyChip(x.requestId)}</td></tr>`).join('') + '</table>' : '<div class="wo-note" style="margin-top:12px;">Nothing yet for this merchant account.</div>';
        tickCountdowns();
    }

    // =====================================================================
    // Google Pay
    // =====================================================================
    const gAll = () => jsonStore(K.gpay, []);
    const gSave = (l) => Store.setJSON(K.gpay, l);
    function gUpsert(pid, entityId, patch) {
        const l = gAll(), i = l.findIndex(x => x.pid === pid && x.entityId === entityId);
        if (i > -1) l[i] = { ...l[i], ...patch }; else l.unshift({ pid, entityId, domains: [], state: '', ...patch });
        gSave(l.slice(0, 200)); renderMerchants(); renderEntityList();
    }
    const statePill = (s) => { const t = String(s || '').toUpperCase(); if (!t) return pill('unknown'); return pill(t, /ACTIVE|ENROLLED|APPROVED|SUCCESS|COMPLETE/.test(t) ? 'good' : /PEND|PROCESS|REVIEW|IN_PROGRESS/.test(t) ? 'warn' : /FAIL|REJECT|ERROR|INACTIVE|SUSPEND|NOT/.test(t) ? 'bad' : 'info'); };
    const entityVal = (id) => $(id).value.trim();

    async function refreshEntity(entityId, profile) {
        const p = profile === undefined ? current() : profile, pid = p ? p.id : 'default';
        const s = await call('google.state', { entity_id: entityId }, { profile: p });
        const d = s.ok || notEnrolled(s) ? await call('google.domains', { entity_id: entityId }, { profile: p }) : { ok: false, data: null, local: true, op: 'google.domains', text: 'skipped' };
        // a lookup only ADDS an entity that exists; one already in the list keeps being updated (e.g. it stopped being enrolled)
        if (s.ok || gAll().some(x => x.pid === pid && x.entityId === entityId)) gUpsert(pid, entityId, { state: s.ok ? (stateOf(s.data) || 'ENROLLED') : notEnrolled(s) ? 'NOT ENROLLED' : s.local ? 'unknown' : `error ${s.status}`, domains: d.ok ? domainsOf(d.data) : [], checkedAt: now() });
        return { s, d };
    }
    async function enrollEntity() {
        const entity = entityVal('wo-g-entity'), email = entityVal('wo-g-email'), tos = $('wo-g-tos').checked;
        $('wo-g-enroll-run').disabled = true; $('wo-g-enroll-out').innerHTML = '<div class="wo-note" style="margin-top:12px;">Enrolling…</div>';
        let r;
        await withGuard(`Enroll ${entity || 'this entity'} with Google Pay on a PRODUCTION account?`, async () => { r = await call('google.enroll', { entity_id: entity, email_address: email, accept_terms_of_service: tos }); });
        $('wo-g-enroll-run').disabled = false;
        if (!r) { $('wo-g-enroll-out').innerHTML = ''; return; }
        let extra = '';
        if (r.ok) { rememberEntity(entity, email); gUpsert(current() ? current().id : 'default', entity, { enrolledAt: now() }); const rr = await refreshEntity(entity); extra = `<div class="wo-note" style="margin-top:8px;">Now: ${statePill(stateOf(rr.s.data) || 'ENROLLED')} · ${domainsOf(rr.d.data).length} domain(s) registered. <a href="#" data-goto="domains" data-entity="${esc(entity)}">Register domains →</a></div>`; }
        $('wo-g-enroll-out').innerHTML = resultCard(r, 'Enroll entity', extra);
    }
    async function checkStatus(entityId, outId) {
        if (!ENT_RE.test(entityId)) { $(outId).innerHTML = `<div class="wo-flag bad">Enter the entity ID (ent_…) first.</div>`; return; }
        $(outId).innerHTML = '<div class="wo-note" style="margin-top:12px;">Reading…</div>';
        const { s, d } = await refreshEntity(entityId);
        $(outId).innerHTML = resultCard(s, 'Enrollment state', s.ok ? kv([['State', statePill(stateOf(s.data) || 'ENROLLED')], ['Registered domains', esc(d.ok ? domainsOf(d.data).join(', ') || 'none' : '—')]]) : '') + (d.request ? resultCard(d, 'Registered domains') : '');
    }

    let gDomains;
    function initGoogleDomains() {
        gDomains = makeBatch({
            input: 'wo-g-dom-input', chips: 'wo-g-dom-chips', run: 'wo-g-dom-run', retry: 'wo-g-dom-retry', clear: 'wo-g-dom-clear', sum: 'wo-g-dom-sum', results: 'wo-g-dom-results', verb: 'Register',
            ready: () => ENT_RE.test(entityVal('wo-g-dom-entity')),
            send: (host) => call('google.domain', { entity_id: entityVal('wo-g-dom-entity'), web_domain: host }),
            onDone: async () => { rememberEntity(entityVal('wo-g-dom-entity')); await showRegistered(); },
        });
        $('wo-g-dom-entity').addEventListener('input', () => { gDomains.refresh(); });
        $('wo-g-dom-entity').addEventListener('change', () => { if (ENT_RE.test(entityVal('wo-g-dom-entity'))) showRegistered(); });
    }
    async function showRegistered() {
        const e = entityVal('wo-g-dom-entity');
        if (!ENT_RE.test(e)) { $('wo-g-registered').innerHTML = '<div class="wo-note" style="margin-top:8px;">Enter an entity ID to see its registered domains.</div>'; return; }
        $('wo-g-dom-state').innerHTML = '';
        $('wo-g-registered').innerHTML = '<div class="wo-note" style="margin-top:8px;">Reading…</div>';
        const { s, d } = await refreshEntity(e);
        $('wo-g-dom-state').innerHTML = s.ok ? statePill(stateOf(s.data) || 'ENROLLED') : notEnrolled(s) ? pill('not enrolled', 'bad') : '';
        const list = domainsOf(d.data);
        $('wo-g-registered').innerHTML = d.ok ? (list.length ? `<div class="wo-chips">${list.map(x => `<span class="wo-chip">${esc(x)}</span>`).join('')}</div>` : '<div class="wo-note" style="margin-top:8px;">No domains registered yet.</div>')
            : resultCard(s.ok ? d : s, s.ok ? 'Registered domains' : 'Enrollment state');
        gDomains.refresh();
    }

    function renderEntityList() {
        const dl = $('wo-g-ent-list'); if (!dl) return;
        dl.innerHTML = gAll().filter(x => x.pid === state.sel).map(x => `<option value="${esc(x.entityId)}"></option>`).join('');
    }
    function renderMerchants() {
        const box = $('wo-g-table'); if (!box) return;
        const all = $('wo-g-all').checked, rows = gAll().filter(x => all || x.pid === state.sel);
        if (!rows.length) { box.innerHTML = '<div class="wo-note" style="margin-top:12px;">No merchants yet — enroll an entity, or look up one that is already enrolled.</div>'; return; }
        box.innerHTML = `<table class="wo-table"><tr><th>Merchant account</th><th>Entity</th><th>State</th><th>Domains</th><th>Checked</th><th></th></tr>` + rows.map(x => {
            const p = profileById(x.pid), usable = !p || !keyExpired(p);
            return `<tr><td>${esc(labelOf(p))}${p ? ' ' + pill(p.environment, p.environment === 'production' ? 'bad' : 'info') : ''}</td><td>${copyChip(x.entityId)}</td><td>${statePill(x.state)}</td>
                <td>${(x.domains || []).length ? esc(x.domains.slice(0, 3).join(', ')) + ((x.domains || []).length > 3 ? ` +${x.domains.length - 3}` : '') : '<span class="wo-note">none</span>'}</td><td>${x.checkedAt ? esc(rel(x.checkedAt)) : '—'}</td>
                <td style="white-space:nowrap;"><button type="button" class="copy-btn" data-act="refresh" data-pid="${esc(x.pid)}" data-e="${esc(x.entityId)}" ${usable ? '' : 'disabled title="secret key expired"'}>↻</button>
                <button type="button" class="copy-btn" data-act="domains" data-pid="${esc(x.pid)}" data-e="${esc(x.entityId)}">Domains</button>
                <button type="button" class="copy-btn" data-act="remove" data-pid="${esc(x.pid)}" data-e="${esc(x.entityId)}">✕</button></td></tr>`;
        }).join('') + '</table>';
    }

    // =====================================================================
    // Navigation, copy, countdowns
    // =====================================================================
    function showWallet(w) { state.wallet = w; savePrefs({ wallet: w }); $('wo-apple').hidden = w !== 'apple'; $('wo-google').hidden = w !== 'google'; document.querySelectorAll('#wo-wallet button').forEach(b => b.classList.toggle('active', b.dataset.w === w)); }
    function showApple(t) { state.at = t; savePrefs({ at: t }); ['domains', 'csr', 'cert', 'activity'].forEach(k => { $('wo-ap-' + k).hidden = k !== t; }); document.querySelectorAll('#wo-ap-tabs button').forEach(b => b.classList.toggle('active', b.dataset.at === t)); if (t === 'activity') renderActivity(); if (t === 'cert') renderCertInfo(); }
    function showGoogle(t) { state.gt = t; savePrefs({ gt: t }); ['enroll', 'domains', 'merchants'].forEach(k => { $('wo-g-' + k).hidden = k !== t; }); document.querySelectorAll('#wo-g-tabs button').forEach(b => b.classList.toggle('active', b.dataset.gt === t)); if (t === 'merchants') renderMerchants(); if (t === 'domains') { renderEntityList(); if (!entityVal('wo-g-dom-entity')) $('wo-g-dom-entity').value = entityDefaults().entityId; gDomains.refresh(); if (ENT_RE.test(entityVal('wo-g-dom-entity'))) showRegistered(); } }
    function prefill() {
        const d = entityDefaults();
        $('wo-g-entity').value = d.entityId; $('wo-g-email').value = d.email; $('wo-g-dom-entity').value = d.entityId; $('wo-g-tos').checked = false;
        $('wo-g-enroll-out').innerHTML = ''; $('wo-g-registered').innerHTML = ''; $('wo-g-dom-state').innerHTML = '';
        $('wo-ap-csr-out').innerHTML = ''; $('wo-ap-cert-out').innerHTML = '';
        renderEntityList(); renderMerchants(); renderActivity(); if (apDomains) apDomains.refresh(); if (gDomains) gDomains.refresh();
    }
    function tickCountdowns() { document.querySelectorAll('#wo-root [data-until]').forEach(el => { el.textContent = rel(parseInt(el.dataset.until, 10)); }); }

    async function loadConfig() {
        try { const r = await fetch(`${API}/wallet-onboarding/config`); state.cfg = r.ok ? await r.json() : null; } catch (e) { state.cfg = null; }
        if (!state.cfg) $('wo-prof-info').innerHTML = '<span style="color:var(--error);">Could not reach the onboarding service — is the latest backend deployed?</span>';
        else renderProfileBar();
    }
    async function selectProfile(id) { state.sel = id; savePrefs({ selected: id }); renderProfileBar(); prefill(); }

    function init() {
        if (!$('wo-root')) return;
        const p = prefs(); state.sel = p.selected || 'default'; state.wallet = p.wallet || 'apple'; state.at = p.at || 'domains'; state.gt = p.gt || 'enroll';
        initAppleDomains(); initGoogleDomains();
        renderProfileBar();
        $('wo-profile').addEventListener('change', (e) => selectProfile(e.target.value));
        $('wo-prof-new').addEventListener('click', async () => { const n = await openProfileEditor(null); if (n) { saveProfiles([...profiles(), n]); await selectProfile(n.id); toast('Merchant saved'); } });
        $('wo-prof-edit').addEventListener('click', async () => { const c = current(); if (!c) return; const n = await openProfileEditor(c); if (n) { saveProfiles(profiles().map(x => (x.id === n.id ? n : x))); renderProfileBar(); prefill(); toast('Merchant updated'); } });
        $('wo-prof-del').addEventListener('click', async () => {
            const c = current(); if (!c) return;
            if (!(await confirmDialog({ title: `Remove ${c.label}?`, text: 'Its sealed secret key, saved entities and activity are forgotten in this browser. Nothing is changed at Checkout.com.', confirmLabel: 'Remove', danger: true }))) return;
            saveProfiles(profiles().filter(x => x.id !== c.id)); gSave(gAll().filter(x => x.pid !== c.id)); Store.setJSON(K.apple, appleLog().filter(x => x.pid !== c.id)); await selectProfile('default');
        });
        document.querySelectorAll('#wo-wallet button').forEach(b => b.addEventListener('click', () => showWallet(b.dataset.w)));
        document.querySelectorAll('#wo-ap-tabs button').forEach(b => b.addEventListener('click', () => showApple(b.dataset.at)));
        document.querySelectorAll('#wo-g-tabs button').forEach(b => b.addEventListener('click', () => showGoogle(b.dataset.gt)));

        $('wo-ap-csr-run').addEventListener('click', generateCsr);
        $('wo-ap-cert-run').addEventListener('click', uploadCert);
        $('wo-ap-cert-mid').addEventListener('input', renderCertInfo);
        $('wo-ap-drop').addEventListener('click', () => $('wo-ap-cert-file').click());
        $('wo-ap-cert-file').addEventListener('change', (e) => readCertFile(e.target.files[0]));
        ['dragover', 'dragenter'].forEach(ev => $('wo-ap-drop').addEventListener(ev, (e) => { e.preventDefault(); $('wo-ap-drop').classList.add('over'); }));
        ['dragleave', 'drop'].forEach(ev => $('wo-ap-drop').addEventListener(ev, (e) => { e.preventDefault(); $('wo-ap-drop').classList.remove('over'); if (ev === 'drop') readCertFile(e.dataTransfer.files[0]); }));
        let pasteTimer; $('wo-ap-cert-paste').addEventListener('input', () => { clearTimeout(pasteTimer); pasteTimer = setTimeout(() => { const v = val('wo-ap-cert-paste').trim(); if (v.length > 100) inspectCert(v); }, 400); });
        $('wo-ap-act-clear').addEventListener('click', async () => { if (await confirmDialog({ title: 'Clear the Apple Pay activity?', text: 'Only the list in this browser is removed.', confirmLabel: 'Clear', danger: true })) { Store.setJSON(K.apple, appleLog().filter(x => x.pid !== state.sel)); renderActivity(); } });
        $('wo-ap-act-export').addEventListener('click', () => downloadText('apple-pay-onboarding-activity.json', JSON.stringify(appleLog().filter(x => x.pid === state.sel), null, 2)));

        $('wo-g-enroll-run').addEventListener('click', enrollEntity);
        $('wo-g-check').addEventListener('click', () => checkStatus(entityVal('wo-g-entity'), 'wo-g-enroll-out'));
        $('wo-g-dom-refresh').addEventListener('click', showRegistered);
        $('wo-g-all').addEventListener('change', renderMerchants);
        $('wo-g-add-btn').addEventListener('click', async () => {
            const e = entityVal('wo-g-add'); if (!ENT_RE.test(e)) return toast('Enter the entity ID (ent_…)', 'error');
            $('wo-g-add-btn').disabled = true; const { s } = await refreshEntity(e); $('wo-g-add-btn').disabled = false;
            if (s.ok) { rememberEntity(e); $('wo-g-add').value = ''; toast('Added ' + e); } else toast(describe(s).text, 'error');
        });
        $('wo-g-refresh-all').addEventListener('click', async () => {
            const all = $('wo-g-all').checked, rows = gAll().filter(x => (all || x.pid === state.sel) && !keyExpired(profileById(x.pid)));
            $('wo-g-refresh-all').disabled = true;
            for (const x of rows) await refreshEntity(x.entityId, profileById(x.pid));
            $('wo-g-refresh-all').disabled = false; toast(`Refreshed ${rows.length} entit${rows.length === 1 ? 'y' : 'ies'}`);
        });
        $('wo-g-table').addEventListener('click', async (e) => {
            const b = e.target.closest('[data-act]'); if (!b) return;
            const { act, pid, e: ent } = { act: b.dataset.act, pid: b.dataset.pid, e: b.dataset.e };
            if (act === 'refresh') { b.disabled = true; await refreshEntity(ent, profileById(pid)); }
            if (act === 'remove') { gSave(gAll().filter(x => !(x.pid === pid && x.entityId === ent))); renderMerchants(); renderEntityList(); }
            if (act === 'domains') { if (pid !== state.sel) await selectProfile(pid); $('wo-g-dom-entity').value = ent; showGoogle('domains'); }
        });

        $('wo-root').addEventListener('click', (e) => {
            const c = e.target.closest('[data-copy]'); if (c) { navigator.clipboard?.writeText(c.dataset.copy); toast('Copied'); return; }
            const g = e.target.closest('[data-goto]'); if (g) { e.preventDefault(); $('wo-g-dom-entity').value = g.dataset.entity; showGoogle(g.dataset.goto); return; }
            if (e.target.id === 'wo-ap-csr-dl' && state.csr) downloadText(`${state.csr.mid || 'cko'}.csr`, state.csr.content);
            if (e.target.id === 'wo-ap-csr-copy' && state.csr) { navigator.clipboard?.writeText(state.csr.content); toast('Signing request copied'); }
            if (e.target.id === 'wo-ap-csr-next') { if (state.csr && state.csr.mid) $('wo-ap-cert-mid').value = state.csr.mid; showApple('cert'); }
        });

        showWallet(state.wallet); showApple(state.at); showGoogle(state.gt); prefill();
        setInterval(tickCountdowns, 30000);
        loadConfig();
    }
    window.refreshWalletOnboarding = () => { if ($('wo-root')) { renderProfileBar(); renderMerchants(); renderActivity(); tickCountdowns(); } };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
