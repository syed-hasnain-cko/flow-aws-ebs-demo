// =============================================
// API Log Module
// In-memory API call log displayed in the sidebar.
// Persists across page navigations via sessionStorage.
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

function _renderEntry(id, method, endpoint, status, requestBody, responseBody, url) {
    const logContainer = document.getElementById('log-entries');
    if (!logContainer) return;

    apiLogHistory[id] = { request: requestBody, response: responseBody, url, method, endpoint, status };

    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.onclick = () => openLogModal(id);

    const isError = status >= 400;
    const dotClass = isError ? 'dot-error' : 'dot-success';

    entry.innerHTML = `
        <div style="display:flex; align-items:center; margin-bottom:2px;">
            <span class="status-dot ${dotClass}"></span>
            <span class="method ${method.toLowerCase()}">${method}</span>
            <span style="color:#e2e8f0; font-weight:bold;">${status}</span>
        </div>
        <span class="endpoint-text">${endpoint}</span>
    `;

    logContainer.prepend(entry);
}

// Restore persisted log entries on page load (oldest first so newest ends up on top)
document.addEventListener('DOMContentLoaded', () => {
    const stored = _loadFromStorage();
    stored.forEach(e => _renderEntry(e.id, e.method, e.endpoint, e.status, e.request, e.response, e.url));
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
function addToApiLog(method, endpoint, status, requestBody, responseBody, url) {
    // Date.now() alone collides when two calls log in the same millisecond (entries would overwrite each other).
    let id = Date.now();
    while (apiLogHistory[id]) id += 1;

    const stored = _loadFromStorage();
    stored.push({ id, method, endpoint, status, request: requestBody, response: responseBody, url });
    _saveToStorage(stored);

    _renderEntry(id, method, endpoint, status, requestBody, responseBody, url);
}


window.clearApiLogs = function() {
    const logContainer = document.getElementById('log-entries');
    if (logContainer) {
        logContainer.innerHTML = '';
    }
    apiLogHistory = {};
    sessionStorage.removeItem(API_LOG_STORAGE_KEY);
    console.log("API Logs cleared.");
};


window.openLogModal = function(id) {
    const data = apiLogHistory[id];
    if (!data) return;
    // Full request URL line, created on first use so every page that has the modal gets it.
    let urlEl = document.getElementById('modal-req-url');
    if (!urlEl) {
        urlEl = document.createElement('div');
        urlEl.id = 'modal-req-url';
        urlEl.style.cssText = 'font-family:monospace; font-size:12px; padding:10px 12px; margin-bottom:12px; border-radius:8px; word-break:break-all; background:var(--bg-subtle, rgba(127,127,127,.12)); border:1px solid var(--border, rgba(127,127,127,.3)); cursor:pointer;';
        urlEl.title = 'Click to copy URL';
        const body = document.querySelector('#log-modal .modal-body');
        if (body) body.insertBefore(urlEl, body.firstChild);
        urlEl.onclick = () => { navigator.clipboard?.writeText(urlEl.dataset.url || '').catch(() => {}); };
    }
    const fullUrl = data.url || ((data.endpoint || '').match(/https?:\/\/[^\s)]+/) || [])[0] || '';
    urlEl.dataset.url = fullUrl;
    urlEl.textContent = `${data.method || ''} ${fullUrl || data.endpoint || ''}`.trim();
    document.getElementById('modal-req-body').innerText = JSON.stringify(data.request, null, 2);
    document.getElementById('modal-res-body').innerText = JSON.stringify(data.response, null, 2);
    document.getElementById('log-modal').style.display = 'flex';
};

window.closeLogModal = function() {
    document.getElementById('log-modal').style.display = 'none';
};

window.onclick = function(event) {
    const modal = document.getElementById('log-modal');
    if (event.target == modal) closeLogModal();
};
