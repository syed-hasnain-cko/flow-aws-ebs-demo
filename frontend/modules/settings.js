// =============================================
// Settings tab — manage the visitor's own Checkout.com account configuration.
// Talks to GET /account/config, POST /account/test, POST /account/seal (backend account-config.js).
// =============================================

(function () {
    const API = (window.APP_CONFIG && window.APP_CONFIG.apiBaseUrl) || '';
    const { $, esc, Store, confirmDialog } = window.Common;
    let cfg = null;
    const pendingClear = new Set();

    async function api(path, body) {
        const res = await fetch(`${API}${path}`, body === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        let data = null; try { data = await res.json(); } catch (e) { /* non-JSON */ }
        return { ok: res.ok, status: res.status, data };
    }

    const chip = (kind, text) => {
        const c = { custom: 'var(--primary)', default: 'var(--text-secondary)', unset: 'var(--error)', ok: 'var(--success)' }[kind] || 'var(--text-secondary)';
        return `<span style="display:inline-block;padding:2px 8px;border-radius:20px;font-size:10.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:${c};border:1px solid ${c};">${esc(text)}</span>`;
    };

    function render() {
        const keep = document.getElementById('settings-fields') ? typed() : {};
        const banner = $('settings-banner');
        if (!cfg) { banner.textContent = 'Could not load the configuration — is /account/config deployed?'; return; }
        const active = AccountConfig.active;
        banner.className = 'settings-banner ' + (active ? 'custom' : '');
        banner.innerHTML = !cfg.sealingAvailable
            ? '⚠️ Custom accounts are not enabled on this server (<code>CONFIG_SEAL_KEY</code> is not set). The defaults below are in use.'
            : active
                ? `🔑 <strong>Using your own account</strong> — expires ${esc(new Date(AccountConfig.state.expiresAt).toLocaleString())}. Fields you did not set still use the defaults.`
                : '✅ <strong>Using the server defaults</strong> (environment configuration of this deployment).';

        $('settings-fields').innerHTML = `
        <div class="settings-grid settings-head"><div>Setting</div><div>Server default (masked)</div><div>Your value</div></div>
        ${cfg.fields.map(f => {
            const d = cfg.defaults[f.key], c = cfg.custom[f.key], eff = cfg.effective[f.key];
            const clearing = pendingClear.has(f.key);
            return `<div class="settings-grid" data-key="${f.key}">
                <div><strong>${esc(f.label)}</strong><div class="settings-sub">${esc(f.hint)}</div></div>
                <div>${d.set ? `<code>${esc(d.masked)}</code>` : '<span class="settings-sub">not set on the server</span>'}<div style="margin-top:4px;">${chip(eff === 'custom' && !clearing ? 'default' : eff === 'unset' ? 'unset' : 'ok', eff === 'custom' && !clearing ? 'overridden' : eff === 'unset' ? 'missing' : 'in use')}</div></div>
                <div>
                    ${c.set && !clearing ? `<div style="margin-bottom:6px;"><code>${esc(c.masked)}</code> ${chip('custom', 'in use')} <button type="button" class="settings-link" data-clear="${f.key}">↺ use default</button></div>` : ''}
                    ${clearing ? `<div class="settings-sub" style="margin-bottom:6px;">Will revert to the default on save. <button type="button" class="settings-link" data-undo="${f.key}">undo</button></div>` : ''}
                    <input class="text-input settings-input" data-field="${f.key}" type="${f.secret ? 'password' : 'text'}" autocomplete="off" spellcheck="false" ${clearing || !cfg.sealingAvailable ? 'disabled' : ''}
                        placeholder="${c.set ? 'Enter a new value to replace' : 'Empty = use the default'}">
                </div>
            </div>`;
        }).join('')}`;
        Object.entries(keep).forEach(([k, v]) => { const i = document.querySelector(`.settings-input[data-field="${k}"]`); if (i && !i.disabled) i.value = v; });
        $('settings-webhook-url').textContent = `${API}/webhook`;
        ['settings-save', 'settings-test', 'settings-reset'].forEach(id => { $(id).disabled = !cfg.sealingAvailable && id !== 'settings-test'; });
        $('settings-reset').disabled = !active;
    }

    const typed = () => { const o = {}; document.querySelectorAll('.settings-input').forEach(i => { if (i.value.trim()) o[i.dataset.field] = i.value.trim(); }); return o; };
    function showErrors(errors) {
        document.querySelectorAll('.settings-err').forEach(e => e.remove());
        Object.entries(errors || {}).forEach(([k, msg]) => {
            const input = document.querySelector(`.settings-input[data-field="${k}"]`);
            if (input) input.insertAdjacentHTML('afterend', `<div class="settings-err" style="color:var(--error);font-size:12px;margin-top:4px;">${esc(msg)}</div>`);
        });
    }
    const busy = (on) => ['settings-save', 'settings-test', 'settings-reset'].forEach(id => { $(id).disabled = on; });

    async function load() {
        const r = await api('/account/config');
        cfg = r.ok ? r.data : null;
        render();
    }

    async function test() {
        busy(true); $('settings-test-result').innerHTML = 'Testing…';
        const r = await api('/account/test', { set: typed(), clear: [...pendingClear] });
        busy(false); render();
        if (r.status === 422) { $('settings-test-result').innerHTML = ''; showErrors(r.data.errors); return; }
        const rows = (r.data && r.data.results) || [];
        $('settings-test-result').innerHTML = rows.length
            ? rows.map(x => `<div style="margin:4px 0;font-size:13px;">${x.neutral ? 'ℹ️' : x.ok ? '✅' : '❌'} <strong>${esc(x.check)}</strong> — ${esc(x.detail)}</div>`).join('')
            : '<div class="settings-sub">Nothing to test — enter a secret key or an access key first.</div>';
    }

    async function save() {
        const set = typed();
        if (!Object.keys(set).length && !pendingClear.size) { showToast('Nothing to save — enter at least one value.', 'error'); return; }
        busy(true);
        const r = await api('/account/seal', { set, clear: [...pendingClear], ttlHours: Number($('settings-ttl').value) });
        busy(false);
        if (r.status === 422) { render(); showErrors(r.data.errors); showToast('Some values are not valid — see the highlighted fields.', 'error'); return; }
        if (!r.ok) { render(); showToast((r.data && r.data.error) || `Save failed (HTTP ${r.status})`, 'error'); return; }
        AccountConfig.set(r.data);
        if (r.data.token) localStorage.setItem('cko-webhook-offer', '1');   // webhooks.js offers to create a workflow after the reload
        showToast(r.data.token ? 'Saved — now using your account. Reloading…' : 'Back on the default account. Reloading…');
        setTimeout(() => location.reload(), 900);
    }

    async function resetAll() {
        if (!(await confirmDialog({ title: 'Reset to defaults?', text: 'Forget your custom configuration and go back to the server defaults.', confirmLabel: 'Reset', danger: true }))) return;
        AccountConfig.reset();
        showToast('Back on the default account. Reloading…');
        setTimeout(() => location.reload(), 600);
    }

        // =====================================================================
    // Browser storage panel
    // =====================================================================
    const kb = (chars) => chars >= 1024 * 100 ? `${(chars / 1024 / 1024).toFixed(2)} MB` : `${Math.max(1, Math.round(chars / 1024))} KB`;

    function renderStorage() {
        if (!$('store-table')) return;
        const rows = Store.usage();
        const total = rows.reduce((n, r) => n + r.chars, 0);
        const local = rows.filter(r => r.area === 'local').reduce((n, r) => n + r.chars, 0);
        const pct = Math.min(100, Math.round(local / Store.quotaChars * 100));
        $('store-meter-fill').style.width = pct + '%';
        $('store-meter-fill').style.background = pct > 80 ? 'var(--error)' : pct > 50 ? '#f59e0b' : 'var(--primary)';
        $('store-summary').textContent = `${kb(local)} of ~5 MB used in local storage (${pct}%) · ${rows.length} items, ${kb(total)} including this tab's session data`;
        $('store-table').innerHTML = rows.length ? `<table style="width:100%;border-collapse:collapse;font-size:12px;">
            <tr style="text-align:left;color:var(--text-secondary);font-size:10px;text-transform:uppercase;letter-spacing:.04em;"><th style="padding:5px 8px;">Data</th><th>Where</th><th>Entries</th><th>Size</th><th></th></tr>
            ${rows.map(r => `<tr style="border-top:1px solid var(--border);">
                <td style="padding:7px 8px;"><div style="color:var(--text-primary);font-weight:600;">${esc(r.label)}</div><div style="font-family:'JetBrains Mono',monospace;font-size:10.5px;color:var(--text-secondary);">${esc(r.key)}${r.sensitive ? ' · not exported' : ''}</div></td>
                <td style="color:var(--text-secondary);">${r.area === 'session' ? 'this tab' : 'browser'}</td>
                <td style="color:var(--text-secondary);">${r.entries ?? '—'}</td>
                <td style="color:var(--text-primary);white-space:nowrap;">${kb(r.chars)}</td>
                <td style="text-align:right;"><button type="button" class="copy-btn" data-store-clear="${esc(r.key)}" data-area="${r.area}">Clear</button></td></tr>`).join('')}
        </table>` : '<div style="font-size:12.5px;color:var(--text-secondary);">Nothing saved yet.</div>';
    }

    async function onStoreClick(e) {
        const b = e.target.closest('[data-store-clear]'); if (!b) return;
        const key = b.dataset.storeClear;
        const ok = await confirmDialog({ title: 'Clear this data?', text: `${(Store.POLICIES[key] || {}).label || key} will be removed from this browser. This cannot be undone.`, confirmLabel: 'Clear', danger: true });
        if (!ok) return;
        Store.clearKey(key, b.dataset.area);
        showToast('Cleared'); renderStorage();
    }

    function exportStorage() {
        const blob = new Blob([JSON.stringify(Store.exportAll(), null, 2)], { type: 'application/json' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
        a.download = `cko-demo-storage-${new Date().toISOString().slice(0, 10)}.json`; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }

    async function importStorage(file) {
        if (!file) return;
        try {
            const n = Store.importAll(JSON.parse(await file.text()));
            showToast(`Imported ${n} item${n === 1 ? '' : 's'} — reloading…`);
            setTimeout(() => location.reload(), 800);
        } catch (err) { showToast('Import failed: ' + err.message, 'error'); }
        $('store-file').value = '';
    }

    function initStorage() {
        if (!$('store-table')) return;
        $('store-table').addEventListener('click', onStoreClick);
        $('store-prune').addEventListener('click', () => { Store.prune(); renderStorage(); showToast('Old entries trimmed'); });
        $('store-export').addEventListener('click', exportStorage);
        $('store-import').addEventListener('click', () => $('store-file').click());
        $('store-file').addEventListener('change', (e) => importStorage(e.target.files[0]));
        renderStorage();
    }

    function init() {
        if (!$('settings-root')) return;
        initStorage();
        $('settings-test').addEventListener('click', test);
        $('settings-save').addEventListener('click', save);
        $('settings-reset').addEventListener('click', resetAll);
        $('settings-fields').addEventListener('click', (e) => {
            const c = e.target.closest('[data-clear]'), u = e.target.closest('[data-undo]');
            if (c) { pendingClear.add(c.dataset.clear); render(); }
            if (u) { pendingClear.delete(u.dataset.undo); render(); }
        });
        load();
    }
    window.refreshSettings = () => { renderStorage(); return load(); };   // called when the tab is opened
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
