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

    window.Common = { $, val, esc, money };
})();
