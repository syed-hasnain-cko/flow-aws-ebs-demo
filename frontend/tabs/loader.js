// =============================================
// Tab HTML Loader
// Synchronously injects tab HTML into the DOM
// so all elements exist before module scripts run.
// =============================================

(function () {
    function loadSync(url) {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, false); // false = synchronous
        xhr.send(null);
        return xhr.status === 200 ? xhr.responseText : '';
    }

    // 1. Inject the main shell (header, tab buttons, sidebar, modal, loader overlay)
    document.getElementById('app').innerHTML = loadSync('tabs/main.html');

    // 2. Inject each tab's content into its shell div
    document.getElementById('flow-tab').innerHTML = loadSync('tabs/flow.html');
    document.getElementById('google-tab').innerHTML = loadSync('tabs/wallets.html');
    document.getElementById('setup-tab').innerHTML = loadSync('tabs/payment-setup.html');
})();
