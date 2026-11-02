// =============================================
// Account configuration (client side) — load right after frontend-config.js on every page.
// Keeps the sealed token the server issued for a visitor's own Checkout.com account, attaches it to every call to this app's API,
// and overrides the public values (public key / processing channel / currency account) the browser needs for Flow & wallets.
// The browser never holds the raw secrets: the token is an encrypted blob only the server can open (see backend account-config.js).
// =============================================

(function () {
    const KEY = 'cko-account-config';          // localStorage: { token, expiresAt, custom (masked), publicValues }
    const API = (window.APP_CONFIG && window.APP_CONFIG.apiBaseUrl) || '';

    function read() {
        try {
            const v = JSON.parse(localStorage.getItem(KEY) || 'null');
            if (v && v.token && v.expiresAt > Date.now()) return v;
        } catch (e) { /* ignore */ }
        localStorage.removeItem(KEY);
        return null;
    }
    function write(v) { v ? localStorage.setItem(KEY, JSON.stringify(v)) : localStorage.removeItem(KEY); }

    let state = read();

    // public values the browser needs for this account (Flow public key, processing channel …)
    function applyPublicValues() {
        const pv = state && state.publicValues;
        if (!pv || !window.APP_CONFIG) return;
        if (pv.publicKey) window.APP_CONFIG.publicKey = pv.publicKey;
        if (pv.processingChannelId) window.APP_CONFIG.processingChannelId = pv.processingChannelId;
        if (pv.currencyAccountId) window.APP_CONFIG.currencyAccountId = pv.currencyAccountId;
    }
    applyPublicValues();

    // attach the token to calls to this app's API (and only those)
    const nativeFetch = window.fetch.bind(window);
    window.fetch = function (input, init) {
        try {
            const url = typeof input === 'string' ? input : (input && input.url) || '';
            if (state && API && url.indexOf(API) === 0) {
                const headers = new Headers((init && init.headers) || (typeof input !== 'string' && input.headers) || {});
                if (!headers.has('Authorization')) headers.set('Authorization', 'Bearer acct.' + state.token);
                init = Object.assign({}, init, { headers });
            }
        } catch (e) { /* never block a request because of this */ }
        return nativeFetch(input, init).then(res => {
            if (state) {
                const s = res.headers.get('x-account-config');
                if (s === 'expired' || s === 'invalid') {
                    write(null); state = null;
                    document.dispatchEvent(new CustomEvent('account-config-changed', { detail: { reason: s } }));
                    if (window.showToast) window.showToast(`Your custom account configuration ${s === 'expired' ? 'expired' : 'is no longer valid'} — back on the default account.`, 'error');
                    renderBadge();
                }
            }
            return res;
        });
    };

    function renderBadge() {
        const el = document.getElementById('account-badge');
        if (!el) return;
        if (state) {
            const sk = state.custom && state.custom.secretKey && state.custom.secretKey.masked;
            el.className = 'account-badge custom';
            el.textContent = '🔑 Custom account' + (sk ? ' · ' + sk.slice(-8) : '');
            el.title = 'Requests use your own Checkout.com credentials (expires ' + new Date(state.expiresAt).toLocaleString() + '). Click to manage.';
        } else {
            el.className = 'account-badge';
            el.textContent = 'Default account';
            el.title = 'Requests use the server\'s default credentials. Click to open Settings.';
        }
        el.style.display = '';
    }

    window.AccountConfig = {
        get active() { return !!state; },
        get state() { return state; },
        set(sealed) {   // sealed = response of POST /account/seal
            state = sealed && sealed.token ? { token: sealed.token, expiresAt: sealed.expiresAt, custom: sealed.custom, publicValues: sealed.publicValues } : null;
            write(state);
        },
        reset() { state = null; write(null); },
        renderBadge,
    };

    function initBadge() {
        renderBadge();
        const el = document.getElementById('account-badge');
        if (el) el.addEventListener('click', () => {
            const b = document.getElementById('nav-settings');
            if (b) b.click(); else window.location.href = 'index.html';   // success/failure pages have no Settings tab
        });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initBadge); else initBadge();
})();
