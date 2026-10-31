// =============================================
// API Log Module
// In-memory API call log displayed in the sidebar.
// Persists across page navigations via sessionStorage.
//
// Sidebar: search + status filter, export, pin (pinned entries survive CLEAR).
// Detail modal: full request URL, status / duration / cko-request-id, Copy as cURL,
//               copy request / response JSON, pin.
// All of that UI is created from this file so it also works on success.html / failure.html,
// which carry their own copy of the sidebar markup.
// Depends on: nothing (pure DOM + memory)
// =============================================

const API_LOG_STORAGE_KEY = 'cko-api-log';

let apiLogHistory = {};

function _saveToStorage(entries) {
    try {
        sessionStorage.setItem(API_LOG_STORAGE_KEY, JSON.stringify(entries));
    } catch (e) {
        // sessionStorage full or unavailable — silently ignore
    }
}

function _loadFromStorage() {
    try {
        return JSON.parse(sessionStorage.getItem(API_LOG_STORAGE_KEY) || '[]');
    } catch (e) {
        return [];
    }
}

const _esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const _time = (iso) => { try { return new Date(iso).toLocaleTimeString([], { hour12: false }); } catch (e) { return ''; } };

function _entryHtml(e) {
    const isError = e.status >= 400;
    const dotClass = isError ? 'dot-error' : 'dot-success';
    const dur = e.meta?.duration_ms != null ? ` · ${e.meta.duration_ms} ms` : '';
    return `
        <div style="display:flex; align-items:center; margin-bottom:2px;">
            <span class="status-dot ${dotClass}"></span>
            <span class="method ${_esc(e.method).toLowerCase()}">${_esc(e.method)}</span>
            <span style="color:#e2e8f0; font-weight:bold;">${_esc(e.status)}</span>
            <span class="log-time">${_esc(_time(e.at))}${_esc(dur)}</span>
            <span class="log-pin" title="Pinned — survives CLEAR">📌</span>
        </div>
        <span class="endpoint-text">${_esc(e.endpoint)}</span>
    `;
}

function _renderEntry(e) {
    const logContainer = document.getElementById('log-entries');
    if (!logContainer) return;

    apiLogHistory[e.id] = { ...e };

    const entry = document.createElement('div');
    entry.className = 'log-entry' + (e.pinned ? ' pinned' : '');
    entry.dataset.id = e.id;
    entry.onclick = () => openLogModal(e.id);
    entry.innerHTML = _entryHtml(e);

    logContainer.prepend(entry);
    _applyFilter();
}

// ---------------------------------------------------------------------
// Sidebar toolbar (search / status filter / export) + styles
// ---------------------------------------------------------------------
function _injectStyles() {
    if (document.getElementById('api-log-extra-css')) return;
    const st = document.createElement('style');
    st.id = 'api-log-extra-css';
    st.textContent = `
        .log-time { margin-left:auto; color:#64748b; font-size:9px; font-family:'Monaco', monospace; }
        .log-pin { display:none; margin-left:6px; font-size:10px; }
        .log-entry.pinned .log-pin { display:inline; }
        .log-entry.pinned { border-left:2px solid #38bdf8; }
        .log-entry .method.patch  { color:#a78bfa; }
        .log-entry .method.delete { color:#f87171; }
        .log-entry .method.webhook { color:#fb923c; }
        .method.patch  { color:#a78bfa; }
        .method.delete { color:#f87171; }
        .method.webhook { color:#fb923c; }
        #log-toolbar { padding:8px 10px; border-bottom:1px solid #1e293b; display:flex; flex-direction:column; gap:6px; }
        #log-toolbar .row { display:flex; gap:6px; }
        #log-toolbar input, #log-toolbar select { flex:1; min-width:0; background:#0f172a; border:1px solid #334155; color:#e2e8f0; border-radius:6px;
            padding:5px 8px; font-size:11px; font-family:'Monaco', monospace; }
        #log-toolbar input:focus, #log-toolbar select:focus { outline:none; border-color:#38bdf8; }
        #log-toolbar button { background:rgba(51,65,85,.5); border:1px solid #334155; color:#94a3b8; border-radius:6px; padding:5px 9px; font-size:10px;
            font-family:'Monaco', monospace; cursor:pointer; white-space:nowrap; }
        #log-toolbar button:hover { border-color:#38bdf8; color:#e2e8f0; }
        #log-count { font-size:9px; color:#64748b; font-family:'Monaco', monospace; }
        #modal-meta { display:flex; flex-wrap:wrap; gap:6px 14px; font-size:11px; color:#94a3b8; font-family:'Monaco', monospace; }
        #modal-meta b { color:#e2e8f0; font-weight:600; }
        #modal-meta .ok { color:#10b981; } #modal-meta .bad { color:#ef4444; }
        #modal-tools { display:flex; flex-wrap:wrap; gap:8px; }
        #modal-tools button { background:#0f172a; border:1px solid #334155; color:#cbd5e1; border-radius:8px; padding:6px 12px; font-size:12px; cursor:pointer; }
        #modal-tools button:hover:not(:disabled) { border-color:#38bdf8; color:#fff; }
        #modal-tools button:disabled { opacity:.4; cursor:not-allowed; }
        #modal-tools button.on { border-color:#38bdf8; color:#38bdf8; }
    `;
    document.head.appendChild(st);
}

