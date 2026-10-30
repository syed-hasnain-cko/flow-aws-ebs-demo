// =============================================
// Partner Theme Bridge — Competitor Testing → Stripe / Adyen
// Translates the app's active theme (the top-right selector: light / dark / midnight / neon)
// into each partner SDK's own theming API, so their embedded UIs match the page instead of
// rendering with the vendor defaults.
//
//   Stripe split card fields   → `style` object            (element.update({ style }) — live)
//   Stripe Payment Element     → `appearance` (theme + variables + rules), set at init only
//   Stripe embedded Checkout   → `branding_settings` on the Checkout Session (iframe: page CSS can't reach it)
//   Adyen Drop-in / Components → --adyen-sdk-* CSS custom properties (live) + `styles` for the
//                                secured card-field iframes (needs a re-mount)
//
// Depends on: utils.js (getThemeTokens, 'themechange' event). Pure mapping — no network, no DOM writes
// except the Adyen CSS variables. Every consumer guards on `window.PartnerTheme` so a failure here can
// never stop a payment flow.
// =============================================

(function () {
    const FONT = "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    const ADYEN_VARS_ID = 'partner-theme-adyen-vars';

    // ── colour helpers ──────────────────────────────────────────────────────
    const probe = document.createElement('canvas').getContext('2d');

    // Any CSS colour → opaque #rrggbb. Partners differ on what they accept (Stripe branding needs strict
    // 6-digit hex and rejects rgb()/3-digit; Appearance variables reject rgba()/var()), so normalise once.
    function toHex(color, over) {
        if (!color) return '#000000';
        probe.fillStyle = '#000000';
        probe.fillStyle = color;
        const v = probe.fillStyle;                       // '#rrggbb' for opaque colours, 'rgba(r, g, b, a)' otherwise
        if (v.startsWith('#')) return v.length === 4 ? '#' + [...v.slice(1)].map(c => c + c).join('') : v;
        const m = v.match(/rgba?\(([^)]+)\)/);
        if (!m) return '#000000';
        const [r, g, b, a = 1] = m[1].split(',').map(Number);
        const base = over ? rgb(over) : [255, 255, 255];
        const mix = (c, i) => Math.round(c * a + base[i] * (1 - a));
        return '#' + [mix(r, 0), mix(g, 1), mix(b, 2)].map(n => n.toString(16).padStart(2, '0')).join('');
    }
    const rgb = (hex) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
    function luminance(hex) {
        const [r, g, b] = rgb(hex).map(c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }
    // Black or white text, whichever contrasts better on `hex` (for text sitting on the primary colour).
    const readableOn = (hex) => (luminance(hex) > 0.4 ? '#0f172a' : '#ffffff');

    function tokens() {
        const t = (typeof getThemeTokens === 'function') ? getThemeTokens() : {};
        const page = toHex(t.bgPage || '#ffffff');
        const h = (c) => toHex(c, page);
        return {
            primary: h(t.primary), primaryGlow: t.primaryGlow || 'rgba(0,82,255,.18)', bgPage: page, bgCard: h(t.bgCard), bgInput: h(t.bgInput), bgSubtle: h(t.bgSubtle),
            text: h(t.textPrimary), textSecondary: h(t.textSecondary), textMuted: h(t.textMuted),
            border: h(t.border), borderStrong: h(t.borderStrong), success: h(t.success), error: h(t.error),
        };
    }
    const isDark = () => luminance(tokens().bgPage) < 0.35;

    // ── Stripe ──────────────────────────────────────────────────────────────
    // Legacy split card elements (cardNumber / cardExpiry / cardCvc) are NOT covered by the Appearance API,
    // they take the older `style` object. The surrounding .stripe-split-field box already follows the page theme.
    function stripeCardStyle() {
        const t = tokens();
        return {
            base: {
                color: t.text, fontFamily: FONT, fontSize: '16px', fontSmoothing: 'antialiased', iconColor: t.textSecondary,
                '::placeholder': { color: t.textMuted },
                ':-webkit-autofill': { color: t.text },
            },
            invalid: { color: t.error, iconColor: t.error },
        };
    }

    // Payment Element (Checkout Elements SDK). `night` is Stripe's own dark theme; the variables then tie it to our palette.
    // NOTE: colorPrimary / colorBackground / colorText / colorDanger / colorSuccess must be opaque colours (no rgba / var()).
    function stripeAppearance() {
        const t = tokens();
        return {
            theme: isDark() ? 'night' : 'stripe',
            variables: {
                colorPrimary: t.primary, colorBackground: t.bgInput, colorText: t.text, colorDanger: t.error, colorSuccess: t.success,
                colorTextSecondary: t.textSecondary, colorTextPlaceholder: t.textMuted,
                fontFamily: FONT, borderRadius: '8px', spacingUnit: '4px',
            },
            rules: {
                '.Input': { backgroundColor: t.bgInput, border: `1px solid ${t.border}`, boxShadow: 'none' },
                '.Input:focus': { borderColor: t.primary, boxShadow: `0 0 0 3px ${t.primaryGlow}` },
                '.Label': { color: t.textSecondary },
                '.Tab': { backgroundColor: t.bgInput, border: `1px solid ${t.border}` },
                '.Tab--selected': { borderColor: t.primary, backgroundColor: t.bgInput },
            },
        };
    }

    // Embedded Checkout lives in a Stripe-owned iframe — host CSS cannot reach it. The one per-session lever is
    // `branding_settings`. Stripe requires 6-digit hex colours; font_family / border_style are fixed enums.
    function stripeBranding() {
        const t = tokens();
        return { background_color: t.bgCard, button_color: t.primary, border_style: 'rounded', font_family: 'inter' };
    }

    // ── Adyen ───────────────────────────────────────────────────────────────
    // Adyen Web v6 draws everything outside the card iframes with --adyen-sdk-* custom properties (each with a light
    // fallback baked into adyen.css), so declaring them on :root re-themes Drop-in and Components instantly.
    function adyenVars() {
        const t = tokens();
        const onPrimary = readableOn(t.primary);
        return {
            '--adyen-sdk-color-background-primary': t.bgCard,
            '--adyen-sdk-color-background-secondary': t.bgSubtle,
            '--adyen-sdk-color-background-secondary-hover': t.bgInput,
            '--adyen-sdk-color-background-secondary-active': t.bgInput,
            '--adyen-sdk-color-background-tertiary': t.bgInput,
            '--adyen-sdk-color-background-disabled': t.bgSubtle,
            '--adyen-sdk-color-background-inverse-primary': t.primary,
            '--adyen-sdk-color-background-inverse-primary-hover': t.primary,
            '--adyen-sdk-color-background-always-dark': t.bgPage,
            '--adyen-sdk-color-background-critical-strong': t.error,
            '--adyen-sdk-color-label-primary': t.text,
            '--adyen-sdk-color-label-secondary': t.textSecondary,
            '--adyen-sdk-color-label-tertiary': t.textMuted,
            '--adyen-sdk-color-label-disabled': t.textMuted,
            '--adyen-sdk-color-label-on-color': onPrimary,
            '--adyen-sdk-color-label-highlight': t.primary,
            '--adyen-sdk-color-label-critical': t.error,
            '--adyen-sdk-color-label-success': t.success,
            '--adyen-sdk-color-outline-primary': t.border,
            '--adyen-sdk-color-outline-primary-hover': t.borderStrong,
            '--adyen-sdk-color-outline-primary-active': t.primary,
            '--adyen-sdk-color-outline-secondary': t.borderStrong,
            '--adyen-sdk-color-outline-tertiary': t.textMuted,
            '--adyen-sdk-color-outline-disabled': t.border,
            '--adyen-sdk-color-outline-critical': t.error,
            '--adyen-sdk-color-separator-primary': t.border,
            '--adyen-sdk-focus-ring-color': t.primaryGlow,
        };
    }

    function applyAdyenVars() {
        let style = document.getElementById(ADYEN_VARS_ID);
        if (!style) { style = document.createElement('style'); style.id = ADYEN_VARS_ID; document.head.appendChild(style); }
        // Appended last so it wins over adyen.css's own :root fallbacks.
        style.textContent = ':root {\n' + Object.entries(adyenVars()).map(([k, v]) => `  ${k}: ${v};`).join('\n') + '\n}';
    }

    // The card number / expiry / CVC inputs are secured iframes; only this `styles` object reaches inside them.
    function adyenFieldStyles() {
        const t = tokens();
        return {
            base: { color: t.text, caretColor: t.primary },
            error: { color: t.error },
            placeholder: { color: t.textMuted },
            validated: { color: t.text },
        };
    }

    // ── change notifications ────────────────────────────────────────────────
    const listeners = [];
    function onChange(fn) { listeners.push(fn); }
    let timer;
    document.addEventListener('themechange', () => {
        applyAdyenVars();                                   // instant, no re-mount needed
        clearTimeout(timer);
        timer = setTimeout(() => listeners.forEach(fn => { try { fn(); } catch (e) { console.warn('[PartnerTheme] listener failed:', e); } }), 150);
    });
    applyAdyenVars();

    window.PartnerTheme = { tokens, isDark, toHex, stripeCardStyle, stripeAppearance, stripeBranding, adyenVars, adyenFieldStyles, applyAdyenVars, onChange };
})();
