// =============================================
// Side navigation behaviour (grouped left menu)
// The nav items are the same `.tab-link` buttons with onclick="openTab(event, '…')" the old tab bar used,
// so openTab() in script.js and every hook on `.tab-link` keep working unchanged. This file only adds:
//   - collapse the whole menu to icons (remembered)
//   - fold / unfold a group (remembered); a group holding the active page is always unfolded
//   - the mobile slide-over drawer (☰ button in the header)
// =============================================

(function () {
    const LS_NAV = 'cko-nav-collapsed';
    const LS_GROUPS = 'cko-nav-groups';

    function readGroups() { try { return JSON.parse(localStorage.getItem(LS_GROUPS) || '{}'); } catch (e) { return {}; } }

    function init() {
        const nav = document.getElementById('side-nav');
        if (!nav) return;

        // collapsed-to-icons state
        const setCollapsed = (on) => {
            nav.classList.toggle('collapsed', on);
            const b = document.getElementById('nav-collapse');
            if (b) { b.title = on ? 'Expand menu' : 'Collapse menu'; b.querySelector('.nav-ico').textContent = on ? '»' : '«'; }
            try { localStorage.setItem(LS_NAV, on ? '1' : '0'); } catch (e) { /* ignore */ }
        };
        setCollapsed(localStorage.getItem(LS_NAV) === '1');
        document.getElementById('nav-collapse')?.addEventListener('click', () => setCollapsed(!nav.classList.contains('collapsed')));

        // group folding
        const folded = readGroups();
        const saveGroups = () => {
            const o = {};
            nav.querySelectorAll('.nav-group').forEach(g => { if (g.classList.contains('collapsed')) o[g.dataset.group] = 1; });
            try { localStorage.setItem(LS_GROUPS, JSON.stringify(o)); } catch (e) { /* ignore */ }
        };
        nav.querySelectorAll('.nav-group').forEach(g => {
            if (folded[g.dataset.group]) g.classList.add('collapsed');
            const h = g.querySelector('.nav-heading');
            h.setAttribute('aria-expanded', String(!g.classList.contains('collapsed')));
            h.addEventListener('click', () => {
                g.classList.toggle('collapsed');
                h.setAttribute('aria-expanded', String(!g.classList.contains('collapsed')));
                saveGroups();
            });
        });
        // any navigation (user click OR a programmatic .click() such as the 3DS return) unfolds the group it lands in
        nav.addEventListener('click', (ev) => {
            const item = ev.target.closest('.nav-item');
            if (!item) return;
            const g = item.closest('.nav-group');
            if (g?.classList.contains('collapsed')) { g.classList.remove('collapsed'); g.querySelector('.nav-heading').setAttribute('aria-expanded', 'true'); saveGroups(); }
            document.body.classList.remove('nav-open');
            window.scrollTo({ top: 0 });
        }, true);

        // mobile drawer
        document.getElementById('nav-toggle')?.addEventListener('click', () => document.body.classList.toggle('nav-open'));
        document.getElementById('nav-backdrop')?.addEventListener('click', () => document.body.classList.remove('nav-open'));
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') document.body.classList.remove('nav-open'); });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