function _ensureToolbar() {
    if (document.getElementById('log-toolbar')) return;
    const list = document.getElementById('log-entries');
    if (!list || !list.parentNode) return;
    const bar = document.createElement('div');
    bar.id = 'log-toolbar';
    bar.innerHTML = `
        <div class="row">
            <input id="log-search" type="search" placeholder="Search path, id, field, value…" autocomplete="off">
            <select id="log-status-filter" title="Filter by result">
                <option value="">All</option><option value="ok">2xx</option><option value="err">4xx / 5xx</option><option value="pin">Pinned</option>
            </select>
        </div>
        <div class="row" style="align-items:center; justify-content:space-between;">
            <span id="log-count"></span>
            <button id="log-export" type="button" title="Download the whole log as JSON">⬇ Export</button>
        </div>`;
    list.parentNode.insertBefore(bar, list);
    document.getElementById('log-search').addEventListener('input', _applyFilter);
    document.getElementById('log-status-filter').addEventListener('change', _applyFilter);
    document.getElementById('log-export').addEventListener('click', exportApiLog);
}

function _hay(h) {
    if (!h._hay) {
        let body = '';
        try { body = JSON.stringify(h.request) + ' ' + JSON.stringify(h.response); } catch (e) { /* circular — ignore */ }
        h._hay = `${h.method} ${h.status} ${h.endpoint} ${h.url || ''} ${body}`.toLowerCase();
    }
    return h._hay;
}

function _applyFilter() {
    const q = (document.getElementById('log-search')?.value || '').trim().toLowerCase();
    const f = document.getElementById('log-status-filter')?.value || '';
    let shown = 0, total = 0;
    document.querySelectorAll('#log-entries .log-entry').forEach(el => {
        const h = apiLogHistory[el.dataset.id];
        total++;
        if (!h) return;
        const ok = (!q || _hay(h).includes(q))
            && (!f || (f === 'ok' && h.status < 400) || (f === 'err' && h.status >= 400) || (f === 'pin' && h.pinned));
        el.style.display = ok ? '' : 'none';
        if (ok) shown++;
    });
    const badge = document.getElementById('log-dock-badge');
    if (badge) badge.textContent = total ? String(total) : '';
    const c = document.getElementById('log-count');
    if (c) c.textContent = total ? ((q || f) ? `${shown} of ${total} calls` : `${total} call${total === 1 ? '' : 's'}`) : '';
}


