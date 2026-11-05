// =============================================
// Smart Dunning
// Handles: create a merchant-initiated payment with a retry schedule (retry.dunning / retry.downtime), then follow it to
//          its final state — API response, every webhook (payment_declined / payment_retry_scheduled / payment_approved /
//          payment_canceled …) and every authorization attempt — and cancel the schedule on demand.
// Backend: POST /payments (forwards `retry`), POST /standalone/vault (allowlisted: GET payment + actions, POST
//          /payments/{id}/cancellations) and the non-consuming GET /standalone/webhook-events buffer. No new routes.
// Facts from the docs: sandbox simulation needs retry.dunning + processing.pan_preference "fpan"; retries stop on a hard decline,
// recommendation code 03 or an ineligible response code; max_attempts 1–15, end_after_days 1–60. The card table only lists cards
// that were actually tried on the demo sandbox (see CARDS).
// =============================================

(function () {
    const API_BASE = window.APP_CONFIG?.apiBaseUrl || '';
    const { $, val, esc } = window.Common;
    const RUNS_KEY = 'cko-dunning-runs';

    // ---- Test data ------------------------------------------------------------------------------------------------
    // Only cards that were tried on the demo sandbox (2026-11-06; MIT, retry.dunning enabled, pan_preference fpan) and did schedule a retry.
    // Every one: first attempt declines with the code shown → status "Retry Scheduled" → the first retry (~30 s later) is approved →
    // final status Authorized, two Authorization actions. max_attempts, amount, scheme and end_after_days did not change which retry
    // succeeds, and no card was found that is approved on a later retry or ends declined. (The two cards named in the Smart Dunning docs
    // approved on the first attempt and never scheduled a retry on this account, so they are not listed.)
    const CARDS = [
        { n: '4544249167673670', scheme: 'Visa', cc: 'GB', code: '20051', note: 'Insufficient funds' },
        { n: '4539467987109256', scheme: 'Visa', cc: 'ES', code: '20005', note: 'Do not honour' },
        { n: '4556294593757189', scheme: 'Visa', cc: 'UY', code: '20061', note: 'Activity amount limit exceeded' },
        { n: '4532819413487978', scheme: 'Visa', cc: 'US', code: '20078', note: 'Blocked at first use' },
        { n: '5437821135399682', scheme: 'Mastercard', cc: 'TW', code: '20051', note: 'Insufficient funds' },
        { n: '5585076576791786', scheme: 'Mastercard', cc: 'HU', code: '20005', note: 'Do not honour' },
        { n: '5420951756276171', scheme: 'Mastercard', cc: 'TN', code: '20061', note: 'Activity amount limit exceeded' },
    ];

    const state = { openRows: new Set(), rowScroll: new Map(), tlHtml: '', payId: null, first: null, pay: null, actions: [], events: [], ckoEvents: [], timer: null, startedAt: 0, endedAt: 0, cancelRequested: false, busy: false };

    // ---- HTTP (same allowlisted proxy as the Payments tab; only the Checkout.com exchange is logged) ------------------
    async function pcall(method, path, body, quiet) {
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
        if (up && !quiet) {
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
        if ($('sd-fpan').checked && dunning) t += '<br><span class="sd-note">Sandbox: retries run about 30 seconds apart; with the test cards below the first retry is approved, whatever the numbers above say.</span>';
        $('sd-sched').innerHTML = t;
        $('sd-preview').textContent = JSON.stringify(buildBody(), null, 2);
    }

    // ---- Test cards ---------------------------------------------------------------------------------------------------
    function setCard(c) {
        $('sd-card').value = fmtCard(c.n);
        if (c.amount) $('sd-amount').value = c.amount;
        renderConfig();
    }
    function renderCards() {
        $('sd-card-table').innerHTML = `<tr><th>Card</th><th>Scheme</th><th>First attempt</th><th>Then</th><th>As the initial payment</th><th></th></tr>` + CARDS.map(c => `<tr>
            <td><code>${fmtCard(c.n)}</code></td><td>${esc(c.scheme)} · ${esc(c.cc)}</td><td>Declined ${esc(c.code)}<br><span class="sd-note">${esc(c.note)}</span></td>
            <td><b>Approved on the 1st retry</b><br><span class="sd-note">≈30 s later → Authorized</span></td>
            <td>${c.scheme === 'Visa' ? 'Declined 43102<br><span class="sd-note">Visa AFT mandate rule on this account</span>' : 'Approved'}</td>
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
            Object.assign(state, { payId: pay.id, first: pay, pay, actions: [], events: [], ckoEvents: [], cancelRequested: false, tlHtml: '' }); state.openRows.clear(); state.rowScroll.clear();
            saveRun();
            startWatch();
        } catch (err) {
            showError('Request failed: ' + err.message);
        } finally {
            state.busy = false; $('sd-run').disabled = false; $('sd-run').textContent = 'Run MIT with Smart Dunning';
        }
    }

    // Initial customer-present payment with the SAME card, amount and currency as the form; the id goes into "Previous payment id" once approved.
    async function createInitial() {
        showError('');
        if (digits().length < 13) return showError('Enter the card number first — the initial payment uses the same card.');
        const btn = $('sd-initial'); btn.disabled = true; btn.textContent = 'Creating…';
        const body = {
            source: { type: 'card', number: digits(), expiry_month: num('sd-exp-m', 12), expiry_year: num('sd-exp-y', new Date().getFullYear() + 3), cvv: val('sd-cvv') || '100', name: 'Smart Dunning Test', stored: true },
            amount: num('sd-amount', 1000), currency: val('sd-currency'), reference: `DUN-INIT-${Date.now()}`, payment_type: val('sd-ptype'), capture: true,
            '3ds': { enabled: false }, processing_channel_id: window.APP_CONFIG?.processingChannelId,
        };
        try {
            const res = await fetch(`${API_BASE}/payments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            const data = await res.json().catch(() => ({}));
            await addToApiLog('POST', 'initial customer-present payment - /payments', res.status, body, data, 'https://api.sandbox.checkout.com/payments');
            const pay = data.payment || data;
            if (pay && pay.id && pay.approved !== false && !/declin/i.test(pay.status || '')) { $('sd-prev').value = pay.id; renderConfig(); showToast(`Initial payment ${pay.id} created`); }
            else if (pay && pay.id) showError(`The initial payment was ${pay.status || 'declined'}: ${pay.response_code || ''} ${pay.response_summary || ''}. Previous payment id left empty.${pay.response_code === '43102' ? ' Visa customer-present payments decline 43102 on this account — use a Mastercard test card, or run without a previous payment id (a dunning MIT works without one).' : ''}`);
            else showError(`Initial payment failed: ${errText(data)}`);
        } catch (err) { showError('Request failed: ' + err.message); }
        finally { btn.disabled = false; btn.textContent = 'Create initial payment'; }
    }

    // ---- Watching -----------------------------------------------------------------------------------------------------
    // Nothing here polls Checkout.com. A timer only looks at this app's own webhook buffer (not logged); when a new webhook for the
    // payment arrives, the payment is reloaded once, quietly (not written to the API log). The Refresh button reloads on demand and is logged.
    function stopWatch() { if (state.timer) { clearInterval(state.timer); state.timer = null; } renderRun(); }
    function startWatch() {
        if (state.timer) clearInterval(state.timer);
        state.startedAt = Date.now(); state.endedAt = 0;
        renderRun();
        refreshPayment(true).then(renderRun);
        state.timer = setInterval(tick, 3000);
    }
    const evKey = (e) => e.event_id || `${e.type}|${e.received_at}`;
    // Deduplicated by event id — NOT by the buffer's sequence number, which restarts on every Lambda instance.
    async function pollEvents() {
        try {
            const res = await fetch(`${API_BASE}/standalone/webhook-events?match=${encodeURIComponent(state.payId)}`);
            const j = await res.json();
            const seen = new Set(state.events.map(evKey));
            const fresh = res.ok ? (j.events || []).filter(e => !seen.has(evKey(e))) : [];
            if (fresh.length) {
                state.events.push(...fresh);
                showToast(`Webhook: ${fresh.map(e => e.type).join(', ')}`);
                fresh.forEach(e => addToApiLog('WEBHOOK', `${e.type} — /webhook`, 200, {}, { id: e.event_id, type: e.type, created_on: e.created_on, data: e.data }));
            }
            return fresh.length > 0;
        } catch (e) { return false; }
    }
    async function refreshPayment(quiet) {
        if (!state.payId) return;
        const [d, a] = await Promise.all([pcall('GET', `/payments/${encodeURIComponent(state.payId)}`, undefined, quiet), pcall('GET', `/payments/${encodeURIComponent(state.payId)}/actions`, undefined, quiet)]);
        if (d.ok && d.data) state.pay = d.data;
        if (a.ok && Array.isArray(a.data)) state.actions = a.data;
        renderRun();
    }
    // What Checkout.com generated for this payment (Events API) — covers webhooks that reached a different server instance.
    async function pullCkoEvents(quiet) {
        const env = await pcall('GET', `/workflows/events/subject/${encodeURIComponent(state.payId)}`, undefined, quiet);
        if (env.ok && Array.isArray(env.data?.data)) state.ckoEvents = env.data.data.map(e => ({ event_id: e.id, type: e.type, created_on: e.timestamp }));
    }
    async function tick() {
        if (await pollEvents()) await refreshPayment(true);
        const fin = finalInfo();
        if (fin && !fin.inProgress && !state.endedAt) state.endedAt = Date.now();
        if ((state.endedAt && Date.now() - state.endedAt > 20000) || Date.now() - state.startedAt > 6 * 60 * 1000) stopWatch();
        renderRun();
    }

    async function cancelSchedule() {
        if (!state.payId) return;
        const btn = $('sd-cancel'); btn.disabled = true;
        const env = await pcall('POST', `/payments/${encodeURIComponent(state.payId)}/cancellations`, {});
        if (env.ok) { state.cancelRequested = true; showToast('Retry schedule cancel requested'); } else showToast(`Cancel failed: ${errText(env.data)}`, 'error');
        if (!state.timer) startWatch(); else renderRun();
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
        if (state.cancelRequested && /declin|cancel|void/i.test(st) || last.response_code === '30047') return { tone: 'warn', title: 'Schedule canceled', status: st,
            text: `The retry schedule was canceled after the first attempt. Checkout.com recorded a final declined authorization (${code} ${sum}) and the payment ended ${st}.` };
        if (/cancel|void/i.test(st)) return { tone: 'warn', title: 'Schedule canceled', status: st, text: `The retry schedule was canceled after ${a.length || 1} attempt${(a.length || 1) === 1 ? '' : 's'}. Last response ${code} ${sum}.` };
        if (/declin/i.test(st)) return { tone: 'bad', title: retries ? `Retries exhausted — declined after ${retries} retr${retries === 1 ? 'y' : 'ies'}` : 'Declined — no retry was scheduled', status: st,
            text: retries ? `Every retry failed. Final response ${code} ${sum}.` : `Declined on the first attempt (${code} ${sum}). Either the code is not eligible for Smart Dunning (hard decline / recommendation 03) or retries were off.` };
        return { tone: '', title: st || 'Unknown', status: st, text: '' };
    }

    // ---- Rendering ----------------------------------------------------------------------------------------------------
    const fmtTime = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleTimeString([], { hour12: false }) + (Date.now() - d > 864e5 || d - Date.now() > 864e5 ? ' ' + d.toLocaleDateString() : ''); };
    const tone = (s) => /approved|authorized|captured|paid/i.test(s) ? 'good' : /declin|cancel|void|fail/i.test(s) ? 'bad' : /retry|pending/i.test(s) ? 'warn' : 'info';
    const chip = (v) => v ? `<span class="pe-chip" data-sd-copy="${esc(v)}" title="Click to copy" style="cursor:pointer;">${esc(v)}</span>` : '';

    // Grouped by authorization attempt, so the order is always: attempt → what the API returned → webhooks it caused.
    // An event belongs to the last attempt that started no later than 3 s after the event's own timestamp (retries are ≥30 s apart).
    const ms = (x) => +new Date(x);
    const describeEvent = (e) => {
        const d = e.data || {}, r = d.retry, bits = [];
        if (e.type === 'payment_retry_scheduled') bits.push('The attempt failed and a retry was scheduled' + (r?.next_attempt_on ? ` for ${fmtTime(r.next_attempt_on)}` : ''));
        else if (e.type === 'payment_approved') bits.push(r?.attempts_made ? `Approved by retry ${r.attempts_made}` : 'Approved');
        else if (e.type === 'payment_declined') bits.push('Declined — final');
        if (d.response_code) bits.push(`${d.response_code} ${d.response_summary || ''}`.trim());
        if (r) bits.push(`attempts made ${r.attempts_made ?? '?'} of ${r.max_attempts ?? '?'}${r.ends_on ? ` · schedule ends ${fmtTime(r.ends_on)}` : ''}`);
        return bits.join(' · ');
    };
    function timelineGroups() {
        const a = auths(), f = state.first;
        const groups = a.length ? a.map((x, i) => ({ i, at: ms(x.processed_on), act: x, rows: [] }))
            : [{ i: 0, at: ms(f?.processed_on || f?.created_on || Date.now()), act: null, rows: [] }];
        const put = (row) => { let g = groups[0]; for (const x of groups) if (x.at <= ms(row.at) + 3000) g = x; g.rows.push(row); };
        if (f) groups[0].rows.push({ rank: 0, at: f.processed_on || f.created_on, src: 'API', title: `POST /payments → ${f.status || ''}`, raw: f,
            text: f.retry ? `Returned a retry schedule: up to ${f.retry.max_attempts ?? '?'} attempts${f.retry.next_attempt_on ? `, next ${fmtTime(f.retry.next_attempt_on)}` : ''}${f.retry.ends_on ? `, ends ${fmtTime(f.retry.ends_on)}` : ''}.` : (f.approved === false ? 'No retry object in the response.' : 'Approved.') });
        state.events.forEach(e => put({ rank: 1, at: e.created_on || e.received_at, src: 'Webhook', title: e.type, text: describeEvent(e), raw: { id: e.event_id, type: e.type, created_on: e.created_on, data: e.data } }));
        const have = new Set(state.events.map(evKey));
        state.ckoEvents.filter(e => !have.has(e.event_id)).forEach(e => put({ rank: 2, at: e.created_on, src: 'CKO event', title: e.type, raw: e,
            text: 'Listed by the Checkout.com Events API; this app’s webhook buffer does not have it (it may have reached another server instance).' }));
        groups.forEach(g => g.rows.sort((x, y) => (x.rank - y.rank) || (ms(x.at) - ms(y.at))));
        return groups;
    }
    const rowKey = (r) => `${r.src}|${r.title}|${r.at}`;
    const rawBlock = (r) => { const k = esc(rowKey(r)); return `<details data-k="${k}"${state.openRows.has(rowKey(r)) ? ' open' : ''}><summary>Raw JSON</summary><pre class="sd-pre" data-k="${k}">${esc(JSON.stringify(r.raw, null, 2))}</pre></details>`; };
    function renderTimeline(fin) {
        const groups = timelineGroups(), base = groups[0].at;
        const label = (g) => g.act && g.act.response_code === '30047' ? `Retry ${g.i} · schedule canceled` : g.i === 0 ? 'Initial MIT' : `Retry ${g.i}`;
        let html = groups.map(g => {
            const x = g.act, cls = !x ? 'warn' : x.approved ? 'good' : 'bad';
            const off = g.i === 0 ? '' : ` · +${Math.round((g.at - base) / 1000)}s`;
            return `<div class="sd-g ${cls}"><div class="sd-gh"><span class="sd-gn">${esc(label(g))}</span>
                <span class="sd-badge ${cls}">${!x ? 'Loading…' : x.approved ? 'Approved' : 'Declined'}</span>
                <span class="sd-gc">${x ? esc(`${x.response_code || ''} ${x.response_summary || ''}`.trim()) : ''}</span>
                <span class="tm">${x ? esc(fmtTime(x.processed_on)) + off : ''}</span></div>
                ${g.rows.map(r => `<div class="sd-r"><div class="r1"><span class="src">${esc(r.src)}</span><b>${esc(r.title)}</b><span class="tm">${esc(fmtTime(r.at))}</span></div>
                    ${r.text ? `<div class="tx">${esc(r.text)}</div>` : ''}${rawBlock(r)}</div>`).join('')}</div>`;
        }).join('');
        const next = fin && fin.inProgress && state.pay?.retry?.next_attempt_on;
        if (next) html += `<div class="sd-g pending"><div class="sd-gh"><span class="sd-gn">Retry ${groups.length}</span><span class="sd-badge">Scheduled</span><span class="tm">${esc(fmtTime(next))} · +${Math.round((ms(next) - base) / 1000)}s</span></div></div>`;
        // The tab re-renders every few seconds while listening. Rebuilding identical HTML would close every open Raw JSON block and
        // reset its scroll, so: skip when nothing changed, and when something did, put back what the user had open / scrolled to.
        if (html === state.tlHtml) return;
        state.tlHtml = html;
        const box = $('sd-timeline');
        box.innerHTML = html;
        box.querySelectorAll('pre[data-k]').forEach(pre => { const y = state.rowScroll.get(pre.dataset.k); if (y) pre.scrollTop = y; });
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
            ? `Listening for webhooks… ${secs}s · ${state.events.length} webhook${state.events.length === 1 ? '' : 's'} received${secs > 45 && !state.events.length ? ' — none yet: check that a workflow sends these events to this app (Webhooks tab).' : ''}`
            : `Not listening (${state.events.length} webhook${state.events.length === 1 ? '' : 's'} captured). Use Refresh to look again.`;
        $('sd-final').innerHTML = fin ? `<div class="sd-final ${fin.tone}"><div class="t">${esc(fin.title)} ${fin.status ? `<span class="sd-badge ${fin.tone === 'warn' ? 'warn' : fin.tone}" style="margin-left:6px;">${esc(fin.status)}</span>` : ''}</div><div class="d">${esc(fin.text)}</div></div>` : '';
        renderTimeline(fin);
        updateRunStatus(fin);
    }

    // ---- Recent runs --------------------------------------------------------------------------------------------------
    function saveRun() {
        const list = Common.Store.getJSON(RUNS_KEY, []).filter(r => r.id !== state.payId);
        list.unshift({ id: state.payId, at: Date.now(), card: digits().slice(-4), status: state.first?.status || '' });
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
        $('sd-runs').innerHTML = list.map(r => `<button type="button" class="copy-btn" data-run="${esc(r.id)}" title="${esc(new Date(r.at).toLocaleString())}">${esc(r.id.slice(0, 12))}… · …${esc(r.card)} · ${esc(r.status || '?')}</button>`).join('');
    }
    async function openRun(id) {
        stopWatch();
        Object.assign(state, { payId: id, first: null, pay: null, actions: [], events: [], ckoEvents: [], cancelRequested: false, tlHtml: '' }); state.openRows.clear(); state.rowScroll.clear();
        await refreshPayment(true); await pollEvents();
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
        $('sd-refresh').addEventListener('click', async () => { await refreshPayment(false); await pollEvents(); await pullCkoEvents(false); renderRun(); });
        $('sd-stop').addEventListener('click', stopWatch);
        $('sd-timeline').addEventListener('toggle', (e) => { const k = e.target.dataset && e.target.dataset.k; if (k) (e.target.open ? state.openRows.add(k) : state.openRows.delete(k)); }, true);
        $('sd-timeline').addEventListener('scroll', (e) => { const k = e.target.dataset && e.target.dataset.k; if (k) state.rowScroll.set(k, e.target.scrollTop); }, true);
        $('sd-card-table').addEventListener('click', (e) => {
            const l = e.target.closest('[data-load]'), c = e.target.closest('[data-copy]');
            if (l) { setCard(CARDS.find(x => x.n === l.dataset.load)); showToast('Card loaded into the form'); }
            if (c) { navigator.clipboard?.writeText(c.dataset.copy); showToast('Card number copied'); }
        });
        $('sd-runs').addEventListener('click', (e) => { const b = e.target.closest('[data-run]'); if (b) openRun(b.dataset.run); });
        $('sd-root').addEventListener('click', (e) => { const c = e.target.closest('[data-sd-copy]'); if (c) { navigator.clipboard?.writeText(c.dataset.sdCopy); showToast('Copied'); } });

        $('sd-max').value = $('sd-max-r').value = 3; $('sd-days').value = $('sd-days-r').value = 1;   // short schedule — the sandbox compresses it anyway
        setCard(CARDS.find(c => c.n === '5437821135399682'));                                       // a Mastercard: it also works as the initial payment
        renderCards(); renderRuns(); renderConfig();
    }
    window.stopSmartDunningWatch = stopWatch;
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
