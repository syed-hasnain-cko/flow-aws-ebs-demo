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

    Object.assign(window.Common, { machine, waitFor, waitForWebhook });
})();
