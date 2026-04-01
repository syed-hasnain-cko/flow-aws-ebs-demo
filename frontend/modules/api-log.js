// =============================================
// API Log Module
// In-memory API call log displayed in the sidebar.
// Depends on: nothing (pure DOM + memory)
// =============================================

let apiLogHistory = [];

function addToApiLog(method, endpoint, status, requestBody, responseBody) {
    const logContainer = document.getElementById('log-entries');
    const entryId = Date.now();

    apiLogHistory[entryId] = { request: requestBody, response: responseBody };

    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.onclick = () => openLogModal(entryId);

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


window.clearApiLogs = function() {
    const logContainer = document.getElementById('log-entries');
    if (logContainer) {
        logContainer.innerHTML = '';
    }
    apiLogHistory = [];
    console.log("API Logs cleared.");
};


window.openLogModal = function(id) {
    const data = apiLogHistory[id];
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
