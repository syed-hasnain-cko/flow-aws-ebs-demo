// =============================================
// Explicit state machines — loaded right after common.js.
//
//   Common.machine(name, { initial, states: { idle: { START: 'waiting' }, … } })
//       → { state, is(s…), can(evt), send(evt, payload), subscribe(fn), reset() }
//     Unknown events for the current state are ignored (and counted), never thrown.
//     Every machine is listed in window.CkoMachines so a person, a test or an AI agent can read what the page is doing:
//       CkoMachines.snapshot()  → [{ name, state, since, history: [...] }]
//       CkoMachines.get('dispute-action-wait')
//     A machine can mirror its state onto an element:  data-machine="<name>" data-state="<state>"  (+ aria-live status text).
//
//   Common.waitFor({ name, check, intervalMs, timeoutMs, … })
//       The "wait until something happens" loop that used to be copied into seven modules.
//       idle → waiting → found | timeout | failed | cancelled   (any terminal state can START again)
//       Ticks never overlap (a slow request cannot be doubled by the timer), a new wait with the same name cancels the old one.
//
//   Common.waitForWebhook(id, { name, match, … })
//       waitFor() specialized for GET /webhook-event?paymentId=<id> (the app's shared webhook slot, 2 minutes by default).
//
//   Common.busyStart(btns, label)  → done() | null      idle → busy → idle for a button (group)
//       Disables the button(s), shows `label` on the first one, sets aria-busy + data-state="busy". Returns null when it is already
//       busy (a double click) — the caller just returns. Call done() in `finally`; it restores text, enabled state and data-state.
//   Common.busy(btns, label, fn, { after })  → fn's result (undefined when already busy). Same, as a wrapper.
//       `btns` = id, element or array of them. Machine name: "busy:<first id>" (visible in CkoMachines.snapshot()).
// =============================================
(function () {
    const registry = new Map();
    const HISTORY = 12;

    function machine(name, spec) {
        const states = spec.states || {};
        if (!states[spec.initial]) throw new Error(`machine "${name}": unknown initial state "${spec.initial}"`);
        const listeners = new Set();
        const m = {
            name,
            state: spec.initial,
            since: Date.now(),
            ignored: 0,
            history: [],
            el: null,
            is: (...s) => s.includes(m.state),
            can: (evt) => Object.prototype.hasOwnProperty.call(states[m.state] || {}, evt),
            subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
            // Mirror the state on an element: data-machine / data-state, and (optionally) a human text through labels[state].
            bind(el, labels) { m.el = el || null; m.labels = labels || null; paint(); return m; },
            send(evt, payload) {
                const to = (states[m.state] || {})[evt];
                if (to === undefined) { m.ignored++; return false; }                // not allowed from here — ignore
                const from = m.state;
                m.state = typeof to === 'function' ? to(payload, m) : to;
                m.since = Date.now();
                m.history.push({ from, evt, to: m.state, at: m.since });
                if (m.history.length > HISTORY) m.history.shift();
                paint();
                listeners.forEach(fn => { try { fn(m.state, from, evt, payload); } catch (e) { console.error(`[machine ${name}]`, e); } });
                return true;
            },
            reset() { m.state = spec.initial; m.since = Date.now(); paint(); },
            dispose() { listeners.clear(); if (registry.get(name) === m) registry.delete(name); },
        };
        function paint() {
            if (!m.el) return;
            m.el.dataset.machine = name;
            m.el.dataset.state = m.state;
            m.el.setAttribute('aria-live', 'polite');
            const label = m.labels && m.labels[m.state];
            if (typeof label === 'string') m.el.textContent = label;
        }
        registry.set(name, m);
        return m;
    }

    window.CkoMachines = {
        get: (name) => registry.get(name) || null,
        names: () => [...registry.keys()],
        snapshot: () => [...registry.values()].map(m => ({ name: m.name, state: m.state, since: m.since, ignored: m.ignored, history: m.history.slice() })),
    };

    // ---------------------------------------------------------------------------------------------------------------
    const WAIT = {
        initial: 'idle',
        states: {
            idle:      { START: 'waiting' },
            waiting:   { FOUND: 'found', TIMEOUT: 'timeout', FAIL: 'failed', CANCEL: 'cancelled', START: 'waiting' },
            found:     { START: 'waiting' },
            timeout:   { START: 'waiting' },
            failed:    { START: 'waiting' },
            cancelled: { START: 'waiting' },
        },
    };
    const active = new Map();                                                    // name → handle, so a restart cancels the previous wait

    // opts: name (required) · check: async () => value | null (null/undefined/false = keep waiting; throw = transient, retry;
    //       throw with .fatal = true = stop as failed) · intervalMs (3000) · timeoutMs (120000)
    //       el: element that mirrors the state · text: { waiting, found, timeout, failed } (string or fn(value|error))
    //       onFound(value) · onTimeout() · onFail(err) · onSettle(state, value)
    function waitFor(opts) {
        const { name, check, intervalMs = 3000, timeoutMs = 120000, el = null, text = {}, onFound, onTimeout, onFail, onSettle } = opts;
        if (!name || typeof check !== 'function') throw new Error('waitFor needs a name and a check()');
        if (active.has(name)) active.get(name).cancel();
        const m = registry.get(name) && registry.get(name).spec === WAIT ? registry.get(name) : machine(name, WAIT);
        m.spec = WAIT;
        const started = Date.now();
        let timer = null;
        const say = (key, arg) => {
            const t = text[key];
            const s = typeof t === 'function' ? t(arg) : t;
            if (el && typeof s === 'string') { el.textContent = s; }
        };
        m.bind(el);
        m.send('START');
        say('waiting');

        let settled = false;
        const finish = (evt, arg, cb) => {
            if (settled) return;
            settled = true; clearTimeout(timer); active.delete(name);
            m.send(evt, arg);
            say({ FOUND: 'found', TIMEOUT: 'timeout', FAIL: 'failed' }[evt], arg);
            try { if (cb) cb(arg); } catch (e) { console.error(`[waitFor ${name}]`, e); }
            try { if (onSettle) onSettle(m.state, arg); } catch (e) { console.error(`[waitFor ${name}]`, e); }
        };
        const handle = {
            name, machine: m,
            cancel() { if (settled) return; settled = true; clearTimeout(timer); active.delete(name); m.send('CANCEL'); if (onSettle) { try { onSettle('cancelled'); } catch (e) { /* ignore */ } } },
        };
        const tick = async () => {
            if (settled) return;
            if (Date.now() - started > timeoutMs) return finish('TIMEOUT', undefined, onTimeout);
            try {
                const v = await check();
                if (settled) return;                                             // cancelled / restarted while the request was in flight
                if (v !== undefined && v !== null && v !== false) return finish('FOUND', v, onFound);
            } catch (e) {
                if (e && e.fatal) return finish('FAIL', e, onFail);
                /* transient — try again on the next tick */
            }
            if (!settled) timer = setTimeout(tick, intervalMs);
        };
        timer = setTimeout(tick, intervalMs);
        active.set(name, handle);
        return handle;
    }

    // GET /webhook-event?paymentId=<id> — the slot is consumed by the read, so a non-matching event is dropped (as before).
    // opts: the waitFor options (name required) plus  match(event) → boolean  (default: any event)  and  logLabel (false to skip the API log)
    function waitForWebhook(id, opts) {
        const { match, base = (window.APP_CONFIG && window.APP_CONFIG.apiBaseUrl) || '', logEvent = true, ...rest } = opts;
        return waitFor({
            intervalMs: 3000, ...rest,
            async check() {
                const res = await fetch(`${base}/webhook-event?paymentId=${encodeURIComponent(id)}`);
                if (res.status === 404) return null;
                const ev = await res.json();
                if (!ev || !ev.found) return null;
                if (logEvent && typeof window.addToApiLog === 'function') window.addToApiLog('WEBHOOK', `${ev.type} — /webhook`, 200, {}, ev.data);
                if (match && !match(ev)) return null;
                return ev;
            },
        });
    }

    const BUSY = { initial: 'idle', states: { idle: { START: 'busy' }, busy: { DONE: 'idle' } } };
    function busyStart(btns, label) {
        const els = [].concat(btns).map(b => typeof b === 'string' ? document.getElementById(b) : b).filter(Boolean);
        if (!els.length) return () => {};                                        // nothing to guard — behave like "no button"
        if (els.some(b => b.disabled)) return null;                              // already processing
        const name = `busy:${els[0].id || 'button'}`;
        const m = registry.get(name) || machine(name, BUSY);
        const originals = els.map(b => b.textContent);
        m.send('START');
        els.forEach((b, i) => { b.disabled = true; b.setAttribute('aria-busy', 'true'); b.dataset.state = 'busy'; if (i === 0 && label) b.textContent = label; });
        let ended = false;
        return function done() {
            if (ended) return; ended = true;
            els.forEach((b, i) => { b.disabled = false; b.removeAttribute('aria-busy'); b.dataset.state = 'idle'; if (label) b.textContent = originals[i]; });
            m.send('DONE');
        };
    }
    async function busy(btns, label, fn, opts) {
        const done = busyStart(btns, label);
        if (!done) return undefined;
        try { return await fn(); }
        finally { done(); if (opts && opts.after) opts.after(); }
    }

    // ---------------------------------------------------------------------------------------------------------------
    // Common.flowLoading(host, { kind, label }) → { done(), fail(msg), el }
    //   A friendly placeholder inside the (otherwise empty) element a Checkout.com Flow / card-tokenizer component will be mounted into:
    //   shimmering rows shaped like what is coming (kind: 'card' | 'flow' | 'wallet') plus a short status line.
    //   idle → loading → ready | failed  (machine "flow-skeleton:<host id>", data-state on the placeholder).
    //   Call it BEFORE the backend request (that is the lag), pass  onReady: () => sk.done()  to CheckoutWebComponents, and sk.fail(msg) on error.
    //   Calling it again for a host that is already loading returns the same handle. Without an onReady the placeholder still goes away by itself:
    //   'card'/'flow' once the first iframe inside the host has loaded, 'wallet' once its button is in the DOM; and always after 25 s.
    //   Common.flowLoading.clear(host) empties a host but keeps the placeholder (use it instead of host.innerHTML = '').
    // ---------------------------------------------------------------------------------------------------------------
    const FLOW_SKEL = {
        initial: 'idle',
        states: { idle: { SHOW: 'loading' }, loading: { SHOW: 'loading', READY: 'ready', FAIL: 'failed' }, ready: { SHOW: 'loading' }, failed: { SHOW: 'loading' } },
    };
    const SKEL_LABEL = { card: 'Loading secure card form…', flow: 'Preparing secure payment options…', wallet: 'Checking wallet availability…' };
    const SKEL_ROWS = {
        card:   '<div class="fs-bar"></div><div class="fs-row"><div class="fs-bar"></div><div class="fs-bar"></div></div><div class="fs-bar fs-short"></div>',
        flow:   '<div class="fs-bar fs-tall"></div><div class="fs-bar fs-tall"></div><div class="fs-bar fs-tall"></div><div class="fs-bar fs-btn"></div>',
        wallet: '<div class="fs-bar fs-btn"></div>',
    };
    const skelNode = (n) => n && n.nodeType === 1 && n.classList.contains('flow-skel');

    function flowLoading(hostOrId, opts) {
        const host = typeof hostOrId === 'string' ? document.getElementById(hostOrId) : hostOrId;
        const noop = { el: null, done() {}, fail() {} };
        if (!host) return noop;
        const prev = host._flowLoading;
        if (prev && prev.active) {
            if (host.contains(prev.el)) return prev;                    // already loading here → same handle
            prev.done();                                                // its node was wiped with the container → start over
        }
        const kind = (opts && opts.kind) || 'card';
        const el = document.createElement('div');
        el.className = `flow-skel fs-${kind}`;
        el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite');
        el.innerHTML = `<div class="fs-head"><span class="fs-spin" aria-hidden="true"></span><span class="fs-label"></span></div>${SKEL_ROWS[kind] || SKEL_ROWS.card}`;
        el.querySelector('.fs-label').textContent = (opts && opts.label) || SKEL_LABEL[kind] || SKEL_LABEL.card;
        [...host.children].forEach(n => { if (skelNode(n)) n.remove(); });     // a leftover error / placeholder from an earlier attempt
        host.insertBefore(el, host.firstChild);

        const m = registry.get(`flow-skeleton:${host.id || 'host'}`) || machine(`flow-skeleton:${host.id || 'host'}`, FLOW_SKEL);
        m.bind(el); m.send('SHOW');
        let timer = null, mo = null;
        const cleanup = () => { clearTimeout(timer); if (mo) mo.disconnect(); handle.active = false; };
        const handle = {
            el, active: true,
            done() {
                if (!handle.active) return;
                cleanup(); m.send('READY');
                el.classList.add('fs-out');
                setTimeout(() => el.remove(), 200);                      // short fade, then gone
            },
            fail(msg) {
                if (!handle.active) return;
                cleanup(); m.send('FAIL');
                el.className = 'flow-skel fs-error'; el.setAttribute('role', 'alert');
                el.innerHTML = '<div class="fs-head"><span aria-hidden="true">⚠️</span><span class="fs-label"></span></div><div class="fs-hint"></div>';
                el.querySelector('.fs-label').textContent = 'The payment form could not be loaded';
                el.querySelector('.fs-hint').textContent = msg ? String(msg).slice(0, 200) : 'Please try again.';
            },
        };
        host._flowLoading = handle;
        // Fallbacks for callers that cannot pass onReady, and a hard cap so a placeholder never lingers.
        timer = setTimeout(() => handle.done(), 25000);
        if (typeof MutationObserver === 'function') {
            const watched = new WeakSet();
            const scan = () => {
                if (!handle.active) return;
                host.querySelectorAll('iframe').forEach(f => {
                    if (watched.has(f) || el.contains(f)) return;
                    watched.add(f);
                    if (kind !== 'wallet') f.addEventListener('load', () => setTimeout(() => handle.done(), 700), { once: true });
                });
                if (kind === 'wallet' && [...host.children].some(c => !skelNode(c) && (c.offsetHeight > 0 || c.childElementCount > 0 || /\S/.test(c.textContent)))) setTimeout(() => handle.done(), 300);
            };
            mo = new MutationObserver(scan);
            mo.observe(host, { childList: true, subtree: true });
        }
        return handle;
    }
    flowLoading.clear = function (hostOrId) {
        const host = typeof hostOrId === 'string' ? document.getElementById(hostOrId) : hostOrId;
        if (host) [...host.childNodes].forEach(n => { if (!skelNode(n)) n.remove(); });
    };

    Object.assign(window.Common, { machine, waitFor, waitForWebhook, busyStart, busy, flowLoading });
})();
