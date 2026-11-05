// =============================================
// Smart Dunning
// Handles: create a merchant-initiated payment with a retry schedule (retry.dunning / retry.downtime), then follow it to
//          its final state — API response, every webhook (payment_declined / payment_retry_scheduled / payment_approved /
//          payment_canceled …) and every authorization attempt — and cancel the schedule on demand.
// Backend: POST /payments (forwards `retry`), POST /standalone/vault (allowlisted: GET payment + actions, POST
//          /payments/{id}/cancellations) and the non-consuming GET /standalone/webhook-events buffer. No new routes.
// Facts from the docs (not guessed): sandbox simulation needs retry.dunning + processing.pan_preference "fpan" and
// performs three retries 30 s apart; the two Visa cards below choose the outcome; retries stop on a hard decline,
// recommendation code 03, or a response code that is not eligible; max_attempts 1–15, end_after_days 1–60.
// =============================================

(function () {
    const API_BASE = window.APP_CONFIG?.apiBaseUrl || '';
    const { $, val, esc } = window.Common;
    const RUNS_KEY = 'cko-dunning-runs';

    // ---- Test data ------------------------------------------------------------------------------------------------
    // kind: sim = documented sandbox retry-schedule cards · soft = soft decline eligible for retries · hard = not eligible
    const CARDS = [
        { n: '4658587554931538', scheme: 'Visa', cc: '—', code: '', kind: 'sim', note: 'Retries end with an APPROVED payment (documented simulation)' },
        { n: '4795395028309255', scheme: 'Visa', cc: '—', code: '', kind: 'sim', note: 'Retries end with a DECLINED payment (documented simulation)' },
        { n: '4544249167673670', scheme: 'Visa', cc: 'GB', code: '20051', kind: 'soft', note: 'Insufficient funds' },
        { n: '4242424242424242', scheme: 'Visa', cc: 'GB', code: '20051', kind: 'soft', note: 'Insufficient funds — only with amount 101', amount: 101 },
        { n: '4539467987109256', scheme: 'Visa', cc: 'ES', code: '20005', kind: 'soft', note: 'Do not honour' },
        { n: '4024007181869214', scheme: 'Visa', cc: 'US', code: '20005', kind: 'soft', note: 'Do not honour' },
        { n: '4916301720257093', scheme: 'Visa', cc: 'US', code: '20020', kind: 'soft', note: 'Invalid response' },
        { n: '4095254802642505', scheme: 'Visa (debit)', cc: 'US', code: '20068', kind: 'soft', note: 'Timeout / internal error' },
        { n: '4485381577182090', scheme: 'Visa', cc: 'US', code: '20014', kind: 'soft', note: 'Invalid account number' },
        { n: '4556294593757189', scheme: 'Visa', cc: 'UY', code: '20061', kind: 'soft', note: 'Activity amount limit exceeded' },
        { n: '4532819413487978', scheme: 'Visa', cc: 'US', code: '20078', kind: 'soft', note: 'Blocked at first use' },
        { n: '4151512736305999', scheme: 'Visa', cc: 'GB', code: '20057', kind: 'soft', note: 'Transaction not permitted to cardholder (non-AFT)' },
        { n: '5437821135399682', scheme: 'Mastercard', cc: 'TW', code: '20051', kind: 'soft', note: 'Insufficient funds' },
        { n: '5585076576791786', scheme: 'Mastercard', cc: 'HU', code: '20005', kind: 'soft', note: 'Do not honour' },
        { n: '5265162270587964', scheme: 'Mastercard', cc: 'US', code: '20068', kind: 'soft', note: 'Timeout / internal error' },
        { n: '5510696303117987', scheme: 'Mastercard', cc: '—', code: '20030', kind: 'soft', note: 'Format error' },
        { n: '5420951756276171', scheme: 'Mastercard', cc: 'TN', code: '20061', kind: 'soft', note: 'Activity amount limit exceeded' },
        { n: '4897453568485113', scheme: 'Visa', cc: 'US', code: '20059', kind: 'hard', note: 'Suspected fraud — not eligible, no retry' },
        { n: '4818924250131070', scheme: 'Visa', cc: 'GB', code: '20062', kind: 'hard', note: 'Restricted card — not eligible, no retry' },
        { n: '4024007103573027', scheme: 'Visa', cc: 'US', code: '20012', kind: 'hard', note: 'Invalid transaction — not eligible, no retry' },
        { n: '4941202060999329', scheme: 'Visa', cc: 'GB', code: '30041', kind: 'hard', note: 'Lost card — not eligible, no retry' },
        { n: '4745820750643143', scheme: 'Visa', cc: 'GB', code: '30043', kind: 'hard', note: 'Stolen card — not eligible, no retry' },
        { n: '5279988405398834', scheme: 'Mastercard', cc: 'JP', code: '20062', kind: 'hard', note: 'Restricted card — not eligible, no retry' },
    ];
    const KIND_LABEL = { sim: 'Retry simulation', soft: 'Soft decline (retried)', hard: 'Hard decline (not retried)' };
    const KIND_EXPECT = {
        sim: 'Documented: three retries 30 s apart, then the outcome shown',
        soft: 'Eligible code → schedule expected on a real account; sandbox behaviour with this card is not documented',
        hard: 'Not eligible → declined, no retry scheduled (expected)',
    };

    const SCENARIOS = [
        { id: 'recover', title: 'Recovered on a retry', card: '4658587554931538', max: 3, days: 1,
          desc: 'The MIT soft-declines, then a retry is approved.',
          expect: 'Expect: payment_declined → payment_retry_scheduled (after each failed retry) → payment_approved. Final state: Authorized (or Captured).' },
        { id: 'exhaust', title: 'Retries exhausted', card: '4795395028309255', max: 3, days: 1,
          desc: 'Every retry fails and the schedule ends.',
          expect: 'Expect: payment_declined → payment_retry_scheduled … → final payment_declined. Final state: Declined after all retries.' },
        { id: 'cancel', title: 'Cancel the schedule midway', card: '4795395028309255', max: 3, days: 1,
          desc: 'Same path, but you stop it while a retry is pending.',
          expect: 'While the status is “Retry Scheduled”, press “Cancel retry schedule”. Expect no further attempts and a canceled final state (event name for the cancel is observed, not documented).' },
        { id: 'hard', title: 'Hard decline — no retry', card: '4897453568485113',
          desc: 'A code that is not eligible for Smart Dunning.',
          expect: 'Expect: Declined on the first attempt (20059), no payment_retry_scheduled, no retries. Not verified in the sandbox.' },
        { id: 'custom', title: 'Pick any test card', card: null,
          desc: 'Choose a card from the table below.', expect: 'Load a card from “Test cards”, then run.' },
    ];

    const state = { scenario: null, payId: null, first: null, pay: null, actions: [], events: [], lastSeq: 0, timer: null, tick: 0, startedAt: 0, endedAt: 0, cardFilter: 'all', busy: false };

    // ---- HTTP (same allowlisted proxy as the Payments tab; only the Checkout.com exchange is logged) ------------------
    async function pcall(method, path, body) {
        const t0 = performance.now();
        let status = 0, env;
        try {
            const res = await fetch(`${API_BASE}/standalone/vault`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ method, path, ...(body !== undefined ? { body } : {}) }),
            });
            status = res.status;
            env = await res.json().catch(() => ({ upstream_status: status, data: { error: `Non-JSON response (HTTP ${status})` } }));
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
    const errText = (d) => (d && (d.error_codes?.join(', ') || d.error_type || (typeof d.error === 'string' ? d.error : d.error?.error_codes?.join(', ') || d.error?.error_type) || d.message)) || 'Request failed';

    // ---- Form → request ---------------------------------------------------------------------------------------------
    const digits = () => val('sd-card').replace(/\D/g, '');
    const num = (id, d) => { const n = parseInt(val(id), 10); return Number.isFinite(n) ? n : d; };
    const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
    const fmtCard = (n) => n.replace(/(\d{4})(?=\d)/g, '$1 ');

    function buildBody() {
        const dunning = $('sd-dunning').checked, downtime = $('sd-downtime').checked;
        const body = {
            source: { type: 'card', number: digits(), expiry_month: num('sd-exp-m', 12), expiry_year: num('sd-exp-y', new Date().getFullYear() + 3), cvv: val('sd-cvv') || '100', name: 'Smart Dunning Test', stored: true },
            amount: num('sd-amount', 0),
            currency: val('sd-currency'),
            reference: val('sd-ref') || `DUN-${Date.now()}`,
            payment_type: val('sd-ptype'),
            merchant_initiated: true,
            capture: $('sd-capture').checked,
            '3ds': { enabled: false },
            processing_channel_id: window.APP_CONFIG?.processingChannelId,
        };
        const prev = val('sd-prev').trim();
        if (prev) body.previous_payment_id = prev;
        if (dunning || downtime) {
            body.retry = { enabled: true };
            if (dunning) body.retry.dunning = { enabled: true, max_attempts: clamp(num('sd-max', 6), 1, 15), end_after_days: clamp(num('sd-days', 30), 1, 60) };
            if (downtime) body.retry.downtime = { enabled: true };
        }
        if ($('sd-fpan').checked) body.processing = { pan_preference: 'fpan' };
        return body;
    }

    function renderConfig() {
        const dunning = $('sd-dunning').checked, downtime = $('sd-downtime').checked;
        const max = clamp(num('sd-max', 6), 1, 15), days = clamp(num('sd-days', 30), 1, 60);
        let t;
        if (!dunning && !downtime) t = '<b>Retries are off</b> — a soft decline is final; no schedule is created.';
        else {
            const parts = [];
            if (dunning) parts.push(`<b>Smart Dunning</b>: up to <b>${max}</b> retr${max === 1 ? 'y' : 'ies'} within <b>${days}</b> day${days === 1 ? '' : 's'} of the first attempt, timed by Checkout.com (not at fixed intervals)`);
            if (downtime) parts.push('<b>Downtime retries</b>: retried when an issuer or acquirer is unavailable');
            t = parts.join('<br>');
        }
        if ($('sd-fpan').checked && dunning) t += '<br><span class="sd-note">Sandbox simulation: three retries, 30 seconds apart, whatever the numbers above say. Use the two documented cards to choose how it ends.</span>';
        $('sd-sched').innerHTML = t;
        $('sd-preview').textContent = JSON.stringify(buildBody(), null, 2);
    }

    // ---- Scenarios & cards ---------------------------------------------------------------------------------------------
    function renderScenarios() {
        $('sd-scenarios').innerHTML = SCENARIOS.map(s => `<button type="button" data-sc="${s.id}" class="${state.scenario === s.id ? 'active' : ''}"><b>${esc(s.title)}</b><span>${esc(s.desc)}</span></button>`).join('');
        const s = SCENARIOS.find(x => x.id === state.scenario);
        $('sd-scn-note').textContent = s ? s.expect : 'Pick a scenario to preload a card and the expected behaviour — or configure everything by hand below.';
    }
    function setCard(c) {
        $('sd-card').value = fmtCard(c.n);
        if (c.amount) $('sd-amount').value = c.amount;
        renderConfig();
    }
    function applyScenario(id) {
        const s = SCENARIOS.find(x => x.id === id); if (!s) return;
        state.scenario = id;
        if (s.card) setCard(CARDS.find(c => c.n === s.card) || { n: s.card });
        if (s.max) { $('sd-max').value = s.max; $('sd-max-r').value = s.max; }
        if (s.days) { $('sd-days').value = s.days; $('sd-days-r').value = s.days; }
        $('sd-dunning').checked = true; $('sd-fpan').checked = s.id !== 'hard' ? true : $('sd-fpan').checked;
        renderScenarios(); renderConfig();
    }
    function renderCards() {
        const f = state.cardFilter;
        $('sd-card-filter').innerHTML = [['all', 'All'], ['sim', 'Retry simulation'], ['soft', 'Soft declines'], ['hard', 'Hard declines']]
            .map(([k, l]) => `<button type="button" data-f="${k}" class="${f === k ? 'active' : ''}">${l}</button>`).join('');
        const rows = CARDS.filter(c => f === 'all' || c.kind === f);
        $('sd-card-table').innerHTML = `<tr><th>Card</th><th>Scheme</th><th>Code</th><th>Behaviour</th><th></th></tr>` + rows.map(c => `<tr>
            <td><code>${fmtCard(c.n)}</code></td><td>${esc(c.scheme)}${c.cc && c.cc !== '—' ? ' · ' + esc(c.cc) : ''}</td><td>${esc(c.code || '—')}</td>
            <td><b>${KIND_LABEL[c.kind]}</b><br><span class="sd-note">${esc(c.note)}.<br>${esc(KIND_EXPECT[c.kind])}</span></td>
            <td style="white-space:nowrap;"><button type="button" class="copy-btn" data-load="${c.n}">Load</button> <button type="button" class="copy-btn" data-copy="${c.n}">Copy</button></td></tr>`).join('');
    }

    // ---- Run ----------------------------------------------------------------------------------------------------------
    function showError(msg) { const el = $('sd-error'); el.textContent = msg || ''; el.style.display = msg ? 'block' : 'none'; }

    async function run() {
        if (state.busy) return;
        showError('');
        const body = buildBody();
        if (digits().length < 13) return showError('Enter a card number (13–19 digits) or load one from the test cards.');
        if (!(body.amount > 0)) return showError('Amount must be greater than 0.');
        if (!body.currency) return showError('Choose a currency.');
        state.busy = true; $('sd-run').disabled = true; $('sd-run').textContent = 'Running…';
        stopWatch();
        try {
            const res = await fetch(`${API_BASE}/payments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            const data = await res.json().catch(() => ({ error: `Non-JSON response (HTTP ${res.status})` }));
            await addToApiLog('POST', 'MIT with Smart Dunning - /payments', res.status, body, data, 'https://api.sandbox.checkout.com/payments');
            const pay = data.payment || data;
            if (!pay || !pay.id) return showError(`Checkout.com rejected the request: ${errText(data)}`);
            Object.assign(state, { payId: pay.id, first: pay, pay, actions: [], events: [], lastSeq: 0 });
            saveRun();
            startWatch();
        } catch (err) {
            showError('Request failed: ' + err.message);
        } finally {
            state.busy = false; $('sd-run').disabled = false; $('sd-run').textContent = 'Run MIT with Smart Dunning';
        }
    }

    async function createInitial() {
        showError('');
        const btn = $('sd-initial'); btn.disabled = true;
        const body = {
            source: { type: 'card', number: '4242424242424242', expiry_month: 12, expiry_year: new Date().getFullYear() + 3, cvv: '100', name: 'Smart Dunning Test', stored: true },
            amount: num('sd-amount', 1000), currency: val('sd-currency'), reference: `DUN-INIT-${Date.now()}`, payment_type: 'Recurring', capture: true,
            '3ds': { enabled: false }, processing_channel_id: window.APP_CONFIG?.processingChannelId,
        };
        try {
            const res = await fetch(`${API_BASE}/payments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            const data = await res.json().catch(() => ({}));
            await addToApiLog('POST', 'initial customer-present payment - /payments', res.status, body, data, 'https://api.sandbox.checkout.com/payments');
            const pay = data.payment || data;
            if (pay && pay.id && pay.approved !== false) { $('sd-prev').value = pay.id; renderConfig(); showToast(`Initial payment ${pay.id} created`); }
            else showError(`Initial payment failed: ${errText(data)}`);
        } catch (err) { showError('Request failed: ' + err.message); }
        finally { btn.disabled = false; }
    }

    // ---- Watching -----------------------------------------------------------------------------------------------------
    function stopWatch() { if (state.timer) { clearInterval(state.timer); state.timer = null; } renderRun(); }
    function startWatch() {
        if (state.timer) clearInterval(state.timer);
        state.startedAt = Date.now(); state.endedAt = 0; state.tick = 0;
        renderRun();
        refreshPayment().then(renderRun);
        state.timer = setInterval(tick, 3000);
    }
    async function pollEvents() {
        try {
            const res = await fetch(`${API_BASE}/standalone/webhook-events?match=${encodeURIComponent(state.payId)}&since=${state.lastSeq}`);
            const j = await res.json();
            const fresh = res.ok ? (j.events || []) : [];
            fresh.forEach(e => { state.lastSeq = Math.max(state.lastSeq, e.seq || 0); });
            if (fresh.length) {
                state.events.push(...fresh);
                showToast(`Webhook: ${fresh.map(e => e.type).join(', ')}`);
                fresh.forEach(e => addToApiLog('WEBHOOK', `${e.type} — /webhook`, 200, {}, { id: e.event_id, type: e.type, created_on: e.created_on, data: e.data }));
            }
            return fresh.length > 0;
        } catch (e) { return false; }
    }
    async function refreshPayment() {
        if (!state.payId) return;
        const [d, a] = await Promise.all([pcall('GET', `/payments/${encodeURIComponent(state.payId)}`), pcall('GET', `/payments/${encodeURIComponent(state.payId)}/actions`)]);
        if (d.ok && d.data) state.pay = d.data;
        if (a.ok && Array.isArray(a.data)) state.actions = a.data;
        updateRun();
    }
    async function tick() {
        state.tick++;
        const got = await pollEvents();
        if (got || state.tick % 4 === 0) await refreshPayment();
        const fin = finalInfo();
        if (fin && !fin.inProgress && !state.endedAt) state.endedAt = Date.now();
        if ((state.endedAt && Date.now() - state.endedAt > 20000) || Date.now() - state.startedAt > 6 * 60 * 1000) stopWatch();
        renderRun();
    }

    async function cancelSchedule() {
        if (!state.payId) return;
        const btn = $('sd-cancel'); btn.disabled = true;
        const env = await pcall('POST', `/payments/${encodeURIComponent(state.payId)}/cancellations`, {});
        if (env.ok) showToast('Retry schedule cancel requested'); else showToast(`Cancel failed: ${errText(env.data)}`, 'error');
        await refreshPayment(); await pollEvents(); renderRun();
        if (!state.timer) startWatch();
    }

    // ---- Interpretation -----------------------------------------------------------------------------------------------
    const auths = () => state.actions.filter(a => a.type === 'Authorization').sort((a, b) => new Date(a.processed_on) - new Date(b.processed_on));
    function finalInfo() {
        const p = state.pay; if (!p) return null;
        const st = String(p.status || '');
        const a = auths();
        const retries = Math.max(0, a.length - 1);
        const last = a[a.length - 1] || {};
        const code = last.response_code || p.response_code || '';
        const sum = last.response_summary || p.response_summary || '';
        const max = p.retry?.max_attempts;
        if (/retry/i.test(st)) return { inProgress: true, tone: 'warn', title: 'Retry schedule in progress', status: st,
            text: `${a.length || 1} attempt${(a.length || 1) === 1 ? '' : 's'} so far (${retries} retr${retries === 1 ? 'y' : 'ies'}), last response ${code} ${sum}.${p.retry?.next_attempt_on ? ` Next attempt ${fmtTime(p.retry.next_attempt_on)}.` : ''}${max ? ` Up to ${max} attempts.` : ''}` };
        if (/^(authorized|captured|paid|approved|card verified)$/i.test(st))
            return { tone: 'good', title: retries ? `Recovered on retry ${retries}` : 'Approved on the first attempt', status: st,
                text: retries ? `The MIT was declined, then approved on retry ${retries}. Final status: ${st}. Every attempt shared the same payment id (${p.id}).` : 'The first attempt was approved, so no retry was needed.' };
        if (/cancel|void/i.test(st)) return { tone: 'warn', title: 'Schedule canceled', status: st, text: `The retry schedule was canceled after ${a.length || 1} attempt${(a.length || 1) === 1 ? '' : 's'}. Last response ${code} ${sum}.` };
        if (/declin/i.test(st)) return { tone: 'bad', title: retries ? `Retries exhausted — declined after ${retries} retr${retries === 1 ? 'y' : 'ies'}` : 'Declined — no retry was scheduled', status: st,
            text: retries ? `Every retry failed. Final response ${code} ${sum}.` : `Declined on the first attempt (${code} ${sum}). Either the code is not eligible for Smart Dunning (hard decline / recommendation 03) or retries were off.` };
        return { tone: '', title: st || 'Unknown', status: st, text: '' };
    }

    // ---- Rendering ----------------------------------------------------------------------------------------------------
    const fmtTime = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleTimeString([], { hour12: false }) + (Date.now() - d > 864e5 || d - Date.now() > 864e5 ? ' ' + d.toLocaleDateString() : ''); };
    const tone = (s) => /approved|authorized|captured|paid/i.test(s) ? 'good' : /declin|cancel|void|fail/i.test(s) ? 'bad' : /retry|pending/i.test(s) ? 'warn' : 'info';
    const chip = (v) => v ? `<span class="pe-chip" data-sd-copy="${esc(v)}" title="Click to copy" style="cursor:pointer;">${esc(v)}</span>` : '';

    function timelineItems() {
        const items = [];
        const f = state.first;
        if (f) items.push({ at: f.processed_on || f.created_on, src: 'API', tone: tone(f.status), title: `POST /payments → ${f.status || ''}${f.response_code ? ` · ${f.response_code} ${f.response_summary || ''}` : ''}`,
            text: f.retry ? `Retry schedule returned: up to ${f.retry.max_attempts ?? '?'} attempts${f.retry.next_attempt_on ? `, next ${fmtTime(f.retry.next_attempt_on)}` : ''}${f.retry.ends_on ? `, ends ${fmtTime(f.retry.ends_on)}` : ''}.` : (f.approved === false ? 'No retry object in the response.' : 'Approved.'), raw: f });
        state.events.forEach(e => {
            const d = e.data || {}, r = d.retry;
            items.push({ at: e.created_on || e.received_at, src: 'Webhook', tone: tone(e.type), title: e.type,
                text: [d.response_code ? `${d.response_code} ${d.response_summary || ''}` : '', r ? `attempts made ${r.attempts_made ?? '?'} / max ${r.max_attempts ?? '?'}${r.next_attempt_on ? ` · next ${fmtTime(r.next_attempt_on)}` : ''}${r.ends_on ? ` · ends ${fmtTime(r.ends_on)}` : ''}` : ''].filter(Boolean).join(' — '), raw: { id: e.event_id, type: e.type, created_on: e.created_on, data: d } });
        });
        state.actions.forEach(a => items.push({ at: a.processed_on, src: 'Action', tone: a.approved === false ? 'bad' : a.approved ? 'good' : 'info', title: `${a.type}${a.approved === false ? ' · declined' : a.approved ? ' · approved' : ''}`,
            text: `${a.response_code || ''} ${a.response_summary || ''}`.trim() + (a.id ? ` — ${a.id}` : ''), raw: a }));
        return items.filter(i => i.at).sort((x, y) => new Date(x.at) - new Date(y.at));
    }

    function updateRun() { renderRun(); }
    function renderRun() {
        const card = $('sd-run-card');
        if (!state.payId) { card.style.display = 'none'; return; }
        card.style.display = '';
        $('sd-pay-chip').innerHTML = chip(state.payId);
        const fin = finalInfo();
        const st = $('sd-status'); st.textContent = (state.pay && state.pay.status) || '—'; st.className = 'sd-badge ' + (fin ? (fin.tone === 'warn' ? 'warn' : fin.tone) : '');
        $('sd-cancel').disabled = !(fin && fin.inProgress);
        $('sd-stop').disabled = !state.timer;
        const secs = Math.round((Date.now() - state.startedAt) / 1000);
        $('sd-watch').textContent = state.timer
            ? `Watching… ${secs}s · ${state.events.length} webhook${state.events.length === 1 ? '' : 's'} received${secs > 45 && !state.events.length ? ' — none yet: check that a workflow sends these events to this app (Webhooks tab).' : ''}`
            : `Not watching (${state.events.length} webhook${state.events.length === 1 ? '' : 's'} captured). Use Refresh to look again.`;
        $('sd-final').innerHTML = fin ? `<div class="sd-final ${fin.tone}"><div class="t">${esc(fin.title)} ${fin.status ? `<span class="sd-badge ${fin.tone === 'warn' ? 'warn' : fin.tone}" style="margin-left:6px;">${esc(fin.status)}</span>` : ''}</div><div class="d">${esc(fin.text)}</div></div>` : '';
        const a = auths();
        $('sd-attempts').innerHTML = a.length
            ? `<tr><th>#</th><th>When</th><th>Result</th><th>Response</th><th></th></tr>` + a.map((x, i) => `<tr><td>${i}</td><td>${esc(fmtTime(x.processed_on))}</td>
                <td><span class="sd-badge ${x.approved ? 'good' : 'bad'}">${x.approved ? 'Approved' : 'Declined'}</span></td><td>${esc(x.response_code || '')} ${esc(x.response_summary || '')}</td>
                <td>${i === 0 ? 'Initial MIT' : `Retry ${i}`}</td></tr>`).join('')
            : '<tr><td class="sd-note">Waiting for the payment’s actions…</td></tr>';
        $('sd-timeline').innerHTML = timelineItems().map(i => `<li class="${i.tone}"><div class="r1"><span class="src">${i.src}</span><b>${esc(i.title)}</b><span class="tm">${esc(fmtTime(i.at))}</span></div>
            ${i.text ? `<div class="tx">${esc(i.text)}</div>` : ''}<details><summary>Raw JSON</summary><pre class="sd-pre">${esc(JSON.stringify(i.raw, null, 2))}</pre></details></li>`).join('');
        updateRunStatus(fin);
    }

    // ---- Recent runs --------------------------------------------------------------------------------------------------
    function saveRun() {
        const list = Common.Store.getJSON(RUNS_KEY, []).filter(r => r.id !== state.payId);
        list.unshift({ id: state.payId, at: Date.now(), card: digits().slice(-4), scenario: state.scenario || 'custom', status: state.first?.status || '' });
        Common.Store.setJSON(RUNS_KEY, list.slice(0, 15));
        renderRuns();
    }
    function updateRunStatus(fin) {
        if (!state.payId || !fin || fin.inProgress) return;
        const list = Common.Store.getJSON(RUNS_KEY, []);
        const r = list.find(x => x.id === state.payId);
        if (r && r.status !== fin.status) { r.status = fin.status; Common.Store.setJSON(RUNS_KEY, list); renderRuns(); }
    }
    function renderRuns() {
        const list = Common.Store.getJSON(RUNS_KEY, []);
        $('sd-runs-card').style.display = list.length ? '' : 'none';
        $('sd-runs').innerHTML = list.map(r => `<button type="button" class="copy-btn" data-run="${esc(r.id)}" title="${esc(new Date(r.at).toLocaleString())}">${esc(r.id.slice(0, 12))}… · ${esc(r.scenario)} · …${esc(r.card)} · ${esc(r.status || '?')}</button>`).join('');
    }
    async function openRun(id) {
        stopWatch();
        Object.assign(state, { payId: id, first: null, pay: null, actions: [], events: [], lastSeq: 0 });
        await refreshPayment(); await pollEvents();
        const fin = finalInfo();
        if (fin && fin.inProgress) startWatch(); else renderRun();
    }

    // ---- Wiring -------------------------------------------------------------------------------------------------------
    function init() {
        if (!$('sd-root')) return;
        const sel = $('sd-currency');
        if (typeof CURRENCIES !== 'undefined') sel.innerHTML = CURRENCIES.map(c => `<option>${c.iso4217}</option>`).join('');
        sel.value = [...sel.options].some(o => o.value === 'GBP') ? 'GBP' : sel.value;
        $('sd-exp-y').value = new Date().getFullYear() + 3;
        $('sd-ref').placeholder = 'DUN-<timestamp> (auto)';

        const link = (a, b, lo, hi) => {
            $(a).addEventListener('input', () => { $(b).value = $(a).value; renderConfig(); });
            $(b).addEventListener('input', () => { $(a).value = clamp(parseInt($(b).value, 10) || lo, lo, hi); renderConfig(); });
        };
        link('sd-max-r', 'sd-max', 1, 15); link('sd-days-r', 'sd-days', 1, 60);
        ['sd-dunning', 'sd-downtime', 'sd-fpan', 'sd-capture'].forEach(id => $(id).addEventListener('change', renderConfig));
        ['sd-amount', 'sd-currency', 'sd-ptype', 'sd-ref', 'sd-prev', 'sd-card', 'sd-exp-m', 'sd-exp-y', 'sd-cvv'].forEach(id => $(id).addEventListener('input', renderConfig));

        $('sd-run').addEventListener('click', run);
        $('sd-initial').addEventListener('click', createInitial);
        $('sd-cancel').addEventListener('click', cancelSchedule);
        $('sd-refresh').addEventListener('click', async () => { await refreshPayment(); await pollEvents(); renderRun(); });
        $('sd-stop').addEventListener('click', stopWatch);
        $('sd-scenarios').addEventListener('click', (e) => { const b = e.target.closest('[data-sc]'); if (b) applyScenario(b.dataset.sc); });
        $('sd-card-filter').addEventListener('click', (e) => { const b = e.target.closest('[data-f]'); if (b) { state.cardFilter = b.dataset.f; renderCards(); } });
        $('sd-card-table').addEventListener('click', (e) => {
            const l = e.target.closest('[data-load]'), c = e.target.closest('[data-copy]');
            if (l) { setCard(CARDS.find(x => x.n === l.dataset.load)); state.scenario = 'custom'; renderScenarios(); showToast('Card loaded into the form'); }
            if (c) { navigator.clipboard?.writeText(c.dataset.copy); showToast('Card number copied'); }
        });
        $('sd-runs').addEventListener('click', (e) => { const b = e.target.closest('[data-run]'); if (b) openRun(b.dataset.run); });
        $('sd-root').addEventListener('click', (e) => { const c = e.target.closest('[data-sd-copy]'); if (c) { navigator.clipboard?.writeText(c.dataset.sdCopy); showToast('Copied'); } });

        renderScenarios(); renderCards(); renderRuns(); renderConfig();
        applyScenario('recover');
    }
    window.stopSmartDunningWatch = stopWatch;
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