// ---------------------------------------------------------------------
// Docked mode (index.html: body.app-docked, desktop only — CSS in style.css)
// The log sits beside the content instead of floating over it. It can be collapsed to a slim tab that
// shows the call count, and resized by dragging its left edge. Both choices are remembered.
// success.html / failure.html never get body.app-docked, so they keep the floating log.
// ---------------------------------------------------------------------
function _ensureDock() {
    const sb = document.getElementById('api-sidebar');
    if (!sb || !document.body.classList.contains('app-docked') || document.getElementById('log-dock-tab')) return;
    const LS_COLLAPSED = 'cko-log-collapsed', LS_W = 'cko-log-w';

    const w = parseInt(localStorage.getItem(LS_W) || '0', 10);
    if (w >= 280 && w <= 720) document.documentElement.style.setProperty('--log-w', w + 'px');

    // first visit: open on wide screens, collapsed on narrower ones so the page keeps its room
    const saved = localStorage.getItem(LS_COLLAPSED);
    const setCollapsed = (on, remember = true) => {
        sb.classList.toggle('dock-collapsed', on);
        if (remember) { try { localStorage.setItem(LS_COLLAPSED, on ? '1' : '0'); } catch (e) { /* ignore */ } }
    };
    setCollapsed(saved === null ? window.innerWidth < 1500 : saved === '1', false);

    const tab = document.createElement('button');
    tab.id = 'log-dock-tab'; tab.type = 'button'; tab.title = 'Open API log';
    tab.innerHTML = '<span class="vt">API LOG</span><span class="badge" id="log-dock-badge"></span>';
    tab.addEventListener('click', () => setCollapsed(false));
    sb.appendChild(tab);

    const header = sb.querySelector('.sidebar-header');
    if (header) {
        const c = document.createElement('button');
        c.id = 'log-collapse'; c.type = 'button'; c.title = 'Collapse API log'; c.textContent = '⟩';
        c.addEventListener('click', () => setCollapsed(true));
        header.insertBefore(c, header.firstChild);
    }

    const grip = document.createElement('div');
    grip.id = 'log-resizer';
    grip.addEventListener('mousedown', (ev) => {
        ev.preventDefault();
        grip.classList.add('drag');
        document.body.style.userSelect = 'none';
        const move = (e) => {
            const width = Math.max(280, Math.min(720, window.innerWidth - e.clientX));
            document.documentElement.style.setProperty('--log-w', width + 'px');
        };
        const up = () => {
            document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up);
            grip.classList.remove('drag'); document.body.style.userSelect = '';
            const cur = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--log-w'), 10);
            if (cur) { try { localStorage.setItem(LS_W, String(cur)); } catch (e) { /* ignore */ } }
        };
        document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
    });
    sb.insertBefore(grip, sb.firstChild);
}

// Restore persisted log entries on page load (oldest first so newest ends up on top)
document.addEventListener('DOMContentLoaded', () => {
    _injectStyles();
    _ensureToolbar();
    _ensureDock();
    const stored = _loadFromStorage();
    stored.forEach(e => _renderEntry({ ...e, at: e.at || new Date(e.id).toISOString(), request: e.request, response: e.response }));
    _applyFilter();
});

// Builds the sidebar label for a competitor-partner call. The backend sends the exact
// partner endpoint it hit (e.g. "POST https://checkout-test.adyen.com/v72/sessions") in
// the X-Upstream-Endpoint header; showing it first makes it obvious which partner API
// endpoint backs each app call, so it can be looked up in their docs. Falls back to the
// plain "description - /our/route" label if the header is absent (older Lambda, errors
// before the call was made, or a non-partner route).
function withUpstream(res, description, localRoute) {
    const upstream = res && res.headers ? res.headers.get('X-Upstream-Endpoint') : null;
    return upstream
        ? `${upstream} — ${description} (via ${localRoute})`
        : `${description} - ${localRoute}`;
}

