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

function _renderEntry(id, method, endpoint, status, requestBody, responseBody) {
    const logContainer = document.getElementById('log-entries');
    if (!logContainer) return;

    apiLogHistory[id] = { request: requestBody, response: responseBody };

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
    stored.forEach(e => _renderEntry(e.id, e.method, e.endpoint, e.status, e.request, e.response));
});

function addToApiLog(method, endpoint, status, requestBody, responseBody) {
    const id = Date.now();

    const stored = _loadFromStorage();
    stored.push({ id, method, endpoint, status, request: requestBody, response: responseBody });
    _saveToStorage(stored);

    _renderEntry(id, method, endpoint, status, requestBody, responseBody);
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
