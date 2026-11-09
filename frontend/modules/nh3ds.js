// =============================================
// 3DS · Non-hosted sessions (browser channel)
// A working reference for the six steps a merchant's own page runs for a Standalone (Sessions) non-hosted authentication:
//   1 create session → 2 get details → 3 issuer fingerprint (3DS Method iframe) → 4 collect channel data →
//   5 challenge (CReq posted to acs.url inside an iframe, CRes arrives as a window message) → 6 complete.
// Backend: POST /standalone/sessions, GET /standalone/session, PUT /standalone/session-issuer-fingerprint,
//          PUT /standalone/session-collect-data, POST /standalone/session-complete (OAuth, never reaches the browser).
// The issuer's challenge page is rendered by the ACS and can't be restyled; the THEMES below change the merchant-side
// container (layout, colours, loader, window size) so the experiences can be compared. Facts verified on the sandbox
// 2026-11-09: see docs/non-hosted-3ds.md.
// =============================================

(function () {
    const API_BASE = window.APP_CONFIG?.apiBaseUrl || '';
    const { $, val, esc } = window.Common;
    const PREF_KEY = 'cko-nh3ds-prefs';
    const INTERCEPTOR = 'https://api.sandbox.checkout.com/sessions-interceptor/3ds-method-notification';
    const FINAL = ['approved', 'attempted', 'declined', 'rejected', 'unavailable', 'expired', 'challenge_abandoned'];

    // Verified on the sandbox (non-hosted session → challenge → outcome), password Checkout1!. The card decides the outcome.
    const SCENARIOS = [
        { id: 'c-y', pan: '5385308360135181', group: 'Challenge', label: 'Mastercard · challenge → successful', expect: 'approved', trans: 'Y', hint: 'Challenge, then transStatus Y → session approved, eci + cryptogram issued.' },
        { id: 'c-a', pan: '5518832400606463', group: 'Challenge', label: 'Mastercard debit · challenge → attempted', expect: 'attempted', trans: 'A', hint: 'Challenge, then transStatus A → attempted (proof of attempt; you may proceed to authorisation).' },
        { id: 'c-n', pan: '4243754271700719', group: 'Challenge', label: 'Visa · challenge → not authenticated', expect: 'declined', trans: 'N', hint: 'Challenge, then transStatus N → declined.' },
        { id: 'c-r', pan: '5341034800000016', group: 'Challenge', label: 'Cartes Bancaires/Mastercard · challenge → rejected', expect: 'rejected', trans: 'R', hint: 'Challenge, then transStatus R → rejected: the issuer asks you not to attempt authorisation.' },
        { id: 'c-u', pan: '5569757734785691', group: 'Challenge', label: 'Mastercard · challenge → could not be performed', expect: 'unavailable', trans: 'U', hint: 'Challenge, then transStatus U → unavailable (technical problem at the issuer).' },
        { id: 'f-y', pan: '4485040371536584', group: 'Frictionless', label: 'Visa · frictionless → successful', expect: 'approved', trans: null, hint: 'No challenge: the issuer approves straight after the channel data. Step 5 is skipped.' },
        { id: 'custom', pan: '', group: 'Other', label: 'Custom card number…', expect: null, trans: null, hint: 'Any 3DS test card from the Checkout.com docs.' },
    ];

    // Merchant-side presentation of the challenge. size = default challengeWindowSize sent in the CReq.
    const THEMES = [
        { id: 'classic', label: 'Classic modal', layout: 'modal', skin: 'light', size: '02', desc: 'Centred card on a dimmed page.' },
        { id: 'dark', label: 'Dark glass modal', layout: 'modal', skin: 'dark', size: '03', desc: 'Dark chrome, blurred backdrop.' },
        { id: 'brand', label: 'Branded header', layout: 'modal', skin: 'brand', size: '02', desc: 'Accent header bar, trust wording.' },
        { id: 'sheet', label: 'Bottom sheet', layout: 'sheet', skin: 'light', size: '02', desc: 'Slides up — the mobile-web pattern.' },
        { id: 'drawer', label: 'Side drawer', layout: 'drawer', skin: 'light', size: '03', desc: 'Right-hand panel, page stays visible.' },
        { id: 'fullscreen', label: 'Full screen', layout: 'fullscreen', skin: 'light', size: '05', desc: 'Takeover — the safest on small screens.' },
        { id: 'inline', label: 'Inline in the page', layout: 'inline', skin: 'light', size: '04', desc: 'Embedded in the checkout, no overlay.' },
    ];
    const SIZES = { '01': { w: 250, h: 400, t: '250 × 400' }, '02': { w: 390, h: 400, t: '390 × 400' }, '03': { w: 500, h: 600, t: '500 × 600' }, '04': { w: 600, h: 400, t: '600 × 400' }, '05': { w: 0, h: 0, t: 'full screen' } };
    const TRANS = { C: 'Challenge required', Y: 'Authentication successful', N: 'Not authenticated (transaction denied)', U: 'Authentication could not be performed', A: 'Attempts processing performed', R: 'Authentication rejected by the issuer' };
    const STEPS = [
        { id: 'create', n: 1, title: 'Request a session', api: 'POST /sessions' },
        { id: 'details', n: 2, title: 'Get the session details', api: 'GET /sessions/{id}' },
        { id: 'fingerprint', n: 3, title: 'Issuer fingerprint (3DS Method)', api: 'PUT /sessions/{id}/issuer-fingerprint', tag: 'browser only' },
        { id: 'collect', n: 4, title: 'Collect the channel data', api: 'PUT /sessions/{id}/collect-data' },
        { id: 'challenge', n: 5, title: 'Handle the challenge', api: 'CReq → acs.url · CRes → window message', tag: 'browser only' },
        { id: 'complete', n: 6, title: 'Complete the session', api: 'POST /sessions/{id}/complete', tag: 'optional' },
    ];

    const st = {};                    // step id → { state, summary, req, res, ms }
    const open = new Set();           // <details> that are open ("step:req"), survive re-renders
    const S = { busy: false, run: 0, themeId: 'classic', session: null, gateResolve: null, host: null };

    // ---- helpers -----------------------------------------------------------------------------------------------------
    const prefs = () => window.Common.Store.getJSON(PREF_KEY, {});
    const savePrefs = () => window.Common.Store.setJSON(PREF_KEY, { card: val('nh-card'), pan: val('nh-pan'), amount: val('nh-amount'), currency: val('nh-currency'), indicator: val('nh-indicator'), theme: S.themeId, size: val('nh-size'), fast: $('nh-fast').checked, step: $('nh-stepmode').checked });
    const theme = (id) => THEMES.find(t => t.id === (id || S.themeId)) || THEMES[0];
    const scenario = () => SCENARIOS.find(s => s.id === val('nh-card')) || SCENARIOS[0];
    const pan = () => (scenario().id === 'custom' ? val('nh-pan') : scenario().pan).replace(/\s+/g, '');
    const sizeCode = () => val('nh-size') || theme().size;
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const b64url = (o) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const errText = (d) => (d && (d.error_codes?.join(', ') || d.error_type || (typeof d.error === 'string' ? d.error : '') || d.message)) || 'Request failed';
    const pretty = (o) => (o === undefined ? '' : esc(typeof o === 'string' ? o : JSON.stringify(o, null, 2)));

    async function call(method, path, { body, query, label } = {}) {
        const qs = query ? '?' + new URLSearchParams(query).toString() : '';
        const t0 = performance.now();
        let status = 0, env;
        try {
            const res = await fetch(`${API_BASE}/standalone/${path}${qs}`, { method, headers: { 'Content-Type': 'application/json' }, body: body !== undefined ? JSON.stringify(body) : undefined });
            status = res.status;
            env = await res.json().catch(() => ({ upstream_status: status, upstream: null, data: { error: `Non-JSON response (HTTP ${status}) — is the route /standalone/${path} deployed?` } }));
        } catch (err) { env = { upstream_status: 0, upstream: null, data: { error: 'Network error: ' + err.message } }; }
        if (env.upstream_status === undefined) env = { upstream_status: status, upstream: null, data: env };
        env.ok = env.upstream_status >= 200 && env.upstream_status < 300;
        env.ms = Math.round(performance.now() - t0);
        const up = String(env.upstream || '').match(/^([A-Z]+)\s+(https?:\/\/\S+)$/);
        if (up) addToApiLog(method, label || up[2].replace(/^https?:\/\/[^/]+/, ''), env.upstream_status, body ?? {}, env.data ?? null, up[2], { duration_ms: env.ms, ...(env.cko_request_id ? { request_id: env.cko_request_id } : {}) });
        return env;
    }

    function browserData(completion) {
        const cd = {
            channel: 'browser', accept_header: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', java_enabled: !!(navigator.javaEnabled && navigator.javaEnabled()), javascript_enabled: true,
            language: navigator.language || 'en-GB', color_depth: String(screen.colorDepth || 24), screen_height: String(screen.height || 1080), screen_width: String(screen.width || 1920),
            timezone: String(new Date().getTimezoneOffset()), user_agent: navigator.userAgent, ip_address: '203.0.113.10',   // documentation IP: the real address is only known server-side
        };
        if (completion) cd.three_ds_method_completion = completion;
        return cd;
    }

    // ---- stepper ------------------------------------------------------------------------------------------------------
    function resetSteps() { STEPS.forEach(s => { st[s.id] = { state: 'idle' }; }); renderAll(); $('nh-outcome').innerHTML = ''; }
    function set(id, patch) { st[id] = { ...st[id], ...patch }; renderStep(id); }
    const BADGE = { idle: ['', 'waiting'], running: ['info', 'running…'], wait: ['info', 'waiting for you'], ok: ['good', 'done'], skip: ['', 'skipped'], fail: ['bad', 'failed'] };
    function renderStep(id) {
        const def = STEPS.find(s => s.id === id), s = st[id] || { state: 'idle' }, el = $('nh-step-' + id);
        if (!el) return;
        el.className = 'nh-step ' + s.state;
        const [cls, txt] = BADGE[s.state] || ['', s.state];
        const det = (k, label, v) => (v === undefined ? '' : `<details data-k="${id}:${k}" ${open.has(id + ':' + k) ? 'open' : ''}><summary>${label}</summary><pre class="nh-pre">${pretty(v)}</pre></details>`);
        el.querySelector('.nh-step-main').innerHTML = `
            <div class="nh-sh"><span class="nh-n">${def.n}</span><span class="nh-st">${esc(def.title)}</span><span class="nh-api">${esc(def.api)}</span>${def.tag ? `<span class="nh-tag">${esc(def.tag)}</span>` : ''}
                <span class="nh-badge ${cls}">${txt}</span>${s.ms != null ? `<span class="nh-ms">${s.ms} ms</span>` : ''}</div>
            ${s.summary ? `<div class="nh-sum">${s.summary}</div>` : ''}${det('req', 'Request', s.req)}${det('res', 'Response', s.res)}`;
    }
    function renderAll() {
        $('nh-steps').innerHTML = STEPS.map(s => `<div class="nh-step idle" id="nh-step-${s.id}"><div class="nh-step-main"></div>${s.id === 'challenge' ? '<div class="nh-inline-host"></div>' : ''}</div>`).join('');
        STEPS.forEach(s => renderStep(s.id));
    }
    async function gate(label) {
        if (!$('nh-stepmode').checked) return;
        const b = $('nh-gate');
        b.textContent = `Continue ▶ ${label}`; b.style.display = '';
        await new Promise(r => { S.gateResolve = r; });
        b.style.display = 'none';
    }

    // ---- challenge host: the merchant-side container around the issuer's page -------------------------------------------------
    let waiter = null;
    window.addEventListener('message', (ev) => {
        if (!waiter) return;
        try { if (!/(^|\.)checkout\.com$/.test(new URL(ev.origin).hostname)) return; } catch (e) { return; }
        if (waiter.frame && ev.source !== waiter.frame.contentWindow) return;
        let d = ev.data;
        if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { return; } }
        if (!d || d.threeDSServerTransID !== waiter.tx) return;
        if (waiter.needStatus && !d.transStatus) return;
        const w = waiter; waiter = null; w.resolve(d);
    });
    const waitMessage = (tx, frame, ms, needStatus) => new Promise((resolve) => {
        const timer = setTimeout(() => { if (waiter && waiter.tx === tx) { waiter = null; resolve(null); } }, ms);
        waiter = { tx, frame, needStatus, resolve: (d) => { clearTimeout(timer); resolve(d); } };
    });
    function postForm(action, fields, target) {
        const f = document.createElement('form');
        f.method = 'POST'; f.action = action; f.target = target; f.style.display = 'none';
        Object.entries(fields).forEach(([k, v]) => { const i = document.createElement('input'); i.type = 'hidden'; i.name = k; i.value = v; f.appendChild(i); });
        document.body.appendChild(f); f.submit(); f.remove();
    }

    // Opens the themed container and returns { frame, cancelled (promise), close() }.
    function openHost(t, code, preview) {
        const sz = SIZES[code] || SIZES['02'];
        const wrap = document.createElement('div');
        const inline = t.layout === 'inline';
        wrap.className = inline ? 'nh-inline' : `nh-ov nh-${t.layout} nh-skin-${t.skin}`;
        const fixed = t.layout === 'drawer' || t.layout === 'fullscreen' || code === '05';
        const name = 'nh-challenge-' + Date.now();
        wrap.innerHTML = `<div class="nh-ch nh-skin-${t.skin}" role="dialog" aria-modal="${inline ? 'false' : 'true'}" aria-label="Card authentication">
            <div class="nh-ch-head"><span>🔒</span><b>${t.skin === 'brand' ? 'Secure payment verification' : 'Verify your payment'}</b>${preview ? '<span class="nh-badge-prev">PREVIEW</span>' : ''}<button class="nh-x" type="button" aria-label="Cancel">×</button></div>
            <div class="nh-ch-body"><div class="nh-spin"></div><iframe class="nh-frame" name="${name}" sandbox="allow-forms allow-scripts allow-same-origin" title="3-D Secure challenge" ${fixed ? '' : `style="width:${sz.w}px;height:${sz.h}px"`}></iframe></div>
            <div class="nh-ch-foot">Your bank may ask you to confirm this payment · window ${esc(sz.t)} (<code>${esc(code)}</code>)</div></div>`;
        const mount = inline ? document.querySelector('#nh-step-challenge .nh-inline-host') : document.body;
        mount.appendChild(wrap);
        const frame = wrap.querySelector('iframe'), spin = wrap.querySelector('.nh-spin');
        frame.addEventListener('load', () => { spin.style.display = 'none'; });
        if (!inline) document.body.style.overflow = 'hidden';
        let done;
        const cancelled = new Promise(r => { done = r; });
        const onKey = (e) => { if (e.key === 'Escape') done(true); };
        document.addEventListener('keydown', onKey);
        wrap.querySelector('.nh-x').addEventListener('click', () => done(true));
        wrap.querySelector('.nh-x').focus();
        const close = () => { document.removeEventListener('keydown', onKey); wrap.remove(); if (!inline) document.body.style.overflow = ''; S.host = null; };
        S.host = { close, cancel: () => done(true) };
        return { frame, name, cancelled, close };
    }

    const PREVIEW_HTML = `<!doctype html><meta charset="utf-8"><body style="margin:0;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#fff;color:#111">
        <div style="padding:24px;width:100%;max-width:340px;text-align:center"><div style="font-size:12px;color:#92400e;background:#fef3c7;border-radius:8px;padding:6px;margin-bottom:14px">Preview — a real challenge is rendered by the issuer</div>
        <div style="font-weight:700;margin-bottom:6px">3-D Secure 2 Authentication</div><div style="font-size:13px;color:#555;margin-bottom:14px">Please enter your password</div>
        <input type="password" placeholder="Hint: Checkout1!" style="width:100%;box-sizing:border-box;padding:10px;border:1px solid #ccc;border-radius:8px"><button style="margin-top:12px;width:100%;padding:10px;border:0;border-radius:8px;background:#186aff;color:#fff;font-weight:600">Continue</button></div>`;
    async function preview() {
        if (S.host) S.host.close();
        const t = theme(), h = openHost(t, sizeCode(), true);
        h.frame.srcdoc = PREVIEW_HTML;
        await h.cancelled; h.close();
    }

    // ---- the flow -----------------------------------------------------------------------------------------------------------
    function buildBody(fast) {
        const body = {
            source: { type: 'card', number: pan(), expiry_month: 12, expiry_year: 2030 },
            amount: parseInt(val('nh-amount'), 10) || 100, currency: val('nh-currency'),
            processing_channel_id: window.APP_CONFIG?.processingChannelId,
            authentication_type: 'regular', authentication_category: 'payment', challenge_indicator: val('nh-indicator'),
            transaction_type: 'goods_service', reference: 'nh3ds-' + Date.now().toString().slice(-8),
            completion: { type: 'non_hosted' },
        };
        if (fast) body.channel_data = browserData('U');
        return body;
    }

    async function run() {
        if (S.busy) return;
        if (!/^\d{12,19}$/.test(pan())) { showToast('Enter a valid card number', 'error'); return; }
        const tok = ++S.run, dead = () => tok !== S.run;
        S.busy = true; savePrefs(); resetSteps(); refreshButtons();
        const fast = $('nh-fast').checked, t = theme();
        try {
            // 1 — create
            set('create', { state: 'running' });
            const body = buildBody(fast);
            const r1 = await call('POST', 'sessions', { body });
            if (!r1.ok) { set('create', { state: 'fail', ms: r1.ms, req: body, res: r1.data, summary: `<b>${esc(errText(r1.data))}</b> (HTTP ${r1.upstream_status})` }); return; }
            let s = r1.data; S.session = s;
            set('create', { state: 'ok', ms: r1.ms, req: body, res: s, summary: `HTTP ${r1.upstream_status} · status <b>${esc(s.status)}</b> · next actions: <code>${esc((s.next_actions || []).join(', ') || 'none')}</code>` });

            // 2 — details
            if (fast) set('details', { state: 'skip', summary: 'The create response already carries the next actions.' });
            else {
                await gate('— get session details'); if (dead()) return; set('details', { state: 'running' });
                const r = await call('GET', 'session', { query: { id: s.id } });
                if (!r.ok) { set('details', { state: 'fail', ms: r.ms, res: r.data, summary: esc(errText(r.data)) }); return; }
                s = r.data; S.session = s;
                set('details', { state: 'ok', ms: r.ms, res: s, summary: `status <b>${esc(s.status)}</b> · 3DS Method URL: <b>${s._links?.three_ds_method_url ? 'present' : 'none'}</b> · protocol ${esc(s.protocol_version || '')}` });
            }

            // 3 — issuer fingerprint
            const methodUrl = s._links?.three_ds_method_url?.href;
            let completion = null;
            if (fast || !(s.next_actions || []).includes('issuer_fingerprint')) set('fingerprint', { state: 'skip', summary: fast ? 'Channel data was sent with the session, so no fingerprint is collected.' : 'The issuer asked for no fingerprint.' });
            else if (!methodUrl) { completion = 'U'; set('fingerprint', { state: 'skip', summary: 'No 3DS Method URL for this card — completion is <code>U</code> (unavailable) and no request is needed.' }); }
            else {
                await gate('— issuer fingerprint'); if (dead()) return; set('fingerprint', { state: 'running', summary: 'Posting <code>threeDSMethodData</code> to the issuer in a hidden iframe…' });
                const fp = document.createElement('iframe'); fp.name = 'nh-fp-' + Date.now(); fp.style.display = 'none'; fp.setAttribute('sandbox', 'allow-forms allow-scripts allow-same-origin'); document.body.appendChild(fp);
                const payload = { threeDSServerTransID: s.transaction_id, threeDSMethodNotificationURL: INTERCEPTOR };
                const waiting = waitMessage(s.transaction_id, fp, 10000, false);
                postForm(methodUrl, { threeDSMethodData: btoa(JSON.stringify(payload)) }, fp.name);
                const msg = await waiting; fp.remove();
                completion = msg ? 'Y' : 'N';
                const r = await call('PUT', 'session-issuer-fingerprint', { query: { id: s.id }, body: { three_ds_method_completion: completion } });
                if (!r.ok) { set('fingerprint', { state: 'fail', ms: r.ms, req: { three_ds_method_url: methodUrl, ...payload }, res: r.data, summary: esc(errText(r.data)) }); return; }
                set('fingerprint', { state: 'ok', ms: r.ms, req: { posted_to: methodUrl, threeDSMethodData: payload, completion_reported: completion }, res: r.data,
                    summary: msg ? 'The issuer answered within 10 s → <code>three_ds_method_completion: Y</code>.' : 'No answer within 10 s → <code>three_ds_method_completion: N</code> (the authentication continues without a fingerprint).' });
            }

            // 4 — collect channel data
            if (fast) set('collect', { state: 'skip', summary: 'Sent with the session in step 1.' });
            else {
                await gate('— collect channel data'); if (dead()) return; set('collect', { state: 'running' });
                const cd = browserData(null);
                const r = await call('PUT', 'session-collect-data', { query: { id: s.id }, body: cd });
                if (!r.ok) { set('collect', { state: 'fail', ms: r.ms, req: cd, res: r.data, summary: esc(errText(r.data)) }); return; }
                s = { ...s, ...r.data }; S.session = s;
                set('collect', { state: 'ok', ms: r.ms, req: cd, res: r.data, summary: `status <b>${esc(r.data.status)}</b> · next actions: <code>${esc((r.data.next_actions || []).join(', ') || 'none')}</code>` });
            }

            // 5 — challenge
            if (!(s.next_actions || []).includes('challenge_cardholder')) {
                set('challenge', { state: 'skip', summary: FINAL.includes(s.status) ? `Frictionless — the issuer decided (<b>${esc(s.status)}</b>) without challenging the cardholder.` : 'No challenge requested.' });
            } else {
                await gate('— open the challenge'); if (dead()) return;
                const code = sizeCode();
                const creq = { threeDSServerTransID: s.transaction_id, acsTransID: s.acs?.transaction_id, messageType: 'CReq', messageVersion: s.protocol_version, challengeWindowSize: code };
                const host = openHost(t, code, false);
                set('challenge', { state: 'wait', req: { acs_url: s.acs?.url, creq }, summary: `Challenge shown in the <b>${esc(t.label)}</b> theme (window ${esc(SIZES[code].t)}). Complete it — enter <code>Checkout1!</code> if asked, or cancel it to see how an abandoned challenge looks.` });
                const waiting = waitMessage(s.transaction_id, host.frame, 15 * 60 * 1000, true);
                postForm(s.acs.url, { creq: b64url(creq) }, host.name);
                const out = await Promise.race([waiting, host.cancelled.then(() => ({ cancelled: true }))]);
                waiter = null; host.close();
                if (dead()) return;
                if (out && out.cancelled) set('challenge', { state: 'fail', res: { cancelled_by_cardholder: true }, summary: '<b>The cardholder closed the challenge.</b> No CRes was received, so the session stays <code>challenged</code> until the issuer expires it — a merchant should treat this as abandoned and let the shopper retry or pick another method.' });
                else if (!out) set('challenge', { state: 'fail', summary: 'No result received within 15 minutes.' });
                else set('challenge', { state: 'ok', req: { acs_url: s.acs?.url, creq }, res: { CRes_via_postMessage: out }, summary: `CRes <code>transStatus: ${esc(out.transStatus)}</code> — ${esc(TRANS[out.transStatus] || '')}` });
                if (!out || out.cancelled) { await refreshOutcome(); return; }
            }

            // final state of the session
            let g = null;
            for (let i = 0; i < 4; i++) {
                const r = await call('GET', 'session', { query: { id: s.id } });
                if (r.ok) { g = r.data; S.session = g; if (FINAL.includes(g.status)) break; }
                await sleep(1000);
            }
            if (!g) { set('complete', { state: 'fail', summary: 'Could not read the final session.' }); return; }

            // 6 — complete
            if (!FINAL.includes(g.status)) set('complete', { state: 'skip', summary: `Session is <code>${esc(g.status)}</code> — not final yet.` });
            else {
                await gate('— complete the session'); if (dead()) return; set('complete', { state: 'running' });
                const r = await call('POST', 'session-complete', { query: { id: s.id }, body: {} });
                set('complete', { state: r.ok ? 'ok' : 'fail', ms: r.ms, res: r.data ?? { http: r.upstream_status },
                    summary: r.ok ? `HTTP ${r.upstream_status} — Checkout.com would now POST the outcome to your <code>completion.callback_url</code> (none set here).` : esc(errText(r.data)) });
            }
            renderOutcome(g);
        } catch (e) {
            showToast('3DS flow error: ' + e.message, 'error');
        } finally {
            if (S.host) S.host.close();
            if (!dead()) { S.busy = false; $('nh-gate').style.display = 'none'; refreshButtons(); }
        }
    }

    async function refreshOutcome() {
        if (!S.session) return;
        const r = await call('GET', 'session', { query: { id: S.session.id } });
        if (r.ok) renderOutcome(r.data);
    }

    function renderOutcome(s) {
        const sc = scenario(), good = ['approved', 'attempted'].includes(s.status), warn = ['challenged', 'challenge_abandoned', 'unavailable', 'expired'].includes(s.status);
        const cls = good ? 'good' : warn ? 'warn' : 'bad';
        const match = sc.expect ? (s.status === sc.expect ? `<span class="nh-badge good">as expected for this card</span>` : `<span class="nh-badge warn">expected ${esc(sc.expect)}</span>`) : '';
        const rows = [['status', s.status], ['response_code', s.response_code ? `${s.response_code} — ${TRANS[s.response_code] || ''}` : ''], ['challenged', String(!!s.challenged)], ['flow_type', s.flow_type], ['eci', s.eci], ['cryptogram', s.cryptogram],
            ['protocol_version', s.protocol_version], ['scheme', s.scheme], ['exemption', s.exemption ? `requested ${s.exemption.requested} · applied ${s.exemption.applied}` : '']].filter(r => r[1]);
        const next = good ? `Authorise the payment with <code>3ds.authentication_id: "${esc(s.id)}"</code> (or the eci / cryptogram above) in <code>POST /payments</code>.`
            : s.status === 'rejected' ? 'The issuer rejected the authentication — do <b>not</b> attempt authorisation.'
            : 'Do not treat this as authenticated. Offer another payment method or let the shopper retry.';
        const nextTheme = THEMES[(THEMES.findIndex(t => t.id === S.themeId) + 1) % THEMES.length];
        $('nh-outcome').innerHTML = `<div class="nh-final ${cls}"><div class="t">Authentication ${esc(s.status)} ${match}</div><div class="d">${next}</div>
            <table class="nh-table">${rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td><code>${esc(v)}</code></td></tr>`).join('')}</table>
            <div class="nh-actions"><button class="copy-btn" id="nh-replay" type="button">↻ Run again in “${esc(nextTheme.label)}”</button><button class="copy-btn" id="nh-again" type="button">↻ Run again, same theme</button></div></div>`;
        $('nh-replay').addEventListener('click', () => { selectTheme(nextTheme.id); run(); });
        $('nh-again').addEventListener('click', run);
    }

    // ---- UI wiring -----------------------------------------------------------------------------------------------------------
    function refreshButtons() { $('nh-run').disabled = S.busy; $('nh-run').textContent = S.busy ? 'Running…' : '▶ Run the flow'; }
    function selectTheme(id) {
        S.themeId = id;
        document.querySelectorAll('#nh-themes .nh-theme').forEach(e => e.classList.toggle('on', e.dataset.theme === id));
        $('nh-size').innerHTML = `<option value="">Theme default (${esc(SIZES[theme().size].t)})</option>` + Object.entries(SIZES).map(([k, v]) => `<option value="${k}">${k} — ${esc(v.t)}</option>`).join('');
        savePrefs();
    }
    function syncCard() {
        const sc = scenario();
        $('nh-custom-wrap').style.display = sc.id === 'custom' ? '' : 'none';
        $('nh-card-hint').innerHTML = `${sc.pan ? `<code>${esc(sc.pan)}</code> · ` : ''}${esc(sc.hint)}`;
    }
    function init() {
        if (!$('nh-root')) return;
        const p = prefs();
        $('nh-card').innerHTML = ['Challenge', 'Frictionless', 'Other'].map(g => `<optgroup label="${g}">${SCENARIOS.filter(s => s.group === g).map(s => `<option value="${s.id}">${esc(s.label)}</option>`).join('')}</optgroup>`).join('');
        $('nh-themes').innerHTML = THEMES.map(t => `<div class="nh-theme" data-theme="${t.id}" tabindex="0" role="button"><div class="nh-mini ${t.layout} ${t.skin}"><i></i></div><div class="t">${esc(t.label)}</div><div class="d">${esc(t.desc)}</div></div>`).join('');
        if (p.card && SCENARIOS.some(s => s.id === p.card)) $('nh-card').value = p.card;
        ['pan', 'amount', 'currency', 'indicator'].forEach(k => { if (p[k]) $('nh-' + k).value = p[k]; });
        $('nh-fast').checked = !!p.fast; $('nh-stepmode').checked = !!p.step;
        selectTheme(THEMES.some(t => t.id === p.theme) ? p.theme : 'classic');
        if (p.size) $('nh-size').value = p.size;
        syncCard(); resetSteps(); refreshButtons();
        $('nh-card').addEventListener('change', () => { syncCard(); savePrefs(); });
        ['nh-pan', 'nh-amount', 'nh-currency', 'nh-indicator', 'nh-size', 'nh-fast', 'nh-stepmode'].forEach(id => $(id).addEventListener('change', savePrefs));
        $('nh-themes').addEventListener('click', (e) => { const t = e.target.closest('.nh-theme'); if (t) selectTheme(t.dataset.theme); });
        $('nh-themes').addEventListener('keydown', (e) => { const t = e.target.closest('.nh-theme'); if (t && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); selectTheme(t.dataset.theme); } });
        $('nh-preview').addEventListener('click', preview);
        $('nh-run').addEventListener('click', run);
        $('nh-reset').addEventListener('click', () => { S.run++; waiter = null; if (S.host) S.host.cancel(); S.busy = false; if (S.gateResolve) { const r = S.gateResolve; S.gateResolve = null; r(); } $('nh-gate').style.display = 'none'; resetSteps(); refreshButtons(); });
        $('nh-gate').addEventListener('click', () => { if (S.gateResolve) { const r = S.gateResolve; S.gateResolve = null; r(); } });
        $('nh-steps').addEventListener('toggle', (e) => { const k = e.target.dataset && e.target.dataset.k; if (k) { if (e.target.open) open.add(k); else open.delete(k); } }, true);
    }
    init();
})();