// `url` (optional) is the full URL the request was sent to; it is shown in the detail modal. If omitted, a
// full http(s) URL embedded in the endpoint label is used instead.
// `meta` (optional) is { duration_ms, request_id } — shown next to the status in the modal / sidebar.
function addToApiLog(method, endpoint, status, requestBody, responseBody, url, meta) {
    // Date.now() alone collides when two calls log in the same millisecond (entries would overwrite each other).
    let id = Date.now();
    while (apiLogHistory[id]) id += 1;
    const entry = { id, method, endpoint, status, request: requestBody, response: responseBody, url, meta, pinned: false, at: new Date().toISOString() };

    const stored = _loadFromStorage();
    stored.push(entry);
    _saveToStorage(stored);

    _renderEntry(entry);
}

// ---------------------------------------------------------------------
// Helpers used by the detail modal
// ---------------------------------------------------------------------
function _fullUrl(h) {
    return h.url || ((h.endpoint || '').match(/https?:\/\/[^\s)]+/) || [])[0] || '';
}

// Copy-pasteable cURL for the logged request. The secret key is never embedded — it comes from $CKO_SECRET_KEY.
function buildCurl(h) {
    if (!h || h.method === 'WEBHOOK') return '';
    let url = _fullUrl(h);
    if (!url) {
        const path = (h.endpoint || '').match(/^\s*(?:[A-Z]+\s+)?(\/[^\s(]*)/);
        if (!path) return '';
        url = `\${CKO_BASE_URL}${path[1]}`;
    }
    const q = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
    const lines = [`curl -X ${h.method} ${url.includes('${') ? `"${url}"` : q(url)}`,
        `  -H "Authorization: Bearer $CKO_SECRET_KEY"`,
        `  -H "Content-Type: application/json"`];
    const hasBody = h.request && typeof h.request === 'object' && Object.keys(h.request).length && !['GET', 'DELETE'].includes(h.method);
    if (hasBody) lines.push(`  -d ${q(JSON.stringify(h.request, null, 2))}`);
    return lines.join(' \\\n');
}

async function _copy(text, btn) {
    try { await navigator.clipboard.writeText(text); }
    catch (e) { const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); }
    if (btn) { const o = btn.dataset.label || btn.textContent; btn.dataset.label = o; btn.textContent = 'Copied ✓'; setTimeout(() => { btn.textContent = o; }, 1100); }
}

function _ensureModalUi() {
    const body = document.querySelector('#log-modal .modal-body');
    if (!body || document.getElementById('modal-tools')) return;

    const meta = document.createElement('div'); meta.id = 'modal-meta';
    const urlEl = document.createElement('div');
    urlEl.id = 'modal-req-url';
    urlEl.style.cssText = 'font-family:monospace; font-size:12px; padding:10px 12px; border-radius:8px; word-break:break-all; background:#0f172a; border:1px solid #334155; cursor:pointer; color:#7dd3fc;';
    urlEl.title = 'Click to copy URL';
    urlEl.onclick = () => _copy(urlEl.dataset.url || '', null);
    const tools = document.createElement('div'); tools.id = 'modal-tools';
    tools.innerHTML = `
        <button type="button" data-act="curl">Copy as cURL</button>
        <button type="button" data-act="req">Copy request</button>
        <button type="button" data-act="res">Copy response</button>
        <button type="button" data-act="pin">📌 Pin</button>`;
    body.insertBefore(tools, body.firstChild);
    body.insertBefore(urlEl, body.firstChild);
    body.insertBefore(meta, body.firstChild);

    tools.addEventListener('click', (ev) => {
        const b = ev.target.closest('button[data-act]');
        const h = apiLogHistory[window._openLogId];
        if (!b || !h) return;
        if (b.dataset.act === 'curl') _copy(buildCurl(h), b);
        if (b.dataset.act === 'req') _copy(JSON.stringify(h.request ?? {}, null, 2), b);
        if (b.dataset.act === 'res') _copy(JSON.stringify(h.response ?? null, null, 2), b);
        if (b.dataset.act === 'pin') togglePinApiLog(h.id);
    });
}

