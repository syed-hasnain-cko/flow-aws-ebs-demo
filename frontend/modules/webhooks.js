// =============================================
// Webhooks — manage (Workflows API CRUD + test) and inspect (events, delivery status, replay)
// Everything goes through window.CkoProxy → POST /standalone/vault (allowlisted /workflows/* calls), so only the
// Checkout.com exchange reaches the API log. Events/delivery come from Checkout.com, not this Lambda's memory.
// =============================================

(function () {
    const $ = (id) => document.getElementById(id);
    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const API = () => window.APP_CONFIG?.apiBaseUrl || '';
    const OFFER_KEY = 'cko-webhook-offer';
    const st = { types: null, editing: null, selected: new Set(), busy: false, workflows: [] };

    const call = (m, p, b) => window.CkoProxy.call(m, p, b);
    const err = (r) => window.CkoProxy.errText(r);
    const toast = (m, t) => window.showToast && window.showToast(m, t);
    const pretty = (o) => JSON.stringify(o, null, 2);
    const list = (d) => Array.isArray(d) ? d : (d?.data || d?.workflows || d?.events || d?.items || []);

    async function busy(fn, ...btns) {
        if (st.busy) return; st.busy = true;
        const els = btns.map($).filter(Boolean); els.forEach(b => b.disabled = true);
        try { return await fn(); } finally { st.busy = false; els.forEach(b => b.disabled = false); if (st.workflows) updateAppButton(); }
    }

    // ---------- views ----------
    function showView(v) {
        $('wh-view-manage').style.display = v === 'manage' ? '' : 'none';
        $('wh-view-inspect').style.display = v === 'inspect' ? '' : 'none';
        document.querySelectorAll('.wh-view-btn').forEach(b => { const on = b.dataset.view === v; b.classList.toggle('active', on); b.setAttribute('aria-selected', on); });
    }

    // ---------- event types ----------
    async function loadTypes() {
        if (st.types) return st.types;
        const r = await call('GET', '/workflows/event-types');
        if (!r.ok) { toast('Could not load event types: ' + err(r), 'error'); return null; }
        const out = {};
        const src = r.data?.sources || r.data?.data || r.data;
        const add = (name, evs) => { out[name] = (evs || []).map(e => typeof e === 'string' ? e : (e.id || e.name || e.type)).filter(Boolean); };
        if (Array.isArray(src)) src.forEach(s => add(s.id || s.name || s.source, s.events || s.event_types));
        else if (src && typeof src === 'object') Object.entries(src).forEach(([k, v]) => add(k, Array.isArray(v) ? v : v?.events));
        st.types = out;
        return out;
    }

    function renderEvents() {
        const f = ($('wh-ev-filter').value || '').toLowerCase();
        const box = $('wh-events');
        if (!st.types) { box.textContent = 'Event types unavailable.'; return; }
        box.innerHTML = Object.entries(st.types).map(([src, evs]) => {
            const shown = evs.filter(e => !f || e.toLowerCase().includes(f) || src.includes(f));
            if (!shown.length) return '';
            const all = shown.every(e => st.selected.has(src + ':' + e));
            return `<div style="margin-bottom:10px"><label style="font-weight:600"><input type="checkbox" data-src="${esc(src)}" class="wh-src" ${all ? 'checked' : ''}> ${esc(src)} <span style="opacity:.6">(${shown.length})</span></label>
              <div style="display:flex;flex-wrap:wrap;gap:4px 14px;margin:4px 0 0 20px">${shown.map(e =>
                `<label style="font-size:12px"><input type="checkbox" class="wh-ev" data-k="${esc(src + ':' + e)}" ${st.selected.has(src + ':' + e) ? 'checked' : ''}> ${esc(e)}</label>`).join('')}</div></div>`;
        }).join('') || 'No match.';
        $('wh-ev-count').textContent = `— ${st.selected.size} selected`;
        preview();
    }

    const eventsObj = () => {
        const o = {}; st.selected.forEach(k => { const i = k.indexOf(':'); (o[k.slice(0, i)] = o[k.slice(0, i)] || []).push(k.slice(i + 1)); });
        return o;
    };
    function actionBody() {
        const a = { type: 'webhook', url: $('wh-url').value.trim() };
        const auth = $('wh-auth').value.trim(), key = $('wh-sigkey').value.trim();
        if (auth) a.headers = { Authorization: auth };
        if (key) a.signature = { method: 'HMACSHA256', key };
        return a;
    }
    const pcs = () => $('wh-pc').value.split(',').map(s => s.trim()).filter(Boolean);
    function createBody() {
        const conditions = [{ type: 'event', events: eventsObj() }];
        if (pcs().length) conditions.push({ type: 'processing_channel', processing_channels: pcs() });
        return { name: $('wh-name').value.trim(), active: $('wh-active').checked, conditions, actions: [actionBody()] };
    }
    function preview() {
        const b = createBody();
        if (b.actions[0].headers) b.actions[0].headers = { Authorization: '••••' };
        if (b.actions[0].signature) b.actions[0].signature = { method: 'HMACSHA256', key: '••••' };
        $('wh-preview').textContent = pretty(b);
    }

    // ---------- list ----------
    async function refresh() {
        const r = await call('GET', '/workflows');
        if (!r.ok) { $('wh-list').textContent = 'Could not load workflows: ' + err(r); return; }
        st.workflows = list(r.data);
        renderList();
        await detectApp();
    }
    // is a workflow already sending this account's events to this app's /webhook?
    async function detectApp() {
        const url = API() + '/webhook'; st.appWf = null;
        for (const w of st.workflows) {
            const d = await call('GET', `/workflows/${w.id}`);
            if (d.ok && (d.data.actions || []).some(a => a.url === url)) { st.appWf = { id: w.id, name: w.name, active: d.data.active !== false }; break; }
        }
        updateAppButton();
    }
    function updateAppButton() {
        const b = $('wh-use-app'), s = $('wh-app-state');
        if (st.appWf) {
            b.disabled = true;
            b.title = `Already configured: “${st.appWf.name || st.appWf.id}” (${st.appWf.id}) sends this account's events to ${API()}/webhook` + (st.appWf.active ? '.' : ' — but it is disabled; enable it in the list.');
            s.textContent = st.appWf.active ? '✅ This app receives this account\'s webhooks' : '⏸ Configured but disabled';
        } else {
            b.disabled = false;
            b.title = 'Create a workflow that sends all events of this account to ' + API() + '/webhook';
            s.textContent = '⚠️ This app is not receiving this account\'s webhooks yet';
        }
    }
    function renderList() {
        if (!st.workflows.length) { $('wh-list').innerHTML = 'No workflows yet. Create one, or use “Send events to this app”.'; return; }
        $('wh-list').innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:13px">
          <tr style="text-align:left;opacity:.7"><th>Name</th><th>Active</th><th>Id</th><th></th></tr>${st.workflows.map(w => `
          <tr style="border-top:1px solid var(--border)"><td>${esc(w.name || '(unnamed)')}</td><td>${w.active === false ? '⏸ off' : '✅ on'}</td>
          <td><code>${esc(w.id)}</code></td><td style="text-align:right;white-space:nowrap">
            <button class="copy-btn" data-act="view" data-id="${esc(w.id)}">View</button>
            <button class="copy-btn" data-act="edit" data-id="${esc(w.id)}">Edit</button>
            <button class="copy-btn" data-act="toggle" data-id="${esc(w.id)}">${w.active === false ? 'Enable' : 'Disable'}</button>
            <button class="copy-btn" data-act="test" data-id="${esc(w.id)}">Test</button>
            <button class="copy-btn" data-act="delete" data-id="${esc(w.id)}">Delete</button></td></tr>`).join('')}</table>`;
    }

    // ---------- editor ----------
    async function openEditor(id) {
        await loadTypes();
        st.editing = null; st.selected = new Set();
        $('wh-auth').value = ''; $('wh-sigkey').value = '';
        if (id) {
            const r = await call('GET', `/workflows/${id}`);
            if (!r.ok) { toast('Could not load workflow: ' + err(r), 'error'); return; }
            const w = r.data, evc = (w.conditions || []).find(c => c.type === 'event'), pcc = (w.conditions || []).find(c => c.type === 'processing_channel'), act = (w.actions || []).find(a => a.type === 'webhook');
            st.editing = { id, w, evc, pcc, act };
            $('wh-editor-title').textContent = 'Edit ' + id;
            $('wh-name').value = w.name || ''; $('wh-active').checked = w.active !== false;
            $('wh-url').value = act?.url || ''; $('wh-pc').value = (pcc?.processing_channels || []).join(', ');
            Object.entries(evc?.events || {}).forEach(([s, evs]) => evs.forEach(e => st.selected.add(s + ':' + e)));
            $('wh-auth-note').style.display = '';
        } else {
            $('wh-editor-title').textContent = 'New workflow';
            $('wh-name').value = 'Webhook inspector workflow'; $('wh-active').checked = true; $('wh-url').value = ''; $('wh-pc').value = '';
            $('wh-auth-note').style.display = 'none';
        }
        $('wh-editor').style.display = ''; renderEvents();
        $('wh-editor').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    async function save() {
        const b = createBody();
        if (!b.name) return toast('Give the workflow a name.', 'error');
        if (!/^https:\/\//.test(b.actions[0].url)) return toast('The webhook URL must start with https://', 'error');
        if (!st.selected.size) return toast('Select at least one event.', 'error');
        const e = st.editing;
        if (!e) {
            const r = await call('POST', '/workflows', b);
            if (!r.ok) return toast('Create failed: ' + err(r), 'error');
            toast('Workflow created: ' + (r.data?.id || ''));
        } else {
            let ok = true;
            const p = await call('PATCH', `/workflows/${e.id}`, { name: b.name, active: b.active });
            ok = ok && p.ok; if (!p.ok) toast('Update failed: ' + err(p), 'error');
            if (ok && e.evc?.id) { const r = await call('PUT', `/workflows/${e.id}/conditions/${e.evc.id}`, b.conditions[0]); ok = r.ok; if (!r.ok) toast('Events update failed: ' + err(r), 'error'); }
            if (ok && e.act?.id) {
                const a = b.actions[0];
                // headers/signature are never returned by the API: keep them only if the user did not type new ones
                const changed = a.url !== e.act.url || a.headers || a.signature;
                if (changed) { const r = await call('PUT', `/workflows/${e.id}/actions/${e.act.id}`, a); ok = r.ok; if (!r.ok) toast('Action update failed: ' + err(r), 'error'); }
            }
            if (!ok) return;
            toast('Workflow updated');
        }
        $('wh-editor').style.display = 'none';
        await refresh();
    }

    // ---------- row actions ----------
    async function rowAction(act, id) {
        if (act === 'view') {
            const r = await call('GET', `/workflows/${id}`);
            $('wh-raw').textContent = pretty(r.data); $('wh-raw-wrap').style.display = ''; $('wh-raw-wrap').open = true;
        } else if (act === 'edit') await openEditor(id);
        else if (act === 'toggle') {
            const w = st.workflows.find(x => x.id === id); const r = await call('PATCH', `/workflows/${id}`, { active: w?.active === false });
            if (!r.ok) return toast('Failed: ' + err(r), 'error'); await refresh();
        } else if (act === 'delete') {
            if (!confirm(`Delete workflow ${id}? Actions of already executed events still run.`)) return;
            const r = await call('DELETE', `/workflows/${id}`);
            if (!r.ok) return toast('Delete failed: ' + err(r), 'error'); toast('Deleted'); await refresh();
        } else if (act === 'test') await openTest(id);
    }

    async function openTest(id) {
        await loadTypes();
        const r = await call('GET', `/workflows/${id}`); if (!r.ok) return toast('Could not load workflow: ' + err(r), 'error');
        const evs = (r.data.conditions || []).find(c => c.type === 'event')?.events || {};
        const opts = Object.entries(evs).flatMap(([s, l]) => l.map(e => `<label style="font-size:12px;margin-right:12px"><input type="checkbox" class="wh-test-ev" data-k="${esc(s + ':' + e)}"> ${esc(e)}</label>`)).join('') || 'This workflow has no events.';
        const box = $('wh-test'); box.style.display = '';
        box.innerHTML = `<h3 style="margin-top:0">Test ${esc(id)}</h3><p class="settings-sub">Sends sample events (flagged <code>isTest</code>) to the workflow's webhook URL.</p><div style="max-height:200px;overflow:auto">${opts}</div>
          <div class="wh-toolbar" style="margin-top:10px"><button id="wh-test-go" class="wh-btn primary" type="button">Send test events</button><button id="wh-test-close" class="wh-btn" type="button">Close</button></div>`;
        $('wh-test-close').onclick = () => box.style.display = 'none';
        $('wh-test-go').onclick = () => busy(async () => {
            const sel = {}; box.querySelectorAll('.wh-test-ev:checked').forEach(c => { const k = c.dataset.k, i = k.indexOf(':'); (sel[k.slice(0, i)] = sel[k.slice(0, i)] || []).push(k.slice(i + 1)); });
            if (!Object.keys(sel).length) return toast('Tick at least one event.', 'error');
            const t = await call('POST', `/workflows/${id}/test`, { event_types: sel });
            toast(t.ok ? 'Test events sent — check the receiving URL / Inspector' : 'Test failed: ' + err(t), t.ok ? undefined : 'error');
        }, 'wh-test-go');
    }

    // ---------- send events to this app ----------
    async function createForThisApp(selectEvents) {
        const types = await loadTypes(); if (!types) return false;
        const url = API() + '/webhook';
        const ex = await call('GET', '/workflows');
        if (ex.ok) {
            for (const w of list(ex.data)) {
                const d = await call('GET', `/workflows/${w.id}`);
                if (d.ok && (d.data.actions || []).some(a => a.url === url)) { toast('A workflow already sends events to this app (' + w.id + ').'); await refresh(); return true; }
            }
        }
        if (selectEvents) {
            showView('manage'); await openEditor(null);
            $('wh-name').value = 'Webhook inspector workflow'; $('wh-url').value = url;
            Object.entries(types).forEach(([s, l]) => l.forEach(e => st.selected.add(s + ':' + e))); renderEvents();
            return true;
        }
        const all = {}; Object.entries(types).forEach(([s, l]) => { if (l.length) all[s] = l; });
        const r = await call('POST', '/workflows', { name: 'Webhook inspector workflow', active: true, conditions: [{ type: 'event', events: all }], actions: [{ type: 'webhook', url }] });
        toast(r.ok ? 'Workflow created — events now arrive at this app.' : 'Create failed: ' + err(r), r.ok ? undefined : 'error');
        if (r.ok) await refresh();
        return r.ok;
    }

    // ---------- inspector ----------
    const statusIcon = (s) => s === 'successful' ? '✅' : s === 'failed' ? '❌' : '⏳';
    async function findEvents() {
        const id = $('wh-subject').value.trim(); if (!id) return toast('Enter a payment or dispute id.', 'error');
        const r = await call('GET', `/workflows/events/subject/${id}`);
        if (!r.ok) { $('wh-events-list').textContent = 'No events: ' + err(r); return; }
        const evs = list(r.data);
        $('wh-event-detail').innerHTML = '';
        $('wh-events-list').innerHTML = evs.length ? `<table style="width:100%;font-size:13px;border-collapse:collapse"><tr style="text-align:left;opacity:.7"><th>Time</th><th>Type</th><th>Event id</th><th></th></tr>${evs.map(e => `
          <tr style="border-top:1px solid var(--border)"><td>${esc(e.timestamp || e.created_on || '')}</td><td>${esc(e.type)}</td><td><code>${esc(e.id)}</code></td>
          <td style="text-align:right"><button class="copy-btn" data-ev="${esc(e.id)}">Delivery</button> <button class="copy-btn" data-replay="${esc(e.id)}">↺ Replay</button></td></tr>`).join('')}</table>` : 'No events for this id yet.';
    }
    async function eventDetail(id) {
        const r = await call('GET', `/workflows/events/${id}`);
        if (!r.ok) { $('wh-event-detail').textContent = err(r); return; }
        const inv = r.data.action_invocations || [];
        let html = `<h4 style="margin:0 0 6px">${esc(r.data.type)} <code>${esc(id)}</code></h4>`;
        for (const a of inv) {
            const d = await call('GET', `/workflows/events/${id}/actions/${a.workflow_action_id}`);
            const tries = d.data?.action_invocations || [];
            html += `<div style="border:1px solid var(--border);border-radius:8px;padding:10px;margin-bottom:8px">${statusIcon(a.status)} <strong>${esc(a.status)}</strong> · workflow <code>${esc(a.workflow_id)}</code> · action <code>${esc(a.workflow_action_id)}</code>
              <button class="copy-btn" data-replay-wf="${esc(a.workflow_id)}" data-ev="${esc(id)}" style="float:right">↺ Replay to this workflow</button>
              ${tries.map(t => `<div style="font-size:12px;margin-top:4px">${t.succeeded ? '✅' : '❌'} ${esc(t.timestamp)} · HTTP ${esc(t.result_details?.status_code ?? '—')} ${t.retry ? '· retry' : ''} ${t.final ? '· final' : ''}</div>`).join('')}</div>`;
        }
        if (!inv.length) html += '<div class="settings-sub">No workflow matched this event (no deliveries).</div>';
        html += `<details><summary>Event payload</summary><pre class="json-code-block">${esc(pretty(r.data.data ?? r.data))}</pre></details>`;
        $('wh-event-detail').innerHTML = html;
    }
    async function replay(path, body, label) {
        if (!confirm(`Replay ${label}? Matching workflows will deliver again.`)) return;
        const r = await call('POST', path, body);
        toast(r.ok ? 'Replay queued' : 'Replay failed: ' + err(r), r.ok ? undefined : 'error');
    }
    async function liveFeed() {
        try {
            const res = await fetch(`${API()}/standalone/webhook-events?since=0`);
            const j = await res.json(); const evs = (j.events || []).slice(-30).reverse();
            $('wh-live').innerHTML = evs.length ? evs.map(e => `<div style="font-size:12px;padding:3px 0"><code>${esc(e.type || e.event?.type || '')}</code> ${esc(e.id || e.event?.id || '')}</div>`).join('') : 'Nothing in this container’s buffer.';
        } catch (e) { $('wh-live').textContent = 'Could not read the live feed.'; }
    }

    // ---------- offer after a new account was saved ----------
    function maybeOffer() {
        if (localStorage.getItem(OFFER_KEY) !== '1' || !window.AccountConfig?.active) return;
        localStorage.removeItem(OFFER_KEY);
        $('wh-offer-url').textContent = API() + '/webhook';
        const o = $('wh-offer'); o.style.display = 'flex';
        const close = () => o.style.display = 'none';
        $('wh-offer-no').onclick = close;
        $('wh-offer-yes').onclick = () => { close(); busy(() => createForThisApp(false)); };
        $('wh-offer-edit').onclick = () => { close(); const b = document.querySelector('.tab-link[onclick*="webhooks-tab"]'); if (b) b.click(); createForThisApp(true); };
    }

    function init() {
        if (!$('wh-root')) return;
        document.querySelectorAll('.wh-view-btn').forEach(b => b.addEventListener('click', () => showView(b.dataset.view)));
        $('wh-refresh').onclick = () => busy(refresh, 'wh-refresh');
        $('wh-new').onclick = () => busy(() => openEditor(null));
        $('wh-use-app').onclick = () => busy(() => createForThisApp(false), 'wh-use-app');
        $('wh-save').onclick = () => busy(save, 'wh-save');
        $('wh-cancel').onclick = () => $('wh-editor').style.display = 'none';
        ['wh-name', 'wh-url', 'wh-auth', 'wh-sigkey', 'wh-pc', 'wh-active'].forEach(i => $(i).addEventListener('input', preview));
        $('wh-ev-filter').addEventListener('input', renderEvents);
        $('wh-events').addEventListener('change', (e) => {
            const t = e.target;
            if (t.classList.contains('wh-ev')) t.checked ? st.selected.add(t.dataset.k) : st.selected.delete(t.dataset.k);
            if (t.classList.contains('wh-src')) (st.types[t.dataset.src] || []).forEach(ev => { const k = t.dataset.src + ':' + ev; t.checked ? st.selected.add(k) : st.selected.delete(k); });
            renderEvents();
        });
        $('wh-list').addEventListener('click', (e) => { const b = e.target.closest('[data-act]'); if (b) busy(() => rowAction(b.dataset.act, b.dataset.id)); });
        $('wh-find').onclick = () => busy(findEvents, 'wh-find');
        $('wh-replay-subject').onclick = () => { const id = $('wh-subject').value.trim(); if (id) busy(() => replay(`/workflows/events/subject/${id}/reflow`, {}, 'all events of ' + id)); };
        $('wh-live-refresh').onclick = liveFeed;
        $('wh-events-list').addEventListener('click', (e) => {
            const d = e.target.closest('[data-ev]'), r = e.target.closest('[data-replay]');
            if (d) busy(() => eventDetail(d.dataset.ev)); else if (r) busy(() => replay(`/workflows/events/${r.dataset.replay}/reflow`, {}, 'event ' + r.dataset.replay));
        });
        $('wh-event-detail').addEventListener('click', (e) => {
            const b = e.target.closest('[data-replay-wf]');
            if (b) busy(() => replay(`/workflows/events/${b.dataset.ev}/workflow/${b.dataset.replayWf}/reflow`, {}, `event ${b.dataset.ev} to ${b.dataset.replayWf}`));
        });
        showView('manage');
        maybeOffer();
    }
    if (document.readyState === 'complete') init(); else window.addEventListener('load', init);
})();
