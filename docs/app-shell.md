# App shell: left navigation + docked API log

> Moved verbatim from CLAUDE.md. Update this page (not CLAUDE.md) when you change this area.

## Session Summary (2026-10-31) — App shell redesign: grouped left nav + docked API log

The horizontal tab bar (10 tabs, last one hidden under the floating log) was replaced so the app can keep growing.

- **Left navigation** (`tabs/main.html`, CSS at the end of `style.css`, behaviour in `modules/nav.js`): groups **Accept payments** (Checkout Flow, Wallets, Payment Setup, Authorization Types) · **Manage** (Payments, Disputes, Payouts) · **Standalone** (3DS, Network Tokens, Account Updater & RTAU, Card Metadata, Vault) · **Tools** (Forward API, Competitor Testing). Groups fold (remembered, `cko-nav-groups`); the whole menu collapses to icons (remembered, `cko-nav-collapsed`); ≤900px it is a ☰ slide-over drawer.
- **Adding a page**: add a `<div id="x-tab" class="tab-content">` + `loader.js` injection as before, then ONE nav item inside the right `.nav-group` in `main.html`: `<button class="tab-link nav-item" onclick="openTab(event, 'x-tab')" title="…"><span class="nav-ico">🆕</span><span class="nav-label">…</span></button>`. They are still `.tab-link` buttons calling `openTab(event, …)` — `script.js`, the initial-tab click, the 3DS return and the Payments-tab hook all work unchanged. A new group = another `.nav-group` block.
- **Standalone products are nav items** (`data-sa-nav="3ds|nt|au|meta|vault"`, onclick `openTab(event,'standalone-tab'); selectStandaloneProduct('<key>')`; `window.selectStandaloneProduct = selectProduct` in `standalone.js`). The in-page product picker is kept in the DOM but hidden (code toggles `data-sa-product`). A new Standalone product = add its panel + a `data-sa-nav` item.
- **API log is docked** on the right (index.html only: `loader.js` adds `body.app-docked`; success/failure pages keep the floating log): pushes the content instead of covering it, collapses to a slim tab with a call-count badge, drag the left edge to resize (`cko-log-w`, 280–720px), state remembered (`cko-log-collapsed`; default collapsed below 1500px wide so forms keep their room). ≤900px it keeps the old bottom drawer + 📋 button. Built in `api-log.js` (`_ensureDock`).
- Layout: `.app-body` (flex) → `nav.side-nav` · `main.wrapper` (max 1100px) · `#api-sidebar`; header is full width in this layout. CSS cache-buster: `style.css?v=…` in `index.html` — bump together with the JS ones.
