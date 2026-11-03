// =============================================
// Shared helpers — loaded before every feature module (index.html).
// Modules pull what they need:  const { $, val, esc, money } = window.Common;
// =============================================

(function () {
    const $ = (id) => document.getElementById(id);
    const val = (id) => $(id)?.value ?? '';
    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    // Minor units → localised currency string. Uses the CURRENCIES table (data.js) for the exponent, default 100.
    function money(amount, currency) {
        if (amount === undefined || amount === null) return '—';
        const base = (typeof CURRENCIES !== 'undefined' && CURRENCIES.find(c => c.iso4217 === currency)?.base) || 100;
        const n = amount / base;
        try { return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(n); }
        catch (e) { return `${n.toFixed(Math.log10(base))} ${currency || ''}`.trim(); }
    }

    // =====================================================================
    // Store — safe, bounded access to localStorage / sessionStorage
    //   Store.getJSON(key, fallback) · Store.setJSON(key, value) · Store.get/set/remove (raw strings)
    //   Writes never throw: on a full quota the oldest data of the keys listed in POLICIES is pruned and the write retried.
    //   Store.prune() trims expired / surplus entries (runs once on every page load).
    //   Store.usage(), Store.exportAll(), Store.importAll(obj), Store.clearKey(key, area) back the Settings → Browser storage panel.
    // =====================================================================
    const DAY = 86400000;
    // Everything the app keeps under cko-*. `kind` says how to trim it: map = { id: entry }, list = newest first.
    const POLICIES = {
        'cko-suite-3ds-consumed':   { label: '3DS · sessions already paid', kind: 'map', maxAgeDays: 30, maxEntries: 300, ts: (e) => e && e.at },
        'cko-suite-3ds-snapshots':  { label: '3DS · saved tab states (hosted redirect)', kind: 'map', maxAgeDays: 7, maxEntries: 10, ts: (e) => e && e.saved_at, heavy: true },
        'cko-suite-3ds-last-sid':   { label: '3DS · last session id' },
        'cko-links-history':        { label: 'Links · recent links / pages', kind: 'list', maxEntries: 12 },
        'cko-suite-instruments':    { label: 'Standalone · saved cards (src_)', kind: 'list', maxEntries: 200 },
        'cko-suite-network-tokens': { label: 'Standalone · network tokens' },
        'cko-vault-directory':      { label: 'Vault · customers & instruments directory' },
        'cko-forward-config':       { label: 'Forward API · configuration', sensitive: true },
        'cko-forward-custom-destinations': { label: 'Forward API · custom destinations' },
        'cko-forward-destination-auth':    { label: 'Forward API · destination credentials', sensitive: true },
        'cko-account-config':       { label: 'Settings · sealed custom account token', sensitive: true },
        'cko-webhook-offer':        { label: 'Webhooks · pending offer flag' },
        'cko-api-log':              { label: 'API log (this tab session)', area: 'session' },
        'cko-suite-wh-seen':        { label: 'Standalone · webhook ids seen', area: 'session' },
        'cko-suite-rtau-results':   { label: 'Standalone · RTAU results', area: 'session' },
        'cko-suite-ntc-results':    { label: 'Standalone · network-token scenario results', area: 'session' },
        'cko-demo-theme':           { label: 'Theme' }, 'cko-nav-groups': { label: 'Navigation · folded groups' }, 'cko-nav-collapsed': { label: 'Navigation · collapsed' },
        'cko-log-w': { label: 'API log · width' }, 'cko-log-collapsed': { label: 'API log · collapsed' },
    };
    const QUOTA_CHARS = 5 * 1024 * 1024;   // typical per-origin limit (~5M characters)
    const area = (a) => { try { return a === 'session' ? window.sessionStorage : window.localStorage; } catch (e) { return null; } };
    const isQuota = (e) => e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22 || e.code === 1014);
    let warned = false;

    function trimValue(key, raw) {
        const pol = POLICIES[key];
        if (!pol || !pol.kind) return raw;
        let v; try { v = JSON.parse(raw); } catch (e) { return raw; }
        const now = Date.now();
        if (pol.kind === 'list' && Array.isArray(v)) v = v.slice(0, pol.maxEntries);
        else if (pol.kind === 'map' && v && typeof v === 'object') {
            let ents = Object.entries(v);
            if (pol.maxAgeDays) ents = ents.filter(([, e]) => { const t = pol.ts(e); return !t || now - t <= pol.maxAgeDays * DAY; });
            ents.sort((a, b) => (pol.ts(b[1]) || 0) - (pol.ts(a[1]) || 0));
            v = Object.fromEntries(ents.slice(0, pol.maxEntries));
        }
        return JSON.stringify(v);
    }

    const Store = {
        POLICIES,
        get(key, a) { try { return area(a).getItem(key); } catch (e) { return null; } },
        getJSON(key, fallback, a) { try { const r = area(a).getItem(key); return r === null ? fallback : JSON.parse(r); } catch (e) { return fallback; } },
        remove(key, a) { try { area(a).removeItem(key); } catch (e) { /* ignore */ } },
        // Returns true when stored. Never throws; frees space (oldest data first) and retries once if the quota is hit.
        set(key, str, a) {
            const st = area(a); if (!st) return false;
            const pol = POLICIES[key];
            if (pol && pol.kind) str = trimValue(key, str);
            try { st.setItem(key, str); return true; }
            catch (e) {
                if (!isQuota(e)) return false;
                Store.prune(true);
                try { st.setItem(key, str); return true; } catch (e2) { /* still full */ }
                if (key !== 'cko-suite-3ds-snapshots') {                      // last resort: the heavy snapshots go first
                    Store.remove('cko-suite-3ds-snapshots');
                    try { st.setItem(key, str); return true; } catch (e3) { /* give up */ }
                }
                if (!warned && typeof window.showToast === 'function') { warned = true; window.showToast('Browser storage is full — open Settings → Browser storage to free space', 'error'); }
                return false;
            }
        },
        setJSON(key, value, a) { return Store.set(key, JSON.stringify(value), a); },
        // Drops expired / surplus entries of every managed key. `hard` also halves the keys that are still large.
        prune(hard) {
            Object.keys(POLICIES).forEach(key => {
                const pol = POLICIES[key]; if (!pol.kind) return;
                const st = area(pol.area); const raw = st && st.getItem(key); if (!raw) return;
                let out = trimValue(key, raw);
                if (hard && pol.kind === 'map' && out.length > 20000) {
                    try { const o = JSON.parse(out); const keep = Object.entries(o).sort((a, b) => (pol.ts(b[1]) || 0) - (pol.ts(a[1]) || 0)).slice(0, Math.max(1, Math.floor(Object.keys(o).length / 2))); out = JSON.stringify(Object.fromEntries(keep)); } catch (e) { /* ignore */ }
                }
                if (out !== raw) { try { st.setItem(key, out); } catch (e) { /* ignore */ } }
            });
        },
        // [{ key, area, label, chars, entries, sensitive, managed }] for every cko-* key, biggest first
        usage() {
            const rows = [];
            ['local', 'session'].forEach(a => {
                const st = area(a); if (!st) return;
                for (let i = 0; i < st.length; i++) {
                    const key = st.key(i); if (!key || !key.startsWith('cko-')) continue;
                    const raw = st.getItem(key) || ''; const pol = POLICIES[key];
                    let entries = null; try { const v = JSON.parse(raw); entries = Array.isArray(v) ? v.length : (v && typeof v === 'object' ? Object.keys(v).length : null); } catch (e) { /* plain string */ }
                    rows.push({ key, area: a, label: (pol && pol.label) || key, chars: raw.length + key.length, entries, sensitive: !!(pol && pol.sensitive), managed: !!pol });
                }
            });
            return rows.sort((x, y) => y.chars - x.chars);
        },
        quotaChars: QUOTA_CHARS,
        clearKey(key, a) { Store.remove(key, a); },
        // Backup of the saved data (cards, tokens, history…). Credentials and the sealed account token are never exported.
        exportAll() {
            const items = {};
            Store.usage().filter(r => r.area === 'local' && !r.sensitive).forEach(r => { items[r.key] = Store.get(r.key); });
            return { format: 'cko-demo-storage', version: 1, exported_at: new Date().toISOString(), items };
        },
        importAll(obj) {
            if (!obj || obj.format !== 'cko-demo-storage' || typeof obj.items !== 'object') throw new Error('Not a storage backup from this app');
            let n = 0;
            Object.entries(obj.items).forEach(([k, v]) => {
                if (!k.startsWith('cko-') || typeof v !== 'string' || (POLICIES[k] && POLICIES[k].sensitive)) return;
                if (Store.set(k, v)) n++;
            });
            return n;
        },
    };
    Store.prune();   // keep the data bounded on every page load

    // In-page confirmation dialog (replaces window.confirm). Resolves true / false.
    function confirmDialog({ title, text, confirmLabel = 'Confirm', danger = false }) {
        return new Promise((resolve) => {
            const back = document.createElement('div');
            back.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;padding:16px;';
            back.innerHTML = `<div role="dialog" aria-modal="true" style="width:100%;max-width:420px;background:var(--bg-card);color:var(--text-primary);border:1px solid var(--border);border-radius:14px;box-shadow:0 20px 50px rgba(0,0,0,.35);padding:20px;">
                <div style="font-size:17px;font-weight:700;margin-bottom:8px;">${esc(title)}</div>
                <div style="font-size:13px;color:var(--text-secondary);line-height:1.6;">${esc(text)}</div>
                <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px;">
                    <button type="button" class="copy-btn" data-m="no">Cancel</button>
                    <button type="button" class="main-button" data-m="yes" style="${danger ? 'background:var(--error);border-color:var(--error);color:#fff;' : ''}">${esc(confirmLabel)}</button>
                </div></div>`;
            const done = (v) => { document.removeEventListener('keydown', onKey, true); back.remove(); resolve(v); };
            const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); done(false); } };
            back.addEventListener('click', (e) => { if (e.target === back) return done(false); const m = e.target.closest('[data-m]'); if (m) done(m.dataset.m === 'yes'); });
            document.addEventListener('keydown', onKey, true);
            document.body.appendChild(back);
            back.querySelector('[data-m="yes"]').focus();
        });
    }

    window.Common = { $, val, esc, money, Store, confirmDialog };
})();