window.togglePinApiLog = function (id) {
    const h = apiLogHistory[id];
    if (!h) return;
    h.pinned = !h.pinned;
    const stored = _loadFromStorage();
    const s = stored.find(e => String(e.id) === String(id));
    if (s) { s.pinned = h.pinned; _saveToStorage(stored); }
    document.querySelector(`#log-entries .log-entry[data-id="${id}"]`)?.classList.toggle('pinned', h.pinned);
    const b = document.querySelector('#modal-tools [data-act="pin"]');
    if (b) { b.classList.toggle('on', h.pinned); b.textContent = h.pinned ? '📌 Pinned' : '📌 Pin'; }
    _applyFilter();
};

window.exportApiLog = function () {
    const entries = _loadFromStorage().map(e => ({
        at: e.at, method: e.method, url: _fullUrl(e) || e.endpoint, endpoint: e.endpoint, status: e.status,
        duration_ms: e.meta?.duration_ms, cko_request_id: e.meta?.request_id, pinned: !!e.pinned, request: e.request, response: e.response,
    }));
    const blob = new Blob([JSON.stringify(entries, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `cko-api-log-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};

// CLEAR removes everything except pinned entries (shift-click clears pinned too).
window.clearApiLogs = function (ev) {
    const all = !!((ev || window.event)?.shiftKey);
    const keep = all ? [] : _loadFromStorage().filter(e => e.pinned);
    const keepIds = new Set(keep.map(e => String(e.id)));
    document.querySelectorAll('#log-entries .log-entry').forEach(el => { if (!keepIds.has(el.dataset.id)) el.remove(); });
    Object.keys(apiLogHistory).forEach(id => { if (!keepIds.has(String(id))) delete apiLogHistory[id]; });
    if (keep.length) _saveToStorage(keep); else sessionStorage.removeItem(API_LOG_STORAGE_KEY);
    _applyFilter();
    console.log(keep.length ? `API Logs cleared (${keep.length} pinned kept).` : 'API Logs cleared.');
};

window.openLogModal = function (id) {
    const data = apiLogHistory[id];
    if (!data) return;
    _injectStyles();
    _ensureModalUi();
    window._openLogId = id;

    const fullUrl = _fullUrl(data);
    const urlEl = document.getElementById('modal-req-url');
    if (urlEl) {
        urlEl.dataset.url = fullUrl;
        urlEl.textContent = `${data.method || ''} ${fullUrl || data.endpoint || ''}`.trim();
    }
    const metaEl = document.getElementById('modal-meta');
    if (metaEl) {
        const parts = [`<span class="${data.status >= 400 ? 'bad' : 'ok'}"><b>${_esc(data.status)}</b></span>`];
        if (data.meta?.duration_ms != null) parts.push(`<span><b>${_esc(data.meta.duration_ms)}</b> ms</span>`);
        if (data.meta?.request_id) parts.push(`<span>cko-request-id <b>${_esc(data.meta.request_id)}</b></span>`);
        if (data.at) parts.push(`<span>${_esc(new Date(data.at).toLocaleString())}</span>`);
        metaEl.innerHTML = parts.join('');
    }
    const curlBtn = document.querySelector('#modal-tools [data-act="curl"]');
    if (curlBtn) { const c = buildCurl(data); curlBtn.disabled = !c; curlBtn.title = c ? 'Uses $CKO_SECRET_KEY — the key itself is never copied' : 'No request URL is known for this entry'; }
    const pinBtn = document.querySelector('#modal-tools [data-act="pin"]');
    if (pinBtn) { pinBtn.classList.toggle('on', !!data.pinned); pinBtn.textContent = data.pinned ? '📌 Pinned' : '📌 Pin'; }

    document.getElementById('modal-req-body').innerText = JSON.stringify(data.request, null, 2);
    document.getElementById('modal-res-body').innerText = JSON.stringify(data.response, null, 2);
    document.getElementById('log-modal').style.display = 'flex';
};

window.closeLogModal = function () {
    document.getElementById('log-modal').style.display = 'none';
};

window.onclick = function (event) {
    const modal = document.getElementById('log-modal');
    if (event.target == modal) closeLogModal();
};
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.getElementById('log-modal')?.style.display === 'flex') closeLogModal(); });
